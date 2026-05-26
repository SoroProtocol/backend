import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService }  from '@nestjs/config';
import { StellarService } from '../stellar/stellar.service';
import { StreamsService } from '../streams/streams.service';
import { WebhooksService }from '../webhooks/webhooks.service';
import { WebhookEvent }   from '../webhooks/webhook.entity';
import { StreamStatus }   from '../streams/stream.entity';
import { SorobanRpc, xdr, scValToNative } from '@stellar/stellar-sdk';

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

  private async indexNewLedgers() {
    const server     = this.stellar.getSoroban();
    const latest     = (await server.getLatestLedger()).sequence;
    if (latest <= this.lastIndexedLedger) return;

    const contractId = this.config.get<string>('STREAM_CONTRACT_ID');
    if (!contractId) return;

    const startLedger = Math.max(
      this.lastIndexedLedger + 1,
      latest - LEDGERS_PER_PAGE,
    );

    let response: SorobanRpc.Api.GetEventsResponse;
    try {
      response = await server.getEvents({
        startLedger,
        filters: [
          {
            type:        'contract',
            contractIds: [contractId],
            topics:      [
              ['*'],  // match any topic[0] (event name)
            ],
          },
        ],
        limit: 200,
      });
    } catch (err) {
      this.logger.warn(`getEvents failed (ledger ${startLedger}–${latest}): ${err}`);
      return;
    }

    for (const event of response.events) {
      await this.processEvent(event);
    }

    this.lastIndexedLedger = latest;
    if (response.events.length > 0) {
      this.logger.log(`Indexed ${response.events.length} events up to ledger ${latest}`);
    }
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

    const eventName = scValToNative(xdr.ScVal.fromXDR(eventNameScVal, 'base64')) as string;
    const data      = scValToNative(xdr.ScVal.fromXDR(event.value, 'base64'));

    this.logger.debug(`Event: ${eventName} | tx: ${txHash.slice(0, 12)}…`);

    switch (eventName) {
      case 'StreamCreated':
        await this.onStreamCreated(data as [bigint, string, string, bigint], txHash);
        break;
      case 'Withdrawn':
        await this.onWithdrawn(data as [bigint, bigint], txHash);
        break;
      case 'Cancelled':
        await this.onCancelled(data as [bigint, bigint, bigint], txHash);
        break;
      default:
        this.logger.warn(`Unrecognised contract event: ${eventName} (tx: ${txHash.slice(0, 12)}…)`);
    }
  }

  private async onStreamCreated(
    [streamId, sender, recipient, deposit]: [bigint, string, string, bigint],
    txHash: string,
  ) {
    try {
      await this.streams.upsertFromChain({
        contractStreamId: streamId.toString(),
        sender,
        recipient,
        txHash,
      });
      await this.webhooks.dispatch(WebhookEvent.STREAM_CREATED, {
        streamId: streamId.toString(), sender, recipient,
        deposit: deposit.toString(), txHash,
      });
    } catch (err) {
      this.logger.error('onStreamCreated error', err);
    }
  }

  private async onWithdrawn([streamId, amount]: [bigint, bigint], txHash: string) {
    try {
      await this.streams.updateWithdrawnByContractId(streamId.toString(), amount);
      await this.webhooks.dispatch(WebhookEvent.STREAM_WITHDRAWN, {
        streamId: streamId.toString(), amount: amount.toString(), txHash,
      });
    } catch (err) {
      this.logger.error('onWithdrawn error', err);
    }
  }

  private async onCancelled(
    [streamId, toRecipient, toSender]: [bigint, bigint, bigint],
    txHash: string,
  ) {
    try {
      await this.streams.updateStatusByContractId(streamId.toString(), StreamStatus.CANCELLED);
      await this.webhooks.dispatch(WebhookEvent.STREAM_CANCELLED, {
        streamId: streamId.toString(),
        toRecipient: toRecipient.toString(),
        toSender:    toSender.toString(),
        txHash,
      });
    } catch (err) {
      this.logger.error('onCancelled error', err);
    }
  }
}
