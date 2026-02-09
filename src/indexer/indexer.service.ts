import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService }  from '@nestjs/config';
import { StellarService } from '../stellar/stellar.service';
import { StreamsService } from '../streams/streams.service';
import { StreamStatus }   from '../streams/stream.entity';

@Injectable()
export class IndexerService implements OnModuleInit {
  private readonly logger = new Logger(IndexerService.name);
  private lastIndexedLedger = 0;
  private running = false;

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
    this.logger.log('Starting Stellar event indexer...');

    while (this.running) {
      try {
        await this.indexLatest();
      } catch (err) {
        this.logger.error('Indexer error:', err);
      }
      await this.sleep(5000);
    }
  }

  private async indexLatest() {
    const latest = await this.stellar.getLatestLedger();
    if (latest <= this.lastIndexedLedger) return;

    const contractId = this.config.get('STREAM_CONTRACT_ID');
    if (!contractId) return;

    // In production: use getEvents() with topic filters for StreamCreated,
    // Withdrawn, Cancelled events, then update the streams store accordingly.
    this.lastIndexedLedger = latest;
  }

  async processEvent(eventType: string, streamId: string, data: Record<string, unknown>) {
    this.logger.log(`Processing event: ${eventType} for stream ${streamId}`);
    switch (eventType) {
      case 'StreamCreated':
        this.logger.log(`New stream indexed: ${streamId}`);
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

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
