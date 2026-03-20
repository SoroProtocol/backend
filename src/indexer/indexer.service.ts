import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService }  from '@nestjs/config';
import { StellarService } from '../stellar/stellar.service';
import { StreamsService } from '../streams/streams.service';
import { StreamStatus }   from '../streams/stream.entity';

@Injectable()
export class IndexerService implements OnModuleInit {
  private readonly logger        = new Logger(IndexerService.name);
  private lastIndexedLedger      = 0;
  private readonly processedTxs  = new Set<string>(); // dedup cache
  private running                = false;

  constructor(
    private readonly stellar: StellarService,
    private readonly streams: StreamsService,
    private readonly config:  ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get('NODE_ENV') !== 'test') {
      void this.startIndexing();
    }
  }

  async startIndexing() {
    this.running = true;
    this.logger.log('Stellar event indexer started');

    while (this.running) {
      try {
        await this.indexLatest();
      } catch (err) {
        this.logger.error('Indexer error', err);
      }
      await this.sleep(5000);
    }
  }

  private async indexLatest() {
    const latest = await this.stellar.getLatestLedger();
    if (latest <= this.lastIndexedLedger) return;

    const contractId = this.config.get<string>('STREAM_CONTRACT_ID');
    if (!contractId) return;

    // Prune dedup cache older than 10k entries to prevent memory leak
    if (this.processedTxs.size > 10_000) {
      const arr = Array.from(this.processedTxs);
      arr.slice(0, 5000).forEach(tx => this.processedTxs.delete(tx));
    }

    this.lastIndexedLedger = latest;
  }

  async processEvent(txHash: string, eventType: string, streamId: string, data: Record<string, unknown>) {
    // Deduplicate — Soroban RPCs can return the same event multiple times
    if (this.processedTxs.has(txHash)) {
      this.logger.debug(`Skipping duplicate event ${txHash}`);
      return;
    }
    this.processedTxs.add(txHash);
    this.logger.log(`Event: ${eventType} | stream ${streamId} | tx ${txHash}`);

    switch (eventType) {
      case 'StreamCreated':
        break;
      case 'Withdrawn':
        await this.streams.updateWithdrawn(streamId, BigInt(data.amount as string));
        break;
      case 'Cancelled':
        await this.streams.updateStatus(streamId, StreamStatus.CANCELLED);
        break;
    }
  }

  stopIndexing() { this.running = false; }
  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}
