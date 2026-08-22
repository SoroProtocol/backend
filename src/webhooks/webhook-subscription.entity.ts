import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('webhook_subscriptions')
export class WebhookSubscriptionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_webhook_address')
  @Column({ type: 'varchar', length: 56 })
  address: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', array: true, default: '{}' })
  events: string[];

  @Column({ type: 'varchar', length: 128 })
  secret: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
