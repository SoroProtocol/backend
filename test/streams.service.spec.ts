import { Test, TestingModule } from '@nestjs/testing';
import { StreamsService }      from '../src/streams/streams.service';
import { StreamStatus }        from '../src/streams/stream.entity';
import { NotFoundException }   from '@nestjs/common';

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
});
