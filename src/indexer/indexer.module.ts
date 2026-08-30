import { Module }            from '@nestjs/common';
import { IndexerService }    from './indexer.service';
import { IndexerController } from './indexer.controller';
import { StreamsModule }     from '../streams/streams.module';
import { VestingModule }     from '../vesting/vesting.module';
import { WebhooksModule }    from '../webhooks/webhooks.module';
import { StellarModule }     from '../stellar/stellar.module';

@Module({
  imports:     [StreamsModule, VestingModule, WebhooksModule, StellarModule],
  controllers: [IndexerController],
  providers:   [IndexerService],
  exports:     [IndexerService],
})
export class IndexerModule {}
