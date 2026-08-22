import { Controller, Post, Delete, Get, Body, Param, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation }                               from '@nestjs/swagger';
import { WebhooksService }                                     from './webhooks.service';
import { WebhookEvent }                                        from './webhook.entity';
import { IsString, IsArray, IsUrl }                            from 'class-validator';

const STELLAR_ADDR_RE = /^G[A-Z2-7]{55}$/;

class SubscribeDto {
  @IsString() @IsUrl()
  url: string;

  @IsArray()
  events: WebhookEvent[];

  @IsString()
  address: string;
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to stream events' })
  async subscribe(@Body() dto: SubscribeDto) {
    if (!STELLAR_ADDR_RE.test(dto.address)) {
      throw new BadRequestException('address must be a valid Stellar G-address');
    }
    return this.webhooks.subscribe(dto.url, dto.events, dto.address);
  }

  @Get()
  @ApiOperation({ summary: 'List webhook subscriptions for an address' })
  async listSubscriptions(@Query('address') address: string) {
    if (!address || !STELLAR_ADDR_RE.test(address)) {
      throw new BadRequestException('address must be a valid Stellar G-address');
    }
    return this.webhooks.getSubscriptionsByAddress(address);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Unsubscribe from events' })
  async unsubscribe(@Param('id') id: string, @Query('address') address: string) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      throw new BadRequestException('id must be a number');
    }
    if (!address || !STELLAR_ADDR_RE.test(address)) {
      throw new BadRequestException('address query parameter is required for ownership verification');
    }
    const sub = await this.webhooks.getSubscriptionById(numId);
    if (!sub || sub.address !== address) {
      throw new NotFoundException('Subscription not found');
    }
    const removed = await this.webhooks.unsubscribe(numId);
    return { success: removed };
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'List delivery attempts for a subscription' })
  async getDeliveries(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      throw new BadRequestException('id must be a number');
    }
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    return this.webhooks.getDeliveries(numId, p, l);
  }
}
