import { Controller, Post, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation }                  from '@nestjs/swagger';
import { WebhooksService }                        from './webhooks.service';
import { WebhookEvent }                           from './webhook.entity';
import { IsString, IsArray, IsUrl }               from 'class-validator';

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
}
