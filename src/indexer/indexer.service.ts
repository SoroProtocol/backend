import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService }  from '@nestjs/config';
import { StellarService } from '../stellar/stellar.service';
import { StreamsService } from '../streams/streams.service';
import { VestingService } from '../vesting/vesting.service';
import { WebhooksService }from '../webhooks/webhooks.service';
import { WebhookEvent }   from '../webhooks/webhook.entity';
import { StreamStatus }   from '../streams/stream.entity';
import { SorobanRpc, scValToNative } from '@stellar/stellar-sdk';

const POLL_INTERVAL_MS = 5_000;
const LEDGERS_PER_PAGE = 100;

@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger        = new Logger(IndexerService.name);
  private lastIndexedLedger      = 0;
  private readonly processedTxs  = new Set<string>();
  private running                = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly stellar:  StellarService,
    private readonly streams:  StreamsService,
    private readonly vesting:  VestingService,
    private readonly webhooks: WebhooksService,
    private readonly config:   ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get('NODE_ENV') !== 'test') {
      void this.startPolling();
    }
  }

  onModuleDestroy() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  async startPolling() {
    this.running = true;
    this.logger.log('Soroban event indexer started');
    await this.poll();
  }

  private async poll() {
    if (!this.running) return;
    try {
      await this.indexNewLedgers();
    } catch (err) {
      this.logger.error('Indexer poll error', err);
    }
    if (this.running) {
      this.timer = setTimeout(() => void this.poll(), POLL_INTERVAL_MS);
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  getStatus() {
    return {
      lastIndexedLedger: this.lastIndexedLedger,
      running:           this.running,
    };
  }

  // ── Backfill ────────────────────────────────────────────────────────────────

  async backfill(fromLedger: number, toLedger: number, contractId?: string): Promise<{ processed: number; skipped: number }> {
    const streamContractId  = this.config.get<string>('STREAM_CONTRACT_ID');
    const vestingContractId = this.config.get<string>('VESTING_CONTRACT_ID');

    const contractIds: string[] = [];
    if (contractId) {
      contractIds.push(contractId);
    } else {
      if (streamContractId) contractIds.push(streamContractId);
      if (vestingContractId) contractIds.push(vestingContractId);
    }

    if (contractIds.length === 0) {
      throw new Error('STREAM_CONTRACT_ID not configured');
    }

    const result = await this.fetchAndProcessEvents(fromLedger, toLedger, contractIds);
    this.logger.log(`Backfill ${fromLedger}–${toLedger}: ${result.processed} processed, ${result.skipped} skipped (dedup)`);
    return result;
  }

  // ── Polling ─────────────────────────────────────────────────────────────────

  private async indexNewLedgers() {
    const server     = this.stellar.getSoroban();
    const latest     = (await server.getLatestLedger()).sequence;
    if (latest <= this.lastIndexedLedger) return;

    const streamContractId  = this.config.get<string>('STREAM_CONTRACT_ID');
    const vestingContractId = this.config.get<string>('VESTING_CONTRACT_ID');

    const contractIds: string[] = [];
    if (streamContractId) contractIds.push(streamContractId);
    if (vestingContractId) contractIds.push(vestingContractId);

    if (contractIds.length === 0) return;

    const startLedger = Math.max(
      this.lastIndexedLedger + 1,
      latest - LEDGERS_PER_PAGE,
    );

    await this.fetchAndProcessEvents(startLedger, latest, contractIds);
    this.lastIndexedLedger = latest;
  }

  private async fetchAndProcessEvents(
    startLedger: number,
    endLedger: number,
    contractIds: string[],
  ): Promise<{ processed: number; skipped: number }> {
    const server = this.stellar.getSoroban();
    let processed = 0;
    let skipped   = 0;
    let cursor: string | undefined;

    do {
      let response: SorobanRpc.Api.GetEventsResponse;
      try {
        response = await server.getEvents({
          startLedger,
          filters: [
            {
              type:        'contract',
              contractIds: contractIds,
              topics:      [['*']],
            },
          ],
          limit:      200,
          ...(cursor ? { cursor } : {}),
        });
      } catch (err) {
        this.logger.warn(`getEvents failed (ledger ${startLedger}–${endLedger}): ${err}`);
        break;
      }

      for (const event of response.events) {
        if (this.processedTxs.has(event.txHash)) {
          skipped++;
          continue;
        }
        await this.processEvent(event);
        processed++;
      }

      // Soroban RPC returns a paging token on the last event for pagination
      const lastEvent = response.events[response.events.length - 1];
      cursor = response.events.length >= 200
        ? (lastEvent as any).pagingToken ?? (lastEvent as any).cursor
        : undefined;
    } while (cursor);

    if (processed > 0) {
      this.logger.log(`Indexed ${processed} events (ledger ${startLedger}–${endLedger})`);
    }

    return { processed, skipped };
  }

  private async processEvent(event: SorobanRpc.Api.EventResponse) {
    const txHash = event.txHash;
    if (this.processedTxs.has(txHash)) return;
    this.processedTxs.add(txHash);

    // Prune dedup cache above 20k entries
    if (this.processedTxs.size > 20_000) {
      let pruned = 0;
      for (const h of this.processedTxs) {
        this.processedTxs.delete(h);
        if (++pruned >= 10_000) break;
      }
    }

    // topics[0] is the event name as a Symbol ScVal
    const eventNameScVal = event.topic[0];
    if (!eventNameScVal) return;

    const eventName = scValToNative(eventNameScVal) as string;
    const data      = scValToNative(event.value);

    this.logger.debug(`Event: ${eventName} | tx: ${txHash.slice(0, 12)}…`);

    switch (eventName) {
      // ── Stream events ─────────────────────────────────────────────────────
      case 'StreamCreated':
        await this.onStreamCreated(data, txHash);
        break;
      case 'Withdrawn':
      case 'StreamWithdrawn':
        await this.onWithdrawn(data, txHash);
        break;
      case 'Cancelled':
      case 'StreamCancelled':
        await this.onCancelled(data, txHash);
        break;

      // ── Vesting events ────────────────────────────────────────────────────
      case 'VestingCreated':
      case 'ScheduleCreated':
      case 'VestingScheduleCreated':
        await this.onVestingCreated(data, txHash);
        break;
      case 'VestingClaimed':
      case 'Claimed':
        await this.onVestingClaimed(data, txHash);
        break;
      case 'VestingRevoked':
      case 'Revoked':
        await this.onVestingRevoked(data, txHash);
        break;

      default:
        this.logger.warn(`Unrecognised contract event: ${eventName} (tx: ${txHash.slice(0, 12)}…)`);
    }
  }

  // ── Stream Handlers ─────────────────────────────────────────────────────────

  private async onStreamCreated(data: any, txHash: string) {
    try {
      let streamId      = '0';
      let sender        = '';
      let recipient     = '';
      let token         = 'native';
      let ratePerSecond = 0n;
      let startTime     = 0;
      let stopTime      = 0;

      if (Array.isArray(data)) {
        streamId  = String(data[0] ?? '0');
        sender    = String(data[1] ?? '');
        recipient = String(data[2] ?? '');
        if (data.length === 4) {
          ratePerSecond = BigInt(data[3] ?? 0n);
        } else if (data.length === 5) {
          token         = String(data[3] ?? 'native');
          ratePerSecond = BigInt(data[4] ?? 0n);
        } else if (data.length === 6) {
          ratePerSecond = BigInt(data[3] ?? 0n);
          startTime     = Number(data[4] ?? 0);
          stopTime      = Number(data[5] ?? 0);
        } else if (data.length >= 7) {
          token         = String(data[3] ?? 'native');
          ratePerSecond = BigInt(data[4] ?? 0n);
          startTime     = Number(data[5] ?? 0);
          stopTime      = Number(data[6] ?? 0);
        }
      } else if (data && typeof data === 'object') {
        streamId      = String(data.contract_stream_id ?? data.contractStreamId ?? data.stream_id ?? data.streamId ?? data.id ?? '0');
        sender        = String(data.sender ?? data.funder ?? data.from ?? '');
        recipient     = String(data.recipient ?? data.beneficiary ?? data.to ?? '');
        token         = String(data.token ?? data.token_address ?? 'native');
        ratePerSecond = BigInt(data.rate_per_second ?? data.ratePerSecond ?? data.rate ?? data.deposit ?? 0n);
        startTime     = Number(data.start_time ?? data.startTime ?? data.start ?? 0);
        stopTime      = Number(data.stop_time ?? data.stopTime ?? data.stop ?? data.end_time ?? data.endTime ?? 0);
      }

      await this.streams.upsertFromChain({
        contractStreamId: streamId,
        sender,
        recipient,
        token,
        ratePerSecond,
        startTime,
        stopTime,
        txHash,
      });

      await this.webhooks.dispatch(WebhookEvent.STREAM_CREATED, {
        streamId,
        sender,
        recipient,
        token,
        ratePerSecond: ratePerSecond.toString(),
        startTime,
        stopTime,
        txHash,
      });
    } catch (err) {
      this.logger.error('onStreamCreated error', err);
    }
  }

  private async onWithdrawn(data: any, txHash: string) {
    try {
      let streamId = '0';
      let amount   = 0n;

      if (Array.isArray(data)) {
        streamId = String(data[0] ?? '0');
        amount   = BigInt(data[1] ?? 0n);
      } else if (data && typeof data === 'object') {
        streamId = String(data.contract_stream_id ?? data.contractStreamId ?? data.stream_id ?? data.streamId ?? data.id ?? '0');
        amount   = BigInt(data.amount ?? data.withdrawn ?? 0n);
      }

      await this.streams.updateWithdrawnByContractId(streamId, amount);
      await this.webhooks.dispatch(WebhookEvent.STREAM_WITHDRAWN, {
        streamId,
        amount: amount.toString(),
        txHash,
      });
    } catch (err) {
      this.logger.error('onWithdrawn error', err);
    }
  }

  private async onCancelled(data: any, txHash: string) {
    try {
      let streamId    = '0';
      let toRecipient = 0n;
      let toSender    = 0n;

      if (Array.isArray(data)) {
        streamId = String(data[0] ?? '0');
        if (data.length > 1) toRecipient = BigInt(data[1] ?? 0n);
        if (data.length > 2) toSender    = BigInt(data[2] ?? 0n);
      } else if (data && typeof data === 'object') {
        streamId = String(data.contract_stream_id ?? data.contractStreamId ?? data.stream_id ?? data.streamId ?? data.id ?? '0');
        if (data.to_recipient !== undefined) toRecipient = BigInt(data.to_recipient);
        if (data.to_sender !== undefined)    toSender    = BigInt(data.to_sender);
      }

      await this.streams.updateStatusByContractId(streamId, StreamStatus.CANCELLED);
      await this.webhooks.dispatch(WebhookEvent.STREAM_CANCELLED, {
        streamId,
        toRecipient: toRecipient.toString(),
        toSender:    toSender.toString(),
        txHash,
      });
    } catch (err) {
      this.logger.error('onCancelled error', err);
    }
  }

  // ── Vesting Handlers ────────────────────────────────────────────────────────

  private async onVestingCreated(data: any, txHash: string) {
    try {
      let scheduleId  = '0';
      let funder      = '';
      let beneficiary = '';
      let token       = 'native';
      let totalAmount = 0n;
      let startTime   = 0;
      let cliffTime   = 0;
      let endTime     = 0;

      if (Array.isArray(data)) {
        scheduleId = String(data[0] ?? '0');
        if (data.length === 8) {
          funder      = String(data[1] ?? '');
          beneficiary = String(data[2] ?? '');
          token       = String(data[3] ?? 'native');
          totalAmount = BigInt(data[4] ?? 0n);
          startTime   = Number(data[5] ?? 0);
          cliffTime   = Number(data[6] ?? 0);
          endTime     = Number(data[7] ?? 0);
        } else if (data.length === 7) {
          beneficiary = String(data[1] ?? '');
          token       = String(data[2] ?? 'native');
          totalAmount = BigInt(data[3] ?? 0n);
          startTime   = Number(data[4] ?? 0);
          cliffTime   = Number(data[5] ?? 0);
          endTime     = Number(data[6] ?? 0);
        } else if (data.length === 6) {
          beneficiary = String(data[1] ?? '');
          totalAmount = BigInt(data[2] ?? 0n);
          startTime   = Number(data[3] ?? 0);
          cliffTime   = Number(data[4] ?? 0);
          endTime     = Number(data[5] ?? 0);
        } else if (data.length >= 3) {
          beneficiary = String(data[1] ?? '');
          totalAmount = BigInt(data[2] ?? 0n);
        }
      } else if (data && typeof data === 'object') {
        scheduleId  = String(data.contract_schedule_id ?? data.contractScheduleId ?? data.schedule_id ?? data.scheduleId ?? data.id ?? '0');
        funder      = String(data.funder ?? data.sender ?? data.creator ?? data.from ?? '');
        beneficiary = String(data.beneficiary ?? data.recipient ?? data.to ?? '');
        token       = String(data.token ?? data.token_address ?? 'native');
        totalAmount = BigInt(data.total_amount ?? data.totalAmount ?? data.amount ?? 0n);
        startTime   = Number(data.start_time ?? data.startTime ?? data.start ?? 0);
        cliffTime   = Number(data.cliff_time ?? data.cliffTime ?? data.cliff ?? 0);
        endTime     = Number(data.end_time ?? data.endTime ?? data.end ?? 0);
      }

      await this.vesting.upsertFromChain({
        contractScheduleId: scheduleId,
        funder,
        beneficiary,
        token,
        totalAmount,
        startTime,
        cliffTime,
        endTime,
        txHash,
      });

      await this.webhooks.dispatch(WebhookEvent.VESTING_CLAIMED, {
        scheduleId,
        funder,
        beneficiary,
        token,
        totalAmount: totalAmount.toString(),
        startTime,
        cliffTime,
        endTime,
        txHash,
      });
    } catch (err) {
      this.logger.error('onVestingCreated error', err);
    }
  }

  private async onVestingClaimed(data: any, txHash: string) {
    try {
      let scheduleId = '0';
      let amount     = 0n;

      if (Array.isArray(data)) {
        scheduleId = String(data[0] ?? '0');
        amount     = BigInt(data[1] ?? 0n);
      } else if (data && typeof data === 'object') {
        scheduleId = String(data.contract_schedule_id ?? data.contractScheduleId ?? data.schedule_id ?? data.scheduleId ?? data.id ?? '0');
        amount     = BigInt(data.amount ?? data.claimed ?? 0n);
      }

      await this.vesting.updateClaimedByContractId(scheduleId, amount);
      await this.webhooks.dispatch(WebhookEvent.VESTING_CLAIMED, {
        scheduleId,
        amount: amount.toString(),
        txHash,
      });
    } catch (err) {
      this.logger.error('onVestingClaimed error', err);
    }
  }

  private async onVestingRevoked(data: any, txHash: string) {
    try {
      let scheduleId = '0';

      if (Array.isArray(data)) {
        scheduleId = String(data[0] ?? '0');
      } else if (data && typeof data === 'object') {
        scheduleId = String(data.contract_schedule_id ?? data.contractScheduleId ?? data.schedule_id ?? data.scheduleId ?? data.id ?? '0');
      }

      await this.vesting.updateRevokedByContractId(scheduleId, true);
    } catch (err) {
      this.logger.error('onVestingRevoked error', err);
    }
  }
}
