import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation }       from '@nestjs/swagger';
import { IsNumber, Min }               from 'class-validator';
import { IndexerService }              from './indexer.service';

class BackfillDto {
  @IsNumber() @Min(1)
  fromLedger: number;

  @IsNumber() @Min(1)
  toLedger: number;
}

@ApiTags('indexer')
@Controller('indexer')
export class IndexerController {
  constructor(private readonly indexer: IndexerService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get indexer status' })
  getStatus() {
    return this.indexer.getStatus();
  }

  @Post('backfill')
  @ApiOperation({ summary: 'Backfill events for a ledger range' })
  backfill(@Body() dto: BackfillDto) {
    return this.indexer.backfill(dto.fromLedger, dto.toLedger);
  }
}
