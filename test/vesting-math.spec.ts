import { vestedAmount, claimableAmount } from '../src/vesting/vesting-math';
import { VestingScheduleEntity }         from '../src/vesting/vesting.entity';

function schedule(overrides: Partial<VestingScheduleEntity> = {}): VestingScheduleEntity {
  return {
    id:          'vest-1',
    beneficiary: 'G' + 'A'.repeat(55),
    token:       'native',
    totalAmount: 1000n,
    startTime:   0,
    cliffTime:   1000,
    endTime:     2000,
    claimed:     0n,
    revoked:     false,
    createdAt:   new Date(),
    updatedAt:   new Date(),
    ...overrides,
  };
}

describe('vestedAmount', () => {
  it('is 0 before the cliff', () => {
    const s = schedule();
    expect(vestedAmount(s, 500)).toBe(0n);
    expect(vestedAmount(s, 999)).toBe(0n);
  });

  it('vests linearly between the cliff and the end date', () => {
    const s = schedule({ cliffTime: 1000, endTime: 2000, totalAmount: 1000n });
    expect(vestedAmount(s, 1000)).toBe(0n);
    expect(vestedAmount(s, 1500)).toBe(500n);
    expect(vestedAmount(s, 1750)).toBe(750n);
  });

  it('is fully vested at and after the end date', () => {
    const s = schedule();
    expect(vestedAmount(s, 2000)).toBe(1000n);
    expect(vestedAmount(s, 5000)).toBe(1000n);
  });

  it('is fully vested immediately when cliff and end coincide', () => {
    const s = schedule({ cliffTime: 1000, endTime: 1000, totalAmount: 1000n });
    expect(vestedAmount(s, 1000)).toBe(1000n);
    expect(vestedAmount(s, 5000)).toBe(1000n);
  });

  it('freezes at the claimed amount once revoked, regardless of time', () => {
    const s = schedule({ revoked: true, claimed: 300n });
    expect(vestedAmount(s, 1500)).toBe(300n);
    expect(vestedAmount(s, 5000)).toBe(300n);
  });
});

describe('claimableAmount', () => {
  it('is the vested amount minus what has already been claimed', () => {
    const s = schedule({ cliffTime: 1000, endTime: 2000, totalAmount: 1000n, claimed: 200n });
    expect(claimableAmount(s, 1500)).toBe(300n);
  });

  it('never goes negative', () => {
    const s = schedule({ cliffTime: 1000, endTime: 2000, totalAmount: 1000n, claimed: 1000n });
    expect(claimableAmount(s, 1200)).toBe(0n);
  });

  it('is 0 for a revoked schedule with nothing left unclaimed', () => {
    const s = schedule({ revoked: true, claimed: 300n });
    expect(claimableAmount(s, 5000)).toBe(0n);
  });
});
