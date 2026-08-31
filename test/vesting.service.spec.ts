import { Test, TestingModule }                    from '@nestjs/testing';
import { getRepositoryToken }                      from '@nestjs/typeorm';
import { VestingService }                         from '../src/vesting/vesting.service';
import { VestingScheduleEntity }                  from '../src/vesting/vesting.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

function mockRepo<T extends { id?: any; createdAt?: any; updatedAt?: any }>() {
  const store: T[] = [];
  let nextId = 1;
  return {
    find: jest.fn().mockImplementation((opts?: any) => {
      let result = [...store];
      if (opts?.where) {
        if (Array.isArray(opts.where)) {
          result = result.filter((r: any) =>
            opts.where.some((cond: any) =>
              Object.entries(cond).every(([k, v]) => r[k] === v),
            ),
          );
        } else {
          result = result.filter((r: any) =>
            Object.entries(opts.where).every(([k, v]) => r[k] === v),
          );
        }
      }
      if (opts?.order?.createdAt === 'DESC') {
        result.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      if (opts?.skip) result = result.slice(opts.skip);
      if (opts?.take) result = result.slice(0, opts.take);
      return Promise.resolve(result);
    }),
    findOne: jest.fn().mockImplementation((opts?: any) => {
      if (!opts?.where) return Promise.resolve(null);
      if (Array.isArray(opts.where)) {
        for (const cond of opts.where) {
          const found = store.find((r: any) =>
            Object.entries(cond).every(([k, v]) => r[k] === v || (k === 'id' && String(r.id) === String(v))),
          );
          if (found) return Promise.resolve(found);
        }
        return Promise.resolve(null);
      }
      const found = store.find((r: any) =>
        Object.entries(opts.where).every(([k, v]) => r[k] === v || (k === 'id' && String(r.id) === String(v))),
      );
      return Promise.resolve(found ?? null);
    }),
    create: jest.fn().mockImplementation((data: any) => ({
      ...data,
      id: String(data.id ?? nextId++),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    save: jest.fn().mockImplementation((entity: any) => {
      if (!entity.id) entity.id = String(nextId++);
      if (!entity.createdAt) entity.createdAt = new Date();
      entity.updatedAt = new Date();
      const idx = store.findIndex((r: any) => String(r.id) === String(entity.id));
      if (idx >= 0) store[idx] = entity;
      else store.push(entity);
      return Promise.resolve(entity);
    }),
    delete: jest.fn().mockImplementation((id: any) => {
      const idx = store.findIndex((r: any) => String(r.id) === String(id));
      if (idx >= 0) { store.splice(idx, 1); return Promise.resolve({ affected: 1 }); }
      return Promise.resolve({ affected: 0 });
    }),
    _store: store,
  };
}

describe('VestingService', () => {
  let service: VestingService;
  let repo: ReturnType<typeof mockRepo>;

  const dto = {
    beneficiary: 'GABC1234567890123456789012345678901234567890123456789012',
    token:       'native',
    totalAmount: 1000,
    startTime:   0,
    cliffTime:   1000,
    endTime:     2000,
  };

  beforeEach(async () => {
    repo = mockRepo<VestingScheduleEntity>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VestingService,
        {
          provide:  getRepositoryToken(VestingScheduleEntity),
          useValue: repo,
        },
      ],
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

  describe('upsertFromChain & updates', () => {
    it('upserts a schedule from on-chain event data and updates claimed/revoked', async () => {
      const schedule = await service.upsertFromChain({
        contractScheduleId: '50',
        funder:             'G' + 'A'.repeat(55),
        beneficiary:        'G' + 'B'.repeat(55),
        token:              'native',
        totalAmount:        5000n,
        startTime:          100,
        cliffTime:          200,
        endTime:            300,
        txHash:             'tx-vest-1',
      });

      expect(schedule.contractScheduleId).toBe('50');
      expect(schedule.totalAmount).toBe(5000n);

      const claimed = await service.updateClaimedByContractId('50', 1000n);
      expect(claimed?.claimed).toBe(1000n);

      const revoked = await service.updateRevokedByContractId('50', true);
      expect(revoked?.revoked).toBe(true);
    });
  });

  describe('RPC fallback', () => {
    it('falls back to Soroban RPC when schedule not in DB', async () => {
      const { nativeToScVal, SorobanRpc } = require('@stellar/stellar-sdk');
      const scValRetval = nativeToScVal({
        funder:       'G' + 'A'.repeat(55),
        beneficiary:  'G' + 'B'.repeat(55),
        token:        'native',
        total_amount: 10000n,
        start_time:   100n,
        cliff_time:   200n,
        end_time:     300n,
        claimed:      0n,
        revoked:      false,
      });

      const mockSimulate = jest.fn().mockResolvedValue({
        result: { retval: scValRetval },
      });

      const dummyStellar = {
        getSoroban: () => ({
          simulateTransaction: mockSimulate,
        }),
        getNetwork: () => 'Test SDF Network ; September 2015',
      };
      const dummyConfig = {
        get: (key: string) => key === 'VESTING_CONTRACT_ID' ? 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4' : undefined,
      };

      const svcWithRpc = new VestingService(repo as any, dummyStellar as any, dummyConfig as any);
      jest.spyOn(SorobanRpc.Api, 'isSimulationSuccess').mockReturnValue(true);

      const result = await svcWithRpc.findOne('888');
      expect(result.contractScheduleId).toBe('888');
      expect(result.totalAmount).toBe(10000n);
      expect(result.beneficiary).toBe('G' + 'B'.repeat(55));
    });
  });
});
