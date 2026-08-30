import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

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

@Entity('vesting_schedules')
export class VestingScheduleEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({
    name: 'contract_schedule_id',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: any) => (v !== null && v !== undefined ? String(v) : null),
      from: (v: any) => (v !== null && v !== undefined ? String(v) : null),
    },
  })
  contractScheduleId?: string;

  @Index('idx_vesting_funder')
  @Column({ type: 'varchar', length: 56, default: '' })
  funder?: string;

  @Index('idx_vesting_beneficiary')
  @Column({ type: 'varchar', length: 56 })
  beneficiary: string;

  @Column({ type: 'varchar', length: 56, default: 'native' })
  token: string;

  @Column({
    name: 'total_amount',
    type: 'bigint',
    default: '0',
    transformer: bigintTransformer,
  })
  totalAmount: bigint;

  @Column({
    name: 'start_time',
    type: 'bigint',
    default: '0',
    transformer: numberTransformer,
  })
  startTime: number;

  @Column({
    name: 'cliff_time',
    type: 'bigint',
    default: '0',
    transformer: numberTransformer,
  })
  cliffTime: number;

  @Column({
    name: 'end_time',
    type: 'bigint',
    default: '0',
    transformer: numberTransformer,
  })
  endTime: number;

  @Column({
    type: 'bigint',
    default: '0',
    transformer: bigintTransformer,
  })
  claimed: bigint;

  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @Column({ name: 'tx_hash', type: 'varchar', length: 64, default: '' })
  txHash?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
