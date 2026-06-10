import { Module }          from '@nestjs/common';
import { IndexerService }  from './indexer.service';
import { StreamsModule }   from '../streams/streams.module';
import { WebhooksModule }  from '../webhooks/webhooks.module';

@Module({
  imports:   [StreamsModule, WebhooksModule],
  providers: [IndexerService],
  exports:   [IndexerService],
})
export class IndexerModule {}
