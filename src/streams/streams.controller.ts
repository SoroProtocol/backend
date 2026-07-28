import {
  Controller, Get, Post, Param, Body, Query, StreamableFile,
  HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProduces } from '@nestjs/swagger';
import { StreamsService }        from './streams.service';
import { CreateStreamDto }       from './dto/create-stream.dto';
import { CreateBatchStreamsDto } from './dto/create-batch-streams.dto';
import { ListStreamsDto }        from './dto/list-streams.dto';
import { ExportStreamsDto }      from './dto/export-streams.dto';

const STELLAR_ADDR_RE = /^G[A-Z2-7]{55}$/;

@ApiTags('streams')
@Controller('streams')
export class StreamsController {
  constructor(private readonly streams: StreamsService) {}

  @Get()
  @ApiOperation({ summary: 'List streams, paginated and sorted newest-first by default. Pass all=true for the old unbounded flat-array response' })
  async findAll(@Query() query: ListStreamsDto) {
    if (query.all === 'true') {
      return this.streams.findAll(query.address);
    }
    return this.streams.findAllPaginated(query.address, {
      page:   query.page,
      limit:  query.limit,
      sortBy: query.sortBy,
      order:  query.order,
    });
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
    const completed = all.filter(s => s.status === 'completed').length;
    const totalRate = all
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + s.ratePerSecond, 0n);
    return { total: all.length, active, cancelled, completed, totalRatePerSecond: totalRate.toString() };
  }

  @Get('export')
  @ApiOperation({
    summary: 'Download stream history as a CSV file for a Stellar address',
    description:
      'Returns matching streams (sender or recipient) as a CSV attachment. ' +
      '`address` is required. `rate` and `withdrawn` are plain decimal strings. ' +
      'An empty result set still returns a valid header-only CSV.',
  })
  @ApiProduces('text/csv')
  async export(@Query() query: ExportStreamsDto): Promise<StreamableFile> {
    const csv = await this.streams.exportCsv(query.address);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type:        'text/csv; charset=utf-8',
      disposition: 'attachment; filename="streams.csv"',
    });
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

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Index multiple streams from one sender at once, e.g. a payroll payout to several recipients. Validates every entry before creating any of them' })
  async createBatch(@Body() dto: CreateBatchStreamsDto) {
    return this.streams.createBatch(dto, 'pending');
  }
}
