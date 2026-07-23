import { Test, TestingModule } from '@nestjs/testing';
import { StreamsService }      from '../src/streams/streams.service';
import { StreamStatus }        from '../src/streams/stream.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('StreamsService', () => {
  let service: StreamsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StreamsService],
    }).compile();
    service = module.get<StreamsService>(StreamsService);
  });

  it('creates and retrieves a stream', async () => {
    const dto = {
      sender:    'GABC1234567890123456789012345678901234567890123456789012',
      recipient: 'GBOB1234567890123456789012345678901234567890123456789012',
      token:     'native',
      ratePerSecond: 100,
      startTime: 1000,
      stopTime:  2000,
    };
    const stream = await service.create(dto, 'tx123');
    expect(stream.sender).toBe(dto.sender);
    expect(stream.status).toBe(StreamStatus.ACTIVE);

    const found = await service.findOne(stream.id);
    expect(found.id).toBe(stream.id);
  });

  it('throws NotFoundException for missing stream', async () => {
    await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('updates stream status to cancelled', async () => {
    const dto = {
      sender: 'G' + 'A'.repeat(55), recipient: 'G' + 'B'.repeat(55),
      token: 'native', ratePerSecond: 100, startTime: 0, stopTime: 1000,
    };
    const stream  = await service.create(dto, 'tx456');
    const updated = await service.updateStatus(stream.id, StreamStatus.CANCELLED);
    expect(updated.status).toBe(StreamStatus.CANCELLED);
  });

  it('filters streams by address', async () => {
    const addr = 'GABC1234567890123456789012345678901234567890123456789012';
    const dto  = {
      sender: addr, recipient: 'G' + 'B'.repeat(55),
      token: 'native', ratePerSecond: 100, startTime: 0, stopTime: 1000,
    };
    await service.create(dto, 'tx789');
    const results = await service.findAll(addr);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every(s => s.sender === addr || s.recipient === addr)).toBe(true);
  });

  describe('findAllPaginated', () => {
    const baseDto = {
      sender: 'G' + 'A'.repeat(55), recipient: 'G' + 'B'.repeat(55),
      token: 'native', startTime: 0, stopTime: 1000,
    };

    async function seed(count: number) {
      for (let i = 0; i < count; i++) {
        await service.create({ ...baseDto, ratePerSecond: i + 1 }, `tx-${i}`);
      }
    }

    it('defaults to page 1 with a limit of 20', async () => {
      await seed(25);
      const result = await service.findAllPaginated(undefined);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(25);
      expect(result.data.length).toBe(20);
    });

    it('returns the remainder on the last page', async () => {
      await seed(25);
      const result = await service.findAllPaginated(undefined, { page: 2, limit: 20 });
      expect(result.page).toBe(2);
      expect(result.total).toBe(25);
      expect(result.data.length).toBe(5);
    });

    it('sorts by ratePerSecond ascending when asked', async () => {
      await seed(5);
      const result = await service.findAllPaginated(undefined, { sortBy: 'ratePerSecond', order: 'asc', limit: 5 });
      const rates = result.data.map(s => s.ratePerSecond);
      expect(rates).toEqual([1n, 2n, 3n, 4n, 5n]);
    });

    it('sorts by ratePerSecond descending when asked', async () => {
      await seed(5);
      const result = await service.findAllPaginated(undefined, { sortBy: 'ratePerSecond', order: 'desc', limit: 5 });
      const rates = result.data.map(s => s.ratePerSecond);
      expect(rates).toEqual([5n, 4n, 3n, 2n, 1n]);
    });

    it('sorts by createdAt descending by default, newest first', async () => {
      const older = await service.create({ ...baseDto, ratePerSecond: 1 }, 'tx-older');
      const newer = await service.create({ ...baseDto, ratePerSecond: 2 }, 'tx-newer');
      older.createdAt = new Date('2020-01-01T00:00:00.000Z');
      newer.createdAt = new Date('2024-01-01T00:00:00.000Z');

      const result = await service.findAllPaginated(undefined, { limit: 2 });
      expect(result.data[0].id).toBe(newer.id);
      expect(result.data[1].id).toBe(older.id);
    });

    it('still filters by address while paginating', async () => {
      const addr = 'GADDR' + 'X'.repeat(51);
      await service.create({ ...baseDto, sender: addr, ratePerSecond: 1 }, 'tx-a');
      await seed(3);
      const result = await service.findAllPaginated(addr, { limit: 10 });
      expect(result.total).toBe(1);
      expect(result.data[0].sender).toBe(addr);
    });

    it('rejects a page that is not a positive integer', async () => {
      await expect(service.findAllPaginated(undefined, { page: 0 })).rejects.toThrow(BadRequestException);
      await expect(service.findAllPaginated(undefined, { page: -1 })).rejects.toThrow(BadRequestException);
      await expect(service.findAllPaginated(undefined, { page: 1.5 })).rejects.toThrow(BadRequestException);
    });

    it('rejects a limit outside 1 to 100', async () => {
      await expect(service.findAllPaginated(undefined, { limit: 0 })).rejects.toThrow(BadRequestException);
      await expect(service.findAllPaginated(undefined, { limit: -5 })).rejects.toThrow(BadRequestException);
      await expect(service.findAllPaginated(undefined, { limit: 101 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('createBatch', () => {
    const sender = 'G' + 'S'.repeat(55);

    function recipient(letter: string, overrides: Partial<{
      token: string; ratePerSecond: number; startTime: number; stopTime: number;
    }> = {}) {
      return {
        recipient: 'G' + letter.repeat(55),
        token: 'native',
        ratePerSecond: 100,
        startTime: 1000,
        stopTime: 2000,
        ...overrides,
      };
    }

    it('creates every stream in an all-valid batch', async () => {
      const dto = { sender, recipients: [recipient('A'), recipient('B'), recipient('C')] };
      const streams = await service.createBatch(dto, 'tx-batch-1');

      expect(streams).toHaveLength(3);
      expect(streams.every(s => s.sender === sender)).toBe(true);
      expect(streams.map(s => s.recipient)).toEqual(dto.recipients.map(r => r.recipient));
      expect(streams.every(s => s.status === StreamStatus.ACTIVE)).toBe(true);

      const indexed = await service.findAll(sender);
      expect(indexed.length).toBe(3);
    });

    it('rejects the whole batch and creates nothing when one entry has stopTime before startTime', async () => {
      const dto = {
        sender,
        recipients: [
          recipient('A'),
          recipient('B', { startTime: 2000, stopTime: 1000 }), // the bad one
          recipient('C'),
        ],
      };

      await expect(service.createBatch(dto, 'tx-batch-2')).rejects.toThrow(BadRequestException);

      const indexed = await service.findAll(sender);
      expect(indexed.length).toBe(0);
    });

    it('reports the failing entry by index and reason', async () => {
      const dto = {
        sender,
        recipients: [recipient('A'), recipient('B', { startTime: 2000, stopTime: 2000 })],
      };

      try {
        await service.createBatch(dto, 'tx-batch-3');
        fail('expected createBatch to throw');
      } catch (err) {
        const response = (err as BadRequestException).getResponse() as { failures: Array<{ index: number; errors: string[] }> };
        expect(response.failures).toHaveLength(1);
        expect(response.failures[0].index).toBe(1);
        expect(response.failures[0].errors).toContain('stopTime must be after startTime');
      }
    });

    it('rejects a batch over the 100-recipient cap', async () => {
      const dto = {
        sender,
        recipients: Array.from({ length: 101 }, (_, i) => recipient('A', { ratePerSecond: i + 1 })),
      };

      await expect(service.createBatch(dto, 'tx-batch-4')).rejects.toThrow(BadRequestException);

      const indexed = await service.findAll(sender);
      expect(indexed.length).toBe(0);
    });
  });
});
