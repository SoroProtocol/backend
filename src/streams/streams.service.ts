import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { StreamEntity, StreamStatus }             from './stream.entity';
import { CreateStreamDto }                        from './dto/create-stream.dto';
import * as crypto from 'crypto';

interface ChainStreamData {
  contractStreamId: string;
  sender:           string;
  recipient:        string;
  txHash:           string;
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
    if (!s) return;
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
    if (!s) return;
    s.withdrawn  = amount;
    s.updatedAt  = new Date();
  }
}
