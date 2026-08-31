import { Test, TestingModule } from '@nestjs/testing';
import { VestingController }    from '../src/vesting/vesting.controller';
import { VestingService }       from '../src/vesting/vesting.service';

describe('VestingController', () => {
  let controller: VestingController;
  let service: Partial<Record<keyof VestingService, jest.Mock>>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create:  jest.fn(),
      claim:   jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VestingController],
      providers:   [{ provide: VestingService, useValue: service }],
    }).compile();

    controller = module.get(VestingController);
  });

  it('lists vesting schedules for an address', async () => {
    const address = 'G' + 'A'.repeat(55);
    (service.findAll as jest.Mock).mockResolvedValue([
      {
        id:          'vest-1',
        beneficiary: address,
        token:       'native',
        totalAmount: 1000n,
        startTime:   100,
        cliffTime:   200,
        endTime:     300,
        claimed:     0n,
        revoked:     false,
      },
    ]);

    const result = await controller.findAll(address);
    expect(result).toEqual([
      {
        id:          'vest-1',
        beneficiary: address,
        token:       'native',
        totalAmount: '1000',
        startTime:   100,
        cliffTime:   200,
        endTime:     300,
        claimed:     '0',
        revoked:     false,
      },
    ]);
  });

  it('retrieves a single vesting schedule by ID', async () => {
    (service.findOne as jest.Mock).mockResolvedValue({
      id:          'vest-1',
      beneficiary: 'G' + 'B'.repeat(55),
      token:       'native',
      totalAmount: 5000n,
      startTime:   100,
      cliffTime:   200,
      endTime:     300,
      claimed:     1000n,
      revoked:     false,
    });

    const result = await controller.findOne('vest-1');
    expect(result).toEqual({
      id:          'vest-1',
      beneficiary: 'G' + 'B'.repeat(55),
      token:       'native',
      totalAmount: '5000',
      startTime:   100,
      cliffTime:   200,
      endTime:     300,
      claimed:     '1000',
      revoked:     false,
    });
  });
});
