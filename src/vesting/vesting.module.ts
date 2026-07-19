import { Module }             from '@nestjs/common';
import { VestingService }     from './vesting.service';
import { VestingController }  from './vesting.controller';

@Module({
  controllers: [VestingController],
  providers:   [VestingService],
  exports:     [VestingService],
})
export class VestingModule {}
