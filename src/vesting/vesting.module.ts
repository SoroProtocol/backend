import { Module }             from '@nestjs/common';
import { TypeOrmModule }       from '@nestjs/typeorm';
import { VestingService }     from './vesting.service';
import { VestingController }  from './vesting.controller';
import { VestingScheduleEntity } from './vesting.entity';
import { StellarModule }      from '../stellar/stellar.module';

@Module({
  imports:     [TypeOrmModule.forFeature([VestingScheduleEntity]), StellarModule],
  controllers: [VestingController],
  providers:   [VestingService],
  exports:     [VestingService],
})
export class VestingModule {}
