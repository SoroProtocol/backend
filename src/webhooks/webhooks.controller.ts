import { Controller, Post, Delete, Get, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation }                               from '@nestjs/swagger';
import { WebhooksService }                                     from './webhooks.service';
import { WebhookEvent }                                        from './webhook.entity';
import { IsString, IsArray, IsUrl }                            from 'class-validator';

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
  subscribe(@Body() dto: SubscribeDto) {
    return this.webhooks.subscribe(dto.url, dto.events, dto.address);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Unsubscribe from events' })
  unsubscribe(@Param('id') id: string) {
    const removed = this.webhooks.unsubscribe(id);
    return { success: removed };
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'List delivery attempts for a subscription' })
  getDeliveries(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    return this.webhooks.getDeliveries(id, p, l);
  }
}
