import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }      from '@nestjs/config';
import { WebhookEvent, WebhookSubscription, WebhookDelivery } from './webhook.entity';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger        = new Logger(WebhooksService.name);
  private readonly subscriptions = new Map<string, WebhookSubscription>();
  private readonly deliveries    = new Map<string, WebhookDelivery>();
  private readonly MAX_RETRIES:  number;
  private readonly TIMEOUT_MS:   number;

  constructor(private config: ConfigService) {
    this.MAX_RETRIES = config.get<number>('WEBHOOK_MAX_RETRIES', 3);
    this.TIMEOUT_MS  = config.get<number>('WEBHOOK_TIMEOUT_MS', 5000);
  }

  subscribe(url: string, events: WebhookEvent[], address: string): WebhookSubscription {
    const existing = Array.from(this.subscriptions.values())
      .find(s => s.url === url && s.address === address);
    if (existing) return existing;

    const sub: WebhookSubscription = {
      id:        crypto.randomUUID(),
      url,
      events,
      secret:    crypto.randomBytes(32).toString('hex'),
      address,
      createdAt: new Date(),
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  unsubscribe(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  async dispatch(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    const targets = Array.from(this.subscriptions.values())
      .filter(s => s.events.includes(event));

    await Promise.allSettled(
      targets.map(sub => this.deliverWithRetry(sub, event, payload)),
    );
  }

  getDeliveries(subscriptionId: string, page = 1, limit = 20): WebhookDelivery[] {
    const all = Array.from(this.deliveries.values())
      .filter(d => d.subscriptionId === subscriptionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (page - 1) * limit;
    return all.slice(start, start + limit);
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
    const delivery: WebhookDelivery = {
      id:             crypto.randomUUID(),
      subscriptionId,
      event,
      attempt,
      status,
      httpStatus,
      error,
      durationMs,
      createdAt:      new Date(),
    };
    this.deliveries.set(delivery.id, delivery);
  }

  private sign(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }
}
