import { Module }             from '@nestjs/common';
import { TypeOrmModule }      from '@nestjs/typeorm';
import { WebhooksService }    from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookSubscriptionEntity } from './webhook-subscription.entity';
import { WebhookDeliveryEntity }     from './webhook-delivery.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookSubscriptionEntity, WebhookDeliveryEntity]),
  ],
  controllers: [WebhooksController],
  providers:   [WebhooksService],
  exports:     [WebhooksService],
})
export class WebhooksModule {}
