import { Module }            from '@nestjs/common';
import { IndexerService }    from './indexer.service';
import { IndexerController } from './indexer.controller';
import { StreamsModule }     from '../streams/streams.module';
import { WebhooksModule }    from '../webhooks/webhooks.module';

@Module({
  imports:     [StreamsModule, WebhooksModule],
  controllers: [IndexerController],
  providers:   [IndexerService],
  exports:     [IndexerService],
})
export class IndexerModule {}
