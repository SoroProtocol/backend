import {
  Controller, Get, Post, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StreamsService }  from './streams.service';
import { CreateStreamDto } from './dto/create-stream.dto';

@ApiTags('streams')
@Controller('streams')
export class StreamsController {
  constructor(private readonly streams: StreamsService) {}

  @Get()
  @ApiOperation({ summary: 'List streams for an address' })
  async findAll(@Query('address') address?: string) {
    return this.streams.findAll(address);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single stream by ID' })
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
