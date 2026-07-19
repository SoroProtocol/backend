import {
  Controller, Get, Post, Param, Body, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation }        from '@nestjs/swagger';
import { VestingService }               from './vesting.service';
import { VestingScheduleEntity }        from './vesting.entity';
import { CreateVestingScheduleDto }     from './dto/create-vesting-schedule.dto';
import { ClaimVestingDto }              from './dto/claim-vesting.dto';

// bigint fields can't go through JSON.stringify as-is, and the frontend's
// ApiVestingSchedule expects totalAmount/claimed as strings anyway.
function toApiSchedule(s: VestingScheduleEntity) {
  return {
    id:          s.id,
    beneficiary: s.beneficiary,
    token:       s.token,
    totalAmount: s.totalAmount.toString(),
    startTime:   s.startTime,
    cliffTime:   s.cliffTime,
    endTime:     s.endTime,
    claimed:     s.claimed.toString(),
    revoked:     s.revoked,
  };
}

@ApiTags('vesting')
@Controller('vesting')
export class VestingController {
  constructor(private readonly vesting: VestingService) {}

  @Get()
  @ApiOperation({ summary: 'List vesting schedules, optionally filtered by beneficiary' })
  async findAll(@Query('address') address?: string) {
    const schedules = await this.vesting.findAll(address);
    return schedules.map(toApiSchedule);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a vesting schedule by ID' })
  async findOne(@Param('id') id: string) {
    return toApiSchedule(await this.vesting.findOne(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a vesting schedule' })
  async create(@Body() dto: CreateVestingScheduleDto) {
    return toApiSchedule(await this.vesting.create(dto));
  }

  @Post(':id/claim')
  @ApiOperation({ summary: 'Claim vested tokens from a schedule' })
  async claim(@Param('id') id: string, @Body() dto: ClaimVestingDto) {
    return toApiSchedule(await this.vesting.claim(id, dto));
  }
}
