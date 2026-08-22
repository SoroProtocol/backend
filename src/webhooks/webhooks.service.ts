import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }      from '@nestjs/config';
import { InjectRepository }   from '@nestjs/typeorm';
import { Repository }         from 'typeorm';
import { WebhookSubscriptionEntity } from './webhook-subscription.entity';
import { WebhookDeliveryEntity }     from './webhook-delivery.entity';
import { WebhookEvent }              from './webhook.entity';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger      = new Logger(WebhooksService.name);
  private readonly MAX_RETRIES: number;
  private readonly TIMEOUT_MS:  number;

  constructor(
    private config: ConfigService,
    @InjectRepository(WebhookSubscriptionEntity)
    private readonly subs: Repository<WebhookSubscriptionEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveries: Repository<WebhookDeliveryEntity>,
  ) {
    this.MAX_RETRIES = config.get<number>('WEBHOOK_MAX_RETRIES', 3);
    this.TIMEOUT_MS  = config.get<number>('WEBHOOK_TIMEOUT_MS', 5000);
  }

  async subscribe(url: string, events: WebhookEvent[], address: string): Promise<WebhookSubscriptionEntity> {
    const existing = await this.subs.findOne({ where: { url, address } });
    if (existing) return existing;

    const sub = this.subs.create({
      url,
      events,
      address,
      secret: crypto.randomBytes(32).toString('hex'),
    });
    return this.subs.save(sub);
  }

  async unsubscribe(id: number): Promise<boolean> {
    const result = await this.subs.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async getSubscriptionsByAddress(address: string): Promise<WebhookSubscriptionEntity[]> {
    return this.subs.find({ where: { address }, order: { createdAt: 'DESC' } });
  }

  async getSubscriptionById(id: number): Promise<WebhookSubscriptionEntity | null> {
    return this.subs.findOne({ where: { id } });
  }

  async dispatch(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    // PostgreSQL array contains query — exact match, no prefix false-positives
    const targets = await this.subs
      .createQueryBuilder('sub')
      .where('sub.active = true')
      .andWhere(':event = ANY(sub.events)', { event })
      .getMany();

    await Promise.allSettled(
      targets.map(sub => this.deliverWithRetry(sub, event, payload)),
    );
  }

  async getDeliveries(subscriptionId: number, page = 1, limit = 20): Promise<WebhookDeliveryEntity[]> {
    return this.deliveries.find({
      where: { subscriptionId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  private async deliverWithRetry(
    sub: WebhookSubscriptionEntity,
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

      await this.recordDelivery(sub.id, event, attempt, 'success', res.status, Date.now() - start);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.logger.log(`Webhook delivered: ${event} → ${sub.url}`);
    } catch (err) {
      await this.recordDelivery(sub.id, event, attempt, 'failed', undefined, Date.now() - start, String(err));

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

  private async recordDelivery(
    subscriptionId: number,
    event:          WebhookEvent,
    attempt:        number,
    status:         'success' | 'failed',
    httpStatus?:    number,
    durationMs:     number = 0,
    error?:         string,
  ): Promise<void> {
    const delivery = this.deliveries.create({
      subscriptionId,
      event,
      attempt,
      status,
      httpStatus: httpStatus ?? null,
      error: error ?? null,
      durationMs,
    });
    await this.deliveries.save(delivery);
  }

  private sign(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }
}
