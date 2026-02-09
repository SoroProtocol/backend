import { Module }          from '@nestjs/common';
import { IndexerService }  from './indexer.service';
import { StreamsModule }   from '../streams/streams.module';

@Module({
  imports:   [StreamsModule],
  providers: [IndexerService],
  exports:   [IndexerService],
})
export class IndexerModule {}
