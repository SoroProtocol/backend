import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }      from '@nestjs/config';
import { DatabaseService }    from '../database/database.service';
import { WebhookEvent, WebhookSubscription, WebhookDelivery } from './webhook.entity';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger      = new Logger(WebhooksService.name);
  private readonly MAX_RETRIES: number;
  private readonly TIMEOUT_MS:  number;

  constructor(
    private config: ConfigService,
    private db: DatabaseService,
  ) {
    this.MAX_RETRIES = config.get<number>('WEBHOOK_MAX_RETRIES', 3);
    this.TIMEOUT_MS  = config.get<number>('WEBHOOK_TIMEOUT_MS', 5000);
  }

  subscribe(url: string, events: WebhookEvent[], address: string): WebhookSubscription {
    const existing = this.db.db
      .prepare('SELECT * FROM webhook_subscriptions WHERE url = ? AND address = ?')
      .get(url, address) as any;
    if (existing) return this.rowToSubscription(existing);

    const id     = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('hex');
    const now    = new Date().toISOString();

    this.db.db
      .prepare('INSERT INTO webhook_subscriptions (id, url, events, secret, address, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, url, JSON.stringify(events), secret, address, now);

    return { id, url, events, secret, address, createdAt: new Date(now) };
  }

  unsubscribe(id: string): boolean {
    const result = this.db.db
      .prepare('DELETE FROM webhook_subscriptions WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  getSubscriptionsByAddress(address: string): WebhookSubscription[] {
    const rows = this.db.db
      .prepare('SELECT * FROM webhook_subscriptions WHERE address = ? ORDER BY created_at DESC')
      .all(address) as any[];
    return rows.map(r => this.rowToSubscription(r));
  }

  getSubscriptionById(id: string): WebhookSubscription | null {
    const row = this.db.db
      .prepare('SELECT * FROM webhook_subscriptions WHERE id = ?')
      .get(id) as any;
    return row ? this.rowToSubscription(row) : null;
  }

  async dispatch(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    // NOTE: LIKE with JSON-escaped event names works because our event names
    // use dots (e.g. "stream.created") which don't collide with JSON syntax.
    // If event names ever gain prefixes that share substrings, switch to a
    // junction table (webhook_subscription_events) for exact matching.
    const rows = this.db.db
      .prepare('SELECT * FROM webhook_subscriptions WHERE events LIKE ?')
      .all(`%"${event}"%`) as any[];
    const targets = rows.map(r => this.rowToSubscription(r));

    await Promise.allSettled(
      targets.map(sub => this.deliverWithRetry(sub, event, payload)),
    );
  }

  getDeliveries(subscriptionId: string, page = 1, limit = 20): WebhookDelivery[] {
    const offset = (page - 1) * limit;
    const rows = this.db.db
      .prepare('SELECT * FROM webhook_deliveries WHERE subscription_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(subscriptionId, limit, offset) as any[];
    return rows.map(r => this.rowToDelivery(r));
  }

  private async deliverWithRetry(
    sub: WebhookSubscription,
    event: WebhookEvent,
    payload: Record<string, unknown>,
    attempt = 0,
  ): Promise<void> {
    const body      = JSON.stringify({ event, data: payload, ts: Date.now() });
    const signature = this.sign(body, sub.secret);
    const start     = Date.now();

    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const res = await fetch(sub.url, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-SoroProtocol-Sig': signature,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      this.recordDelivery(sub.id, event, attempt, 'success', res.status, Date.now() - start);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.logger.log(`Webhook delivered: ${event} → ${sub.url}`);
    } catch (err) {
      this.recordDelivery(sub.id, event, attempt, 'failed', undefined, Date.now() - start, String(err));

      if (attempt < this.MAX_RETRIES - 1) {
        const jitter = Math.floor(crypto.randomInt(0, 500));
        const delay  = Math.pow(2, attempt) * 1000 + jitter;
        this.logger.warn(`Webhook retry ${attempt + 1}/${this.MAX_RETRIES} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return this.deliverWithRetry(sub, event, payload, attempt + 1);
      }
      this.logger.error(`Webhook failed after ${this.MAX_RETRIES} attempts: ${sub.url}`);
    }
  }

  private recordDelivery(
    subscriptionId: string,
    event:          WebhookEvent,
    attempt:        number,
    status:         'success' | 'failed',
    httpStatus?:    number,
    durationMs:     number = 0,
    error?:         string,
  ): void {
    const id  = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.db
      .prepare(
        `INSERT INTO webhook_deliveries
           (id, subscription_id, event, attempt, status, http_status, error, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, subscriptionId, event, attempt, status, httpStatus ?? null, error ?? null, durationMs, now);
  }

  private sign(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  private rowToSubscription(row: any): WebhookSubscription {
    return {
      id:        row.id,
      url:       row.url,
      events:    JSON.parse(row.events),
      secret:    row.secret,
      address:   row.address,
      createdAt: new Date(row.created_at),
    };
  }

  private rowToDelivery(row: any): WebhookDelivery {
    return {
      id:             row.id,
      subscriptionId: row.subscription_id,
      event:          row.event,
      attempt:        row.attempt,
      status:         row.status,
      httpStatus:     row.http_status,
      error:          row.error,
      durationMs:     row.duration_ms,
      createdAt:      new Date(row.created_at),
    };
  }
}
