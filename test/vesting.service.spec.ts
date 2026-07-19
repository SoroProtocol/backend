import { Test, TestingModule }                    from '@nestjs/testing';
import { VestingService }                         from '../src/vesting/vesting.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('VestingService', () => {
  let service: VestingService;

  const dto = {
    beneficiary: 'GABC1234567890123456789012345678901234567890123456789012',
    token:       'native',
    totalAmount: 1000,
    startTime:   0,
    cliffTime:   1000,
    endTime:     2000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VestingService],
    }).compile();
    service = module.get<VestingService>(VestingService);
  });

  it('creates and retrieves a schedule', async () => {
    const schedule = await service.create(dto);
    expect(schedule.beneficiary).toBe(dto.beneficiary);
    expect(schedule.claimed).toBe(0n);
    expect(schedule.revoked).toBe(false);

    const found = await service.findOne(schedule.id);
    expect(found.id).toBe(schedule.id);
  });

  it('throws NotFoundException for a missing schedule', async () => {
    await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('filters schedules by beneficiary', async () => {
    await service.create(dto);
    const results = await service.findAll(dto.beneficiary);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every(s => s.beneficiary === dto.beneficiary)).toBe(true);
  });

  it('rejects a claim before the cliff', async () => {
    const schedule = await service.create(dto);
    await expect(service.claim(schedule.id, {}, 500)).rejects.toThrow(BadRequestException);
  });

  it('claims the full vested amount when no amount is given', async () => {
    const schedule = await service.create(dto);
    const claimed  = await service.claim(schedule.id, {}, 1500);
    expect(claimed.claimed).toBe(500n);
  });

  it('rejects a claim that exceeds the vested-and-unclaimed balance', async () => {
    const schedule = await service.create(dto);
    await expect(
      service.claim(schedule.id, { amount: 999 }, 1500),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows claiming in increments up to the vested balance', async () => {
    const schedule = await service.create(dto);
    await service.claim(schedule.id, { amount: 200 }, 1500);
    const second = await service.claim(schedule.id, { amount: 300 }, 1500);
    expect(second.claimed).toBe(500n);
  });

  it('rejects claiming on a revoked schedule', async () => {
    const schedule = await service.create(dto);
    schedule.revoked = true;
    await expect(service.claim(schedule.id, {}, 1500)).rejects.toThrow(BadRequestException);
  });
});
