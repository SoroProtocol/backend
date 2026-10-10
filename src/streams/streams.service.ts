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
import { StreamEntity, StreamStatus } from './stream.entity';
import { CreateStreamDto } from './dto/create-stream.dto';
import { CreateBatchStreamsDto, MAX_BATCH_SIZE } from './dto/create-batch-streams.dto';
import { StellarService } from '../stellar/stellar.service';
import {
  Account,
  TransactionBuilder,
  Operation,
  SorobanRpc,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import * as crypto from 'crypto';

export interface BatchEntryFailure {
  index:  number;
  errors: string[];
}

export interface ChainStreamData {
  contractStreamId: string;
  sender:           string;
  recipient:        string;
  token?:           string;
  ratePerSecond?:   bigint | number | string;
  startTime?:       number;
  stopTime?:        number;
  withdrawn?:       bigint | number | string;
  status?:          StreamStatus;
  txHash:           string;
}

export type StreamSortField = 'createdAt' | 'startTime' | 'stopTime' | 'ratePerSecond';
export type SortOrder = 'asc' | 'desc';

export interface ListStreamsOptions {
  page?:   number;
  limit?:  number;
  sortBy?: StreamSortField;
  order?:  SortOrder;
}

export interface PaginatedStreams {
  data:  StreamEntity[];
  page:  number;
  limit: number;
  total: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT      = 100;

/** Escape a single CSV field per RFC 4180 (quote when needed). */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function compareByField(a: StreamEntity, b: StreamEntity, field: StreamSortField): number {
  const av = a[field];
  const bv = b[field];
  if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime();
  if (typeof av === 'bigint' && typeof bv === 'bigint') return av < bv ? -1 : av > bv ? 1 : 0;
  return Number(av) - Number(bv);
}

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(
    @InjectRepository(StreamEntity)
    private readonly repo: Repository<StreamEntity>,
    @Optional()
    private readonly stellar?: StellarService,
    @Optional()
    private readonly config?: ConfigService,
  ) {}

  async create(dto: CreateStreamDto, txHash: string): Promise<StreamEntity> {
    const entity = this.repo.create({
      contractStreamId: undefined,
      sender:           dto.sender,
      recipient:        dto.recipient,
      token:            dto.token || 'native',
      ratePerSecond:    BigInt(dto.ratePerSecond),
      startTime:        dto.startTime,
      stopTime:         dto.stopTime,
      withdrawn:        0n,
      status:           StreamStatus.ACTIVE,
      txHash:           txHash || '',
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`Stream created: ${saved.id}`);
    return saved;
  }

  /**
   * Creates every stream in the batch under one sender, or none of them.
   * Every entry is validated up front; if any entry is invalid the whole
   * request is rejected with the full list of what failed and why, nothing
   * gets created, rather than creating the good entries and silently
   * dropping the bad ones.
   */
  async createBatch(dto: CreateBatchStreamsDto, txHash: string): Promise<StreamEntity[]> {
    if (dto.recipients.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`Batch size cannot exceed ${MAX_BATCH_SIZE} recipients, got ${dto.recipients.length}`);
    }

    const failures: BatchEntryFailure[] = [];
    dto.recipients.forEach((entry, index) => {
      const errors: string[] = [];
      if (entry.stopTime <= entry.startTime) {
        errors.push('stopTime must be after startTime');
      }
      if (errors.length > 0) {
        failures.push({ index, errors });
      }
    });

    if (failures.length > 0) {
      throw new BadRequestException({
        message: `${failures.length} of ${dto.recipients.length} entries failed validation`,
        failures,
      });
    }

    const created: StreamEntity[] = [];
    for (const entry of dto.recipients) {
      const stream = await this.create(
        {
          sender:        dto.sender,
          recipient:     entry.recipient,
          token:         entry.token,
          ratePerSecond: entry.ratePerSecond,
          startTime:     entry.startTime,
          stopTime:      entry.stopTime,
        },
        txHash,
      );
      created.push(stream);
    }
    return created;
  }

  async upsertFromChain(data: ChainStreamData): Promise<StreamEntity> {
    const existing = await this.repo.findOne({
      where: { contractStreamId: data.contractStreamId },
    });

    if (existing) {
      if (data.sender) existing.sender = data.sender;
      if (data.recipient) existing.recipient = data.recipient;
      if (data.token) existing.token = data.token;
      if (data.ratePerSecond !== undefined) existing.ratePerSecond = BigInt(data.ratePerSecond);
      if (data.startTime !== undefined) existing.startTime = Number(data.startTime);
      if (data.stopTime !== undefined) existing.stopTime = Number(data.stopTime);
      if (data.withdrawn !== undefined) existing.withdrawn = BigInt(data.withdrawn);
      if (data.status) existing.status = data.status;
      if (data.txHash) existing.txHash = data.txHash;
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      contractStreamId: data.contractStreamId,
      sender:           data.sender,
      recipient:        data.recipient,
      token:            data.token || 'native',
      ratePerSecond:    data.ratePerSecond !== undefined ? BigInt(data.ratePerSecond) : 0n,
      startTime:        data.startTime !== undefined ? Number(data.startTime) : 0,
      stopTime:         data.stopTime !== undefined ? Number(data.stopTime) : 0,
      withdrawn:        data.withdrawn !== undefined ? BigInt(data.withdrawn) : 0n,
      status:           data.status || StreamStatus.ACTIVE,
      txHash:           data.txHash || '',
    });
    return this.repo.save(entity);
  }

  async findAll(address?: string): Promise<StreamEntity[]> {
    if (!address) {
      return this.repo.find({ order: { createdAt: 'DESC' } });
    }
    return this.repo.find({
      where: [
        { sender: address },
        { recipient: address },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Builds a CSV document for every stream matching `address` (as sender or
   * recipient). Bigint fields are emitted as plain decimal strings so the
   * file opens cleanly in spreadsheet tools. An empty match set still yields
   * a valid header-only CSV.
   */
  async exportCsv(address: string): Promise<string> {
    const streams = await this.findAll(address);
    const header = [
      'id',
      'sender',
      'recipient',
      'token',
      'rate',
      'startTime',
      'stopTime',
      'withdrawn',
      'status',
      'createdAt',
    ];

    const rows = streams.map(s => [
      s.id,
      s.sender,
      s.recipient,
      s.token,
      s.ratePerSecond.toString(),
      String(s.startTime),
      String(s.stopTime),
      s.withdrawn.toString(),
      s.status,
      s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date(s.createdAt).toISOString(),
    ].map(csvEscape).join(','));

    return [header.join(','), ...rows].join('\n') + '\n';
  }

  async findAllPaginated(address: string | undefined, options: ListStreamsOptions = {}): Promise<PaginatedStreams> {
    const page   = options.page   ?? 1;
    const limit  = options.limit  ?? DEFAULT_LIMIT;
    const sortBy = options.sortBy ?? 'createdAt';
    const order  = options.order  ?? 'desc';

    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(`limit must be a positive integer between 1 and ${MAX_LIMIT}`);
    }

    const all    = await this.findAll(address);
    const sorted = [...all].sort((a, b) => {
      const cmp = compareByField(a, b, sortBy);
      return order === 'asc' ? cmp : -cmp;
    });

    const total = sorted.length;
    const start = (page - 1) * limit;

    return { data: sorted.slice(start, start + limit), page, limit, total };
  }

  async findOne(id: string): Promise<StreamEntity> {
    const conditions: any[] = [{ contractStreamId: id }];
    conditions.push({ id });

    const stream = await this.repo.findOne({ where: conditions });
    if (stream) return stream;

    const fromRpc = await this.fetchStreamFromRpc(id);
    if (fromRpc) return fromRpc;

    throw new NotFoundException(`Stream ${id} not found`);
  }

  private async fetchStreamFromRpc(id: string): Promise<StreamEntity | null> {
    if (!this.stellar || !this.config) return null;
    const contractId = this.config.get<string>('STREAM_CONTRACT_ID');
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
            function: 'get_stream',
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
            contractStreamId: id,
            sender:           val.sender ?? val[1] ?? '',
            recipient:        val.recipient ?? val[2] ?? '',
            token:            val.token ?? val[3] ?? 'native',
            ratePerSecond:    val.rate_per_second ?? val.ratePerSecond ?? val[4] ?? 0n,
            startTime:        Number(val.start_time ?? val.startTime ?? val[5] ?? 0),
            stopTime:         Number(val.stop_time ?? val.stopTime ?? val[6] ?? 0),
            withdrawn:        BigInt(val.withdrawn ?? val[7] ?? 0n),
            status:           val.status ?? StreamStatus.ACTIVE,
            txHash:           'chain-rpc',
          });
        }
      }
    } catch (err) {
      this.logger.debug(`RPC fallback failed for stream ${id}: ${err}`);
    }
    return null;
  }

  async updateStatus(id: string, status: StreamStatus): Promise<StreamEntity> {
    const s = await this.findOne(id);
    s.status = status;
    return this.repo.save(s);
  }

  async updateStatusByContractId(contractStreamId: string, status: StreamStatus): Promise<StreamEntity | null> {
    const s = await this.repo.findOne({ where: { contractStreamId } });
    if (!s) {
      this.logger.warn(`updateStatusByContractId: unknown contractStreamId ${contractStreamId}`);
      return null;
    }
    s.status = status;
    return this.repo.save(s);
  }

  async updateWithdrawn(id: string, amount: bigint): Promise<StreamEntity> {
    const s = await this.findOne(id);
    s.withdrawn = amount;
    return this.repo.save(s);
  }

  async updateWithdrawnByContractId(contractStreamId: string, amount: bigint): Promise<StreamEntity | null> {
    const s = await this.repo.findOne({ where: { contractStreamId } });
    if (!s) {
      this.logger.warn(`updateWithdrawnByContractId: unknown contractStreamId ${contractStreamId}`);
      return null;
    }
    s.withdrawn = amount;
    return this.repo.save(s);
  }

  /**
   * Extends the stopTime of an active stream.
   * Throws BadRequestException if the stream is not active or if newStopTime is not greater than current stopTime.
   */
  async extendStopTime(id: string, newStopTime: number): Promise<StreamEntity> {
    const s = await this.findOne(id);
    if (s.status !== StreamStatus.ACTIVE) {
      throw new BadRequestException(`Cannot extend stream with status '${s.status}'. Only active streams can be extended.`);
    }
    if (newStopTime <= s.stopTime) {
      throw new BadRequestException(
        `newStopTime (${newStopTime}) must be strictly greater than current stopTime (${s.stopTime})`,
      );
    }
    s.stopTime = newStopTime;
    const updated = await this.repo.save(s);
    this.logger.log(`Stream ${id} stopTime extended to ${newStopTime}`);
    return updated;
  }
}
