import { Test, TestingModule }  from '@nestjs/testing';
import { ConfigModule }         from '@nestjs/config';
import { WebhooksService }      from '../src/webhooks/webhooks.service';
import { WebhookEvent }         from '../src/webhooks/webhook.entity';

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports:   [ConfigModule.forRoot()],
      providers: [WebhooksService],
    }).compile();
    service = module.get<WebhooksService>(WebhooksService);
  });

  it('creates a subscription with a secret', () => {
    const sub = service.subscribe(
      'https://example.com/hook',
      [WebhookEvent.STREAM_CREATED],
      'GABC1234567890123456789012345678901234567890123456789012',
    );
    expect(sub.id).toBeDefined();
    expect(sub.secret).toHaveLength(64);
    expect(sub.events).toContain(WebhookEvent.STREAM_CREATED);
  });

  it('removes a subscription', () => {
    const sub     = service.subscribe('https://example.com/hook',
      [WebhookEvent.STREAM_CANCELLED], 'G' + 'A'.repeat(55));
    const removed = service.unsubscribe(sub.id);
    expect(removed).toBe(true);
  });

  it('returns false when unsubscribing unknown id', () => {
    expect(service.unsubscribe('nonexistent')).toBe(false);
  });

  it('records delivery attempts in the log', async () => {
    const addr = 'GABC1234567890123456789012345678901234567890123456789012';
    const sub  = service.subscribe('https://example.com/hook', [WebhookEvent.STREAM_CREATED], addr);

    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;

    await service.dispatch(WebhookEvent.STREAM_CREATED, { streamId: '123' });

    const deliveries = service.getDeliveries(sub.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe('success');
    expect(deliveries[0].httpStatus).toBe(200);
    expect(deliveries[0].event).toBe(WebhookEvent.STREAM_CREATED);

    jest.restoreAllMocks();
  });

  it('logs failed delivery attempts', async () => {
    const addr = 'GABC1234567890123456789012345678901234567890123456789012';
    const sub  = service.subscribe('https://example.com/hook', [WebhookEvent.STREAM_CREATED], addr);

    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as any;

    await service.dispatch(WebhookEvent.STREAM_CREATED, { streamId: '123' });

    const deliveries = service.getDeliveries(sub.id);
    expect(deliveries.length).toBeGreaterThan(1);
    expect(deliveries[0].status).toBe('failed');
    expect(deliveries[0].error).toContain('network error');

    jest.restoreAllMocks();
  });
});
