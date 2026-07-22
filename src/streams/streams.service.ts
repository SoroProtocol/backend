import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { StreamEntity, StreamStatus }             from './stream.entity';
import { CreateStreamDto }                        from './dto/create-stream.dto';
import * as crypto from 'crypto';

interface ChainStreamData {
  contractStreamId: string;
  sender:           string;
  recipient:        string;
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
  // In production: swap with TypeORM / Prisma repository injection
  private readonly byId:         Map<string, StreamEntity>   = new Map();
  private readonly byContractId: Map<string, StreamEntity>   = new Map();

  async create(dto: CreateStreamDto, txHash: string): Promise<StreamEntity> {
    const id = `stream-${crypto.randomUUID()}`;
    const entity: StreamEntity = {
      id,
      contractStreamId: '0',
      sender:           dto.sender,
      recipient:        dto.recipient,
      token:            dto.token,
      ratePerSecond:    BigInt(dto.ratePerSecond),
      startTime:        dto.startTime,
      stopTime:         dto.stopTime,
      withdrawn:        0n,
      status:           StreamStatus.ACTIVE,
      txHash,
      createdAt:        new Date(),
      updatedAt:        new Date(),
    };
    this.byId.set(id, entity);
    this.logger.log(`Stream created: ${id}`);
    return entity;
  }

  async upsertFromChain(data: ChainStreamData): Promise<StreamEntity> {
    const existing = this.byContractId.get(data.contractStreamId);
    if (existing) return existing;

    const id = `chain-${data.contractStreamId}`;
    const entity: StreamEntity = {
      id,
      contractStreamId: data.contractStreamId,
      sender:           data.sender,
      recipient:        data.recipient,
      token:            'native',
      ratePerSecond:    0n,
      startTime:        0,
      stopTime:         0,
      withdrawn:        0n,
      status:           StreamStatus.ACTIVE,
      txHash:           data.txHash,
      createdAt:        new Date(),
      updatedAt:        new Date(),
    };
    this.byId.set(id, entity);
    this.byContractId.set(data.contractStreamId, entity);
    return entity;
  }

  async findAll(address?: string): Promise<StreamEntity[]> {
    const all = Array.from(this.byId.values());
    if (!address) return all;
    return all.filter(s => s.sender === address || s.recipient === address);
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
    const stream = this.byId.get(id);
    if (!stream) throw new NotFoundException(`Stream ${id} not found`);
    return stream;
  }

  async updateStatus(id: string, status: StreamStatus): Promise<StreamEntity> {
    const s  = await this.findOne(id);
    s.status    = status;
    s.updatedAt = new Date();
    this.byId.set(id, s);
    return s;
  }

  async updateStatusByContractId(contractStreamId: string, status: StreamStatus) {
    const s = this.byContractId.get(contractStreamId);
    if (!s) {
      this.logger.warn(`updateStatusByContractId: unknown contractStreamId ${contractStreamId}`);
      return;
    }
    s.status    = status;
    s.updatedAt = new Date();
  }

  async updateWithdrawn(id: string, amount: bigint): Promise<StreamEntity> {
    const s  = await this.findOne(id);
    s.withdrawn  = amount;
    s.updatedAt  = new Date();
    this.byId.set(id, s);
    return s;
  }

  async updateWithdrawnByContractId(contractStreamId: string, amount: bigint) {
    const s = this.byContractId.get(contractStreamId);
    if (!s) {
      this.logger.warn(`updateWithdrawnByContractId: unknown contractStreamId ${contractStreamId}`);
      return;
    }
    s.withdrawn  = amount;
    s.updatedAt  = new Date();
  }
}
