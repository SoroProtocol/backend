import {
  Controller, Get, Post, Param, Body, Query,
  HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StreamsService }        from './streams.service';
import { CreateStreamDto }       from './dto/create-stream.dto';

const STELLAR_ADDR_RE = /^G[A-Z2-7]{55}$/;

@ApiTags('streams')
@Controller('streams')
export class StreamsController {
  constructor(private readonly streams: StreamsService) {}

  @Get()
  @ApiOperation({ summary: 'List streams, optionally filtered by address' })
  async findAll(@Query('address') address?: string) {
    return this.streams.findAll(address);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Aggregate stream stats for an address' })
  async analytics(@Query('address') address: string) {
    if (!address || !STELLAR_ADDR_RE.test(address)) {
      throw new BadRequestException('address must be a valid Stellar G-address');
    }
    const all = await this.streams.findAll(address);
    const active    = all.filter(s => s.status === 'active').length;
    const cancelled = all.filter(s => s.status === 'cancelled').length;
    const totalRate = all.reduce((sum, s) => sum + s.ratePerSecond, 0n);
    return { total: all.length, active, cancelled, totalRatePerSecond: totalRate.toString() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get stream by ID' })
  async findOne(@Param('id') id: string) {
    return this.streams.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Index a newly created stream' })
  async create(@Body() dto: CreateStreamDto) {
    return this.streams.create(dto, 'pending');
  }
}
