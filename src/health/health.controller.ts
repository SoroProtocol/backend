import { Controller, Get } from '@nestjs/common';
import { ApiTags }          from '@nestjs/swagger';
import { StellarService }   from '../stellar/stellar.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly stellar: StellarService) {}

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
}
