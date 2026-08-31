import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum StreamStatus {
  ACTIVE    = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

const bigintTransformer = {
  to: (value: bigint | number | string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    return value.toString();
  },
  from: (value: string | number | null | undefined): bigint => {
    if (value === null || value === undefined) return 0n;
    return BigInt(value);
  },
};

const numberTransformer = {
  to: (value: number | bigint | string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    return value.toString();
  },
  from: (value: string | number | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    return Number(value);
  },
};

@Entity('streams')
export class StreamEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Index('idx_streams_contract_stream_id', { unique: true })
  @Column({
    name: 'contract_stream_id',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: any) => (v !== null && v !== undefined ? String(v) : null),
      from: (v: any) => (v !== null && v !== undefined ? String(v) : null),
    },
  })
  contractStreamId?: string;

  @Index('idx_streams_sender')
  @Column({ type: 'varchar', length: 56 })
  sender: string;

  @Index('idx_streams_recipient')
  @Column({ type: 'varchar', length: 56 })
  recipient: string;

  @Column({ type: 'varchar', length: 56, default: 'native' })
  token: string;

  @Column({
    name: 'rate_per_second',
    type: 'bigint',
    default: '0',
    transformer: bigintTransformer,
  })
  ratePerSecond: bigint;

  @Column({
    name: 'start_time',
    type: 'bigint',
    default: '0',
    transformer: numberTransformer,
  })
  startTime: number;

  @Column({
    name: 'stop_time',
    type: 'bigint',
    default: '0',
    transformer: numberTransformer,
  })
  stopTime: number;

  @Column({
    type: 'bigint',
    default: '0',
    transformer: bigintTransformer,
  })
  withdrawn: bigint;

  @Index('idx_streams_status')
  @Column({ type: 'varchar', length: 20, default: StreamStatus.ACTIVE })
  status: StreamStatus;

  @Column({ name: 'tx_hash', type: 'varchar', length: 64, default: '' })
  txHash?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
