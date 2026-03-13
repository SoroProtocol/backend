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
});
