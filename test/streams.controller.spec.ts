import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile }    from '@nestjs/common';
import { StreamsController } from '../src/streams/streams.controller';
import { StreamsService }    from '../src/streams/streams.service';

describe('StreamsController export', () => {
  let controller: StreamsController;
  let service: StreamsService;

  beforeEach(async () => {
    service = {
      exportCsv: jest.fn(),
      findAll: jest.fn(),
      findAllPaginated: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      createBatch: jest.fn(),
      extendStopTime: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamsController],
      providers:   [{ provide: StreamsService, useValue: service }],
    }).compile();

    controller = module.get(StreamsController);
  });

  it('returns a StreamableFile CSV attachment for the given address', async () => {
    const address = 'G' + 'A'.repeat(55);
    const body =
      'id,sender,recipient,token,rate,startTime,stopTime,withdrawn,status,createdAt\n';
    const spy = jest.spyOn(service, 'exportCsv').mockResolvedValue(body);

    const result = await controller.export({ address });

    expect(spy).toHaveBeenCalledWith(address);
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.options?.type).toBe('text/csv; charset=utf-8');
    expect(result.options?.disposition).toBe('attachment; filename="streams.csv"');
  });

  it('lists streams with pagination or all=true', async () => {
    const address = 'G' + 'A'.repeat(55);
    (service.findAllPaginated as jest.Mock).mockResolvedValue({
      data: [{ id: '1', sender: address }],
      page: 1,
      limit: 20,
      total: 1,
    });
    (service.findAll as jest.Mock).mockResolvedValue([{ id: '1', sender: address }]);

    const paginated = await controller.findAll({ address, page: 1, limit: 20 });
    expect(paginated).toEqual({ data: [{ id: '1', sender: address }], page: 1, limit: 20, total: 1 });

    const all = await controller.findAll({ address, all: 'true' });
    expect(all).toEqual([{ id: '1', sender: address }]);
  });

  it('returns stream analytics for an address', async () => {
    const address = 'G' + 'A'.repeat(55);
    (service.findAll as jest.Mock).mockResolvedValue([
      { id: '1', status: 'active', ratePerSecond: 100n },
      { id: '2', status: 'active', ratePerSecond: 200n },
      { id: '3', status: 'cancelled', ratePerSecond: 50n },
      { id: '4', status: 'completed', ratePerSecond: 30n },
    ]);

    const stats = await controller.analytics(address);
    expect(stats).toEqual({
      total: 4,
      active: 2,
      cancelled: 1,
      completed: 1,
      totalRatePerSecond: '300',
    });
  });

  it('retrieves a single stream by ID', async () => {
    (service.findOne as jest.Mock).mockResolvedValue({ id: 'stream-123', status: 'active' });
    const result = await controller.findOne('stream-123');
    expect(result).toEqual({ id: 'stream-123', status: 'active' });
  });

  it('extends stopTime for a stream', async () => {
    (service.extendStopTime as jest.Mock).mockResolvedValue({ id: 'stream-123', stopTime: 5000 });
    const result = await controller.extend('stream-123', { newStopTime: 5000 });
    expect(service.extendStopTime).toHaveBeenCalledWith('stream-123', 5000);
    expect(result).toEqual({ id: 'stream-123', stopTime: 5000 });
  });
});
