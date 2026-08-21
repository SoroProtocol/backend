import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService }       from '@nestjs/config';
import { IndexerService }      from '../src/indexer/indexer.service';
import { StellarService }      from '../src/stellar/stellar.service';
import { StreamsService }      from '../src/streams/streams.service';
import { WebhooksService }     from '../src/webhooks/webhooks.service';
import { WebhookEvent }        from '../src/webhooks/webhook.entity';
import { SorobanRpc, nativeToScVal } from '@stellar/stellar-sdk';

function makeScSymbol(val: string) {
  return nativeToScVal(val, { type: 'symbol' });
}

function fakeEvent(txHash: string, eventName: string, data: unknown[]) {
  const { xdr } = require('@stellar/stellar-base');
  const scVals = data.map((v) => {
    if (typeof v === 'bigint') return nativeToScVal(v, { type: 'i128' });
    return nativeToScVal(v, { type: 'string' });
  });
  const vec = xdr.ScVal.scvVec(scVals);

  return {
    txHash,
    topic: [makeScSymbol(eventName)],
    value: vec,
    contractId: 'CSTREAM123456789012345678901234567890123456789012345678',
  } as unknown as SorobanRpc.Api.EventResponse;
}

describe('IndexerService', () => {
  let service: IndexerService;
  let mockGetEvents: jest.Mock;
  let mockDispatch: jest.Mock;

  beforeEach(async () => {
    mockGetEvents = jest.fn();
    mockDispatch = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        {
          provide: StellarService,
          useValue: { getSoroban: () => ({ getEvents: mockGetEvents, getLatestLedger: () => Promise.resolve({ sequence: 1000 }) }) },
        },
        {
          provide: StreamsService,
          useValue: {
            upsertFromChain: jest.fn().mockResolvedValue(undefined),
            updateWithdrawnByContractId: jest.fn().mockResolvedValue(undefined),
            updateStatusByContractId: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WebhooksService,
          useValue: { dispatch: mockDispatch },
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string, def?: unknown) => {
            if (key === 'STREAM_CONTRACT_ID') return 'CSTREAM123456789012345678901234567890123456789012345678';
            if (key === 'NODE_ENV') return 'test';
            return def;
          }},
        },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);
  });

  it('returns status with lastIndexedLedger and running flag', () => {
    const status = service.getStatus();
    expect(status).toEqual({ lastIndexedLedger: 0, running: false });
  });

  it('backfills events and dispatches webhooks', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        fakeEvent('tx001', 'StreamCreated', [1n, 'GA...', 'GB...', 100n]),
        fakeEvent('tx002', 'Withdrawn', [1n, 50n]),
      ],
    });

    const result = await service.backfill(100, 200);

    expect(result.processed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenCalledWith(WebhookEvent.STREAM_CREATED, expect.objectContaining({ streamId: '1' }));
    expect(mockDispatch).toHaveBeenCalledWith(WebhookEvent.STREAM_WITHDRAWN, expect.objectContaining({ streamId: '1' }));
  });

  it('skips already-processed transactions on overlapping backfill', async () => {
    // First backfill processes tx001
    mockGetEvents.mockResolvedValue({
      events: [
        fakeEvent('tx001', 'StreamCreated', [1n, 'GA...', 'GB...', 100n]),
      ],
    });
    await service.backfill(100, 150);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    mockDispatch.mockClear();

    // Second backfill overlaps — tx001 should be skipped
    mockGetEvents.mockResolvedValue({
      events: [
        fakeEvent('tx001', 'StreamCreated', [1n, 'GA...', 'GB...', 100n]),
        fakeEvent('tx002', 'Withdrawn', [1n, 50n]),
      ],
    });
    const result = await service.backfill(120, 200);

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    // Only tx002 should trigger a webhook
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(WebhookEvent.STREAM_WITHDRAWN, expect.objectContaining({ streamId: '1' }));
  });

  it('throws when STREAM_CONTRACT_ID is not set', async () => {
    const module = await Test.createTestingModule({
      providers: [
        IndexerService,
        { provide: StellarService, useValue: {} },
        { provide: StreamsService, useValue: {} },
        { provide: WebhooksService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    const svc = module.get<IndexerService>(IndexerService);
    await expect(svc.backfill(1, 100)).rejects.toThrow('STREAM_CONTRACT_ID not configured');
  });
});
