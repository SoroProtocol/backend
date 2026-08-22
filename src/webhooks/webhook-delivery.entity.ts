import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { WebhookSubscriptionEntity } from './webhook-subscription.entity';

@Entity('webhook_deliveries')
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_webhook_deliveries_subscription_id')
  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

  @ManyToOne(() => WebhookSubscriptionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription: WebhookSubscriptionEntity;

  @Column({ type: 'varchar', length: 50 })
  event: string;

  @Column({ type: 'int', default: 0 })
  attempt: number;

  @Column({ type: 'varchar', length: 10 })
  status: 'success' | 'failed';

  @Column({ name: 'http_status', type: 'int', nullable: true })
  httpStatus: number | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
