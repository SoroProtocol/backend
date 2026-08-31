import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { VestingScheduleEntity } from './vesting.entity';
import { CreateVestingScheduleDto } from './dto/create-vesting-schedule.dto';
import { ClaimVestingDto } from './dto/claim-vesting.dto';
import { claimableAmount } from './vesting-math';
import { StellarService } from '../stellar/stellar.service';
import {
  Account,
  TransactionBuilder,
  Operation,
  SorobanRpc,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';

export interface ChainVestingData {
  contractScheduleId: string;
  funder?:            string;
  beneficiary:        string;
  token?:             string;
  totalAmount?:       bigint | number | string;
  startTime?:         number;
  cliffTime?:         number;
  endTime?:           number;
  claimed?:           bigint | number | string;
  revoked?:           boolean;
  txHash:             string;
}

@Injectable()
export class VestingService {
  private readonly logger = new Logger(VestingService.name);

  constructor(
    @InjectRepository(VestingScheduleEntity)
    private readonly repo: Repository<VestingScheduleEntity>,
    @Optional()
    private readonly stellar?: StellarService,
    @Optional()
    private readonly config?: ConfigService,
  ) {}

  async create(dto: CreateVestingScheduleDto, txHash = ''): Promise<VestingScheduleEntity> {
    const entity = this.repo.create({
      beneficiary: dto.beneficiary,
      token:       dto.token || 'native',
      totalAmount: BigInt(dto.totalAmount),
      startTime:   dto.startTime,
      cliffTime:   dto.cliffTime,
      endTime:     dto.endTime,
      claimed:     0n,
      revoked:     false,
      txHash:      txHash || '',
    });
    return this.repo.save(entity);
  }

  async upsertFromChain(data: ChainVestingData): Promise<VestingScheduleEntity> {
    const existing = await this.repo.findOne({
      where: { contractScheduleId: data.contractScheduleId },
    });

    if (existing) {
      if (data.funder) existing.funder = data.funder;
      if (data.beneficiary) existing.beneficiary = data.beneficiary;
      if (data.token) existing.token = data.token;
      if (data.totalAmount !== undefined) existing.totalAmount = BigInt(data.totalAmount);
      if (data.startTime !== undefined) existing.startTime = Number(data.startTime);
      if (data.cliffTime !== undefined) existing.cliffTime = Number(data.cliffTime);
      if (data.endTime !== undefined) existing.endTime = Number(data.endTime);
      if (data.claimed !== undefined) existing.claimed = BigInt(data.claimed);
      if (data.revoked !== undefined) existing.revoked = data.revoked;
      if (data.txHash) existing.txHash = data.txHash;
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      contractScheduleId: data.contractScheduleId,
      funder:             data.funder || '',
      beneficiary:        data.beneficiary,
      token:              data.token || 'native',
      totalAmount:        data.totalAmount !== undefined ? BigInt(data.totalAmount) : 0n,
      startTime:          data.startTime !== undefined ? Number(data.startTime) : 0,
      cliffTime:          data.cliffTime !== undefined ? Number(data.cliffTime) : 0,
      endTime:            data.endTime !== undefined ? Number(data.endTime) : 0,
      claimed:            data.claimed !== undefined ? BigInt(data.claimed) : 0n,
      revoked:            data.revoked ?? false,
      txHash:             data.txHash || '',
    });
    return this.repo.save(entity);
  }

  async findAll(address?: string): Promise<VestingScheduleEntity[]> {
    if (!address) {
      return this.repo.find({ order: { createdAt: 'DESC' } });
    }
    return this.repo.find({
      where: [
        { beneficiary: address },
        { funder: address },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<VestingScheduleEntity> {
    const conditions: any[] = [{ contractScheduleId: id }];
    conditions.push({ id });

    const schedule = await this.repo.findOne({ where: conditions });
    if (schedule) return schedule;

    const fromRpc = await this.fetchScheduleFromRpc(id);
    if (fromRpc) return fromRpc;

    throw new NotFoundException(`Vesting schedule ${id} not found`);
  }

  private async fetchScheduleFromRpc(id: string): Promise<VestingScheduleEntity | null> {
    if (!this.stellar || !this.config) return null;
    const contractId = this.config.get<string>('VESTING_CONTRACT_ID');
    if (!contractId) return null;

    try {
      const server = this.stellar.getSoroban();
      const numericId = BigInt(id.replace(/\D/g, '') || '0');
      const dummyAccount = new Account('GDPUCBX5NO5TGKFQVCUVJCJ55FD7FJF4X6O2ASPGLIZTDM4J5HJLSKMZ', '0');

      const tx = new TransactionBuilder(dummyAccount, {
        fee: '100',
        networkPassphrase: this.stellar.getNetwork(),
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: contractId,
            function: 'get_schedule',
            args: [nativeToScVal(numericId, { type: 'u64' })],
          })
        )
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      const retval = (sim as any)?.result?.retval;
      if (retval) {
        const val: any = scValToNative(retval);
        if (val) {
          return await this.upsertFromChain({
            contractScheduleId: id,
            funder:             val.funder ?? val.sender ?? val[0] ?? '',
            beneficiary:        val.beneficiary ?? val.recipient ?? val[1] ?? '',
            token:              val.token ?? val[2] ?? 'native',
            totalAmount:        BigInt(val.total_amount ?? val.totalAmount ?? val[3] ?? 0n),
            startTime:          Number(val.start_time ?? val.startTime ?? val[4] ?? 0),
            cliffTime:          Number(val.cliff_time ?? val.cliffTime ?? val[5] ?? 0),
            endTime:            Number(val.end_time ?? val.endTime ?? val[6] ?? 0),
            claimed:            BigInt(val.claimed ?? val[7] ?? 0n),
            revoked:            Boolean(val.revoked ?? false),
            txHash:             'chain-rpc',
          });
        }
      }
    } catch (err) {
      this.logger.debug(`RPC fallback failed for schedule ${id}: ${err}`);
    }
    return null;
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
    return this.repo.save(schedule);
  }

  async updateClaimedByContractId(contractScheduleId: string, amount: bigint): Promise<VestingScheduleEntity | null> {
    const schedule = await this.repo.findOne({ where: { contractScheduleId } });
    if (!schedule) {
      this.logger.warn(`updateClaimedByContractId: unknown contractScheduleId ${contractScheduleId}`);
      return null;
    }
    schedule.claimed += amount;
    return this.repo.save(schedule);
  }

  async updateRevokedByContractId(contractScheduleId: string, revoked = true): Promise<VestingScheduleEntity | null> {
    const schedule = await this.repo.findOne({ where: { contractScheduleId } });
    if (!schedule) {
      this.logger.warn(`updateRevokedByContractId: unknown contractScheduleId ${contractScheduleId}`);
      return null;
    }
    schedule.revoked = revoked;
    return this.repo.save(schedule);
  }
}
