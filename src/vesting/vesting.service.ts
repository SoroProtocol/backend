import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { VestingScheduleEntity }               from './vesting.entity';
import { CreateVestingScheduleDto }            from './dto/create-vesting-schedule.dto';
import { ClaimVestingDto }                     from './dto/claim-vesting.dto';
import { claimableAmount }                     from './vesting-math';
import * as crypto from 'crypto';

@Injectable()
export class VestingService {
  // In production: swap with TypeORM / Prisma repository injection
  private readonly byId: Map<string, VestingScheduleEntity> = new Map();

  async create(dto: CreateVestingScheduleDto): Promise<VestingScheduleEntity> {
    const id = `vest-${crypto.randomUUID()}`;
    const entity: VestingScheduleEntity = {
      id,
      beneficiary: dto.beneficiary,
      token:       dto.token,
      totalAmount: BigInt(dto.totalAmount),
      startTime:   dto.startTime,
      cliffTime:   dto.cliffTime,
      endTime:     dto.endTime,
      claimed:     0n,
      revoked:     false,
      createdAt:   new Date(),
      updatedAt:   new Date(),
    };
    this.byId.set(id, entity);
    return entity;
  }

  async findAll(address?: string): Promise<VestingScheduleEntity[]> {
    const all = Array.from(this.byId.values());
    if (!address) return all;
    return all.filter(s => s.beneficiary === address);
  }

  async findOne(id: string): Promise<VestingScheduleEntity> {
    const schedule = this.byId.get(id);
    if (!schedule) throw new NotFoundException(`Vesting schedule ${id} not found`);
    return schedule;
  }

  async claim(
    id: string,
    dto: ClaimVestingDto,
    now: number = Math.floor(Date.now() / 1000),
  ): Promise<VestingScheduleEntity> {
    const schedule = await this.findOne(id);
    if (schedule.revoked) {
      throw new BadRequestException('Schedule has been revoked');
    }

    const claimable = claimableAmount(schedule, now);
    const amount = dto.amount !== undefined ? BigInt(dto.amount) : claimable;

    if (amount <= 0n) {
      throw new BadRequestException('Nothing to claim');
    }
    if (amount > claimable) {
      throw new BadRequestException('Amount exceeds vested and unclaimed balance');
    }

    schedule.claimed += amount;
    schedule.updatedAt = new Date();
    this.byId.set(id, schedule);
    return schedule;
  }
}
