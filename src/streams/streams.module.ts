import { Module }           from '@nestjs/common';
import { TypeOrmModule }    from '@nestjs/typeorm';
import { StreamsService }   from './streams.service';
import { StreamsController }from './streams.controller';
import { StreamEntity }     from './stream.entity';
import { StellarModule }    from '../stellar/stellar.module';

@Module({
  imports:     [TypeOrmModule.forFeature([StreamEntity]), StellarModule],
  controllers: [StreamsController],
  providers:   [StreamsService],
  exports:     [StreamsService],
})
export class StreamsModule {}
