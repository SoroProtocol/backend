import { Controller, Get } from '@nestjs/common';
import { ApiTags }          from '@nestjs/swagger';
import { DataSource }       from 'typeorm';
import { StellarService }   from '../stellar/stellar.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly stellar: StellarService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async check() {
    const ledger = await this.stellar.getLatestLedger().catch(() => null);
    return {
      status:  ledger ? 'ok' : 'degraded',
      ts:      new Date().toISOString(),
      stellar: ledger ? { latestLedger: ledger } : { error: 'unreachable' },
    };
  }

  @Get('metrics')
  metrics() {
    return {
      uptime:     process.uptime(),
      memoryMB:   Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
    };
  }

  @Get('platform-stats')
  async platformStats() {
    await this.dataSource.query('SELECT refresh_platform_stats()');
    const rows = await this.dataSource.query('SELECT * FROM "platform_stats"');
    return rows[0] ?? null;
  }
}
