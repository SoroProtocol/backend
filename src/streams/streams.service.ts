import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { StreamEntity, StreamStatus } from './stream.entity';
import { CreateStreamDto }            from './dto/create-stream.dto';

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);
  // In production: replace with TypeORM/Prisma repository
  private readonly store  = new Map<string, StreamEntity>();

  async create(dto: CreateStreamDto, txHash: string): Promise<StreamEntity> {
    const id = `stream-${Date.now()}`;
    const entity: StreamEntity = {
      id,
      contractStreamId: 0n,
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
    this.store.set(id, entity);
    this.logger.log(`Stream created: ${id}`);
    return entity;
  }

  async findAll(address?: string): Promise<StreamEntity[]> {
    const all = Array.from(this.store.values());
    if (!address) return all;
    return all.filter(s => s.sender === address || s.recipient === address);
  }

  async findOne(id: string): Promise<StreamEntity> {
    const stream = this.store.get(id);
    if (!stream) throw new NotFoundException(`Stream ${id} not found`);
    return stream;
  }

  async updateStatus(id: string, status: StreamStatus): Promise<StreamEntity> {
    const stream = await this.findOne(id);
    stream.status    = status;
    stream.updatedAt = new Date();
    this.store.set(id, stream);
    return stream;
  }

  async updateWithdrawn(id: string, amount: bigint): Promise<StreamEntity> {
    const stream = await this.findOne(id);
    stream.withdrawn  = amount;
    stream.updatedAt  = new Date();
    this.store.set(id, stream);
    return stream;
  }
}
