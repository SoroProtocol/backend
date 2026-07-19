import { Module }        from '@nestjs/common';
import { ConfigModule }  from '@nestjs/config';
import { StreamsModule } from './streams/streams.module';
import { VestingModule } from './vesting/vesting.module';
import { IndexerModule } from './indexer/indexer.module';
import { WebhooksModule }from './webhooks/webhooks.module';
import { AuthModule }    from './auth/auth.module';
import { StellarModule } from './stellar/stellar.module';
import { HealthModule }  from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StellarModule,
    AuthModule,
    StreamsModule,
    VestingModule,
    IndexerModule,
    WebhooksModule,
    HealthModule,
  ],
})
export class AppModule {}
