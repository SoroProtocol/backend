import { Test, TestingModule }  from '@nestjs/testing';
import { ConfigModule }         from '@nestjs/config';
import { WebhooksService }      from '../src/webhooks/webhooks.service';
import { WebhookEvent }         from '../src/webhooks/webhook.entity';
import { DatabaseService }      from '../src/database/database.service';

// Mock better-sqlite3 for unit tests
jest.mock('better-sqlite3', () => {
  const tables: Record<string, any[]> = {};

  function resetTables() {
    tables.webhook_subscriptions = [];
    tables.webhook_deliveries = [];
  }

  const fakeDb = {
    pragma: jest.fn(),
    exec: jest.fn(),
    prepare: jest.fn((sql: string) => {
      const getOp = (...args: any[]) => {
        if (sql.includes('FROM webhook_subscriptions WHERE url = ? AND address = ?')) {
          return tables.webhook_subscriptions?.find(r => r.url === args[0] && r.address === args[1]);
        }
        return undefined;
      };

      const allOp = (...args: any[]) => {
        if (sql.includes('FROM webhook_subscriptions WHERE address = ?')) {
          return (tables.webhook_subscriptions ?? []).filter(r => r.address === args[0]);
        }
        if (sql.includes('FROM webhook_subscriptions WHERE events LIKE ?')) {
          const pattern = args[0] as string;
          const eventName = pattern.match(/%"(.+)"%/)?.[1];
          return (tables.webhook_subscriptions ?? []).filter(r => {
            const events = JSON.parse(r.events);
            return events.includes(eventName);
          });
        }
        if (sql.includes('FROM webhook_deliveries WHERE subscription_id = ?')) {
          return (tables.webhook_deliveries ?? [])
            .filter(r => r.subscription_id === args[0])
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(args[2] ?? 0, (args[2] ?? 0) + (args[1] ?? 20));
        }
        return [];
      };

      const runOp = (...args: any[]) => {
        if (sql.includes('INSERT INTO webhook_subscriptions')) {
          tables.webhook_subscriptions.push({
            id: args[0], url: args[1], events: args[2], secret: args[3], address: args[4], created_at: args[5],
          });
          return { changes: 1 };
        }
        if (sql.includes('INSERT INTO webhook_deliveries')) {
          tables.webhook_deliveries.push({
            id: args[0], subscription_id: args[1], event: args[2], attempt: args[3],
            status: args[4], http_status: args[5], error: args[6], duration_ms: args[7], created_at: args[8],
          });
          return { changes: 1 };
        }
        if (sql.includes('DELETE FROM webhook_subscriptions')) {
          const idx = (tables.webhook_subscriptions ?? []).findIndex(r => r.id === args[0]);
          if (idx >= 0) tables.webhook_subscriptions.splice(idx, 1);
          return { changes: idx >= 0 ? 1 : 0 };
        }
        return { changes: 0 };
      };

      return { get: getOp, all: allOp, run: runOp };
    }),
    close: jest.fn(),
  };

  return {
    default: jest.fn(() => {
      resetTables();
      return fakeDb;
    }),
    __esModule: true,
  };
});

describe('WebhooksService', () => {
  let service: WebhooksService;
  let db: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports:   [ConfigModule.forRoot()],
      providers: [WebhooksService, DatabaseService],
    }).compile();
    service = module.get<WebhooksService>(WebhooksService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    db.db.close();
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

  it('lists subscriptions by address', () => {
    const addr = 'GABC1234567890123456789012345678901234567890123456789012';
    service.subscribe('https://example.com/hook1', [WebhookEvent.STREAM_CREATED], addr);
    service.subscribe('https://example.com/hook2', [WebhookEvent.STREAM_WITHDRAWN], addr);

    const subs = service.getSubscriptionsByAddress(addr);
    expect(subs).toHaveLength(2);
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
