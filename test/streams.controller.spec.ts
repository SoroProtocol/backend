import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile }    from '@nestjs/common';
import { StreamsController } from '../src/streams/streams.controller';
import { StreamsService }    from '../src/streams/streams.service';

describe('StreamsController export', () => {
  let controller: StreamsController;
  let service: StreamsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamsController],
      providers:   [StreamsService],
    }).compile();

    controller = module.get(StreamsController);
    service    = module.get(StreamsService);
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
});
