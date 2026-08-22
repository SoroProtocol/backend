import { Test, TestingModule }  from '@nestjs/testing';
import { ConfigModule }         from '@nestjs/config';
import { getRepositoryToken }   from '@nestjs/typeorm';
import { WebhooksService }      from '../src/webhooks/webhooks.service';
import { WebhookEvent }         from '../src/webhooks/webhook.entity';
import { WebhookSubscriptionEntity } from '../src/webhooks/webhook-subscription.entity';
import { WebhookDeliveryEntity }     from '../src/webhooks/webhook-delivery.entity';
import { Repository }           from 'typeorm';

function mockRepo<T extends { id?: number }>() {
  const store: T[] = [];
  let nextId = 1;
  return {
    find: jest.fn().mockImplementation((opts?: any) => {
      let result = [...store];
      if (opts?.where?.address) result = result.filter((r: any) => r.address === opts.where.address);
      if (opts?.where?.subscriptionId) result = result.filter((r: any) => r.subscriptionId === opts.where.subscriptionId);
      if (opts?.order?.createdAt === 'DESC') result.reverse();
      if (opts?.skip) result = result.slice(opts.skip);
      if (opts?.take) result = result.slice(0, opts.take);
      return Promise.resolve(result);
    }),
    findOne: jest.fn().mockImplementation((opts?: any) => {
      if (opts?.where?.id !== undefined) {
        return Promise.resolve(store.find((r: any) => r.id === opts.where.id) ?? null);
      }
      if (opts?.where?.url && opts?.where?.address) {
        return Promise.resolve(store.find((r: any) => r.url === opts.where.url && r.address === opts.where.address) ?? null);
      }
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation((data: any) => ({
      ...data,
      id: nextId++,
      createdAt: new Date(),
    })),
    save: jest.fn().mockImplementation((entity: any) => {
      if (!entity.id) entity.id = nextId++;
      if (!entity.createdAt) entity.createdAt = new Date();
      const idx = store.findIndex((r: any) => r.id === entity.id);
      if (idx >= 0) store[idx] = entity;
      else store.push(entity);
      return Promise.resolve(entity);
    }),
    delete: jest.fn().mockImplementation((id: number) => {
      const idx = store.findIndex((r: any) => r.id === id);
      if (idx >= 0) { store.splice(idx, 1); return Promise.resolve({ affected: 1 }); }
      return Promise.resolve({ affected: 0 });
    }),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(() => Promise.resolve(store)),
    }),
    _store: store,
  } as unknown as Repository<any>;
}

describe('WebhooksService', () => {
  let service: WebhooksService;
  let subsRepo: ReturnType<typeof mockRepo>;
  let delRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    subsRepo = mockRepo<WebhookSubscriptionEntity>();
    delRepo = mockRepo<WebhookDeliveryEntity>();

    const module: TestingModule = await Test.createTestingModule({
      imports:   [ConfigModule.forRoot()],
      providers: [
        WebhooksService,
        { provide: getRepositoryToken(WebhookSubscriptionEntity), useValue: subsRepo },
        { provide: getRepositoryToken(WebhookDeliveryEntity), useValue: delRepo },
      ],
    }).compile();
    service = module.get<WebhooksService>(WebhooksService);
  });

  it('creates a subscription with a secret', async () => {
    const sub = await service.subscribe(
      'https://example.com/hook',
      [WebhookEvent.STREAM_CREATED],
      'GABC1234567890123456789012345678901234567890123456789012',
    );
    expect(sub.id).toBeDefined();
    expect(sub.secret).toHaveLength(64);
    expect(sub.events).toContain(WebhookEvent.STREAM_CREATED);
  });

  it('removes a subscription', async () => {
    const sub = await service.subscribe('https://example.com/hook',
      [WebhookEvent.STREAM_CANCELLED], 'G' + 'A'.repeat(55));
    const removed = await service.unsubscribe(sub.id);
    expect(removed).toBe(true);
  });

  it('returns false when unsubscribing unknown id', async () => {
    expect(await service.unsubscribe(999)).toBe(false);
  });

  it('lists subscriptions by address', async () => {
    const addr = 'GABC1234567890123456789012345678901234567890123456789012';
    await service.subscribe('https://example.com/hook1', [WebhookEvent.STREAM_CREATED], addr);
    await service.subscribe('https://example.com/hook2', [WebhookEvent.STREAM_WITHDRAWN], addr);

    const subs = await service.getSubscriptionsByAddress(addr);
    expect(subs).toHaveLength(2);
  });

  it('records delivery attempts in the log', async () => {
    const addr = 'GABC1234567890123456789012345678901234567890123456789012';
    const sub  = await service.subscribe('https://example.com/hook', [WebhookEvent.STREAM_CREATED], addr);

    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;

    await service.dispatch(WebhookEvent.STREAM_CREATED, { streamId: '123' });

    const deliveries = await service.getDeliveries(sub.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe('success');
    expect(deliveries[0].httpStatus).toBe(200);
    expect(deliveries[0].event).toBe(WebhookEvent.STREAM_CREATED);

    jest.restoreAllMocks();
  });

  it('logs failed delivery attempts', async () => {
    const addr = 'GABC1234567890123456789012345678901234567890123456789012';
    const sub  = await service.subscribe('https://example.com/hook', [WebhookEvent.STREAM_CREATED], addr);

    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as any;

    await service.dispatch(WebhookEvent.STREAM_CREATED, { streamId: '123' });

    const deliveries = await service.getDeliveries(sub.id);
    expect(deliveries.length).toBeGreaterThan(1);
    expect(deliveries[0].status).toBe('failed');
    expect(deliveries[0].error).toContain('network error');

    jest.restoreAllMocks();
  });
});
