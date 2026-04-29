import { Injectable } from '@nestjs/common';
import { StreamsService } from './streams.service';
import { StreamStatus }   from './stream.entity';

export interface StreamAnalytics {
  totalStreams:      number;
  activeStreams:     number;
  cancelledStreams:  number;
  totalVolumeStroops: string;
  avgDurationSeconds: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly streams: StreamsService) {}

  async getAnalytics(address?: string): Promise<StreamAnalytics> {
    const all = await this.streams.findAll(address);
    if (all.length === 0) {
      return { totalStreams: 0, activeStreams: 0, cancelledStreams: 0,
               totalVolumeStroops: '0', avgDurationSeconds: 0 };
    }

    const active    = all.filter(s => s.status === StreamStatus.ACTIVE).length;
    const cancelled = all.filter(s => s.status === StreamStatus.CANCELLED).length;
    const totalVol  = all.reduce((sum, s) => {
      return sum + s.ratePerSecond * BigInt(s.stopTime - s.startTime);
    }, 0n);
    const avgDur = all.reduce((sum, s) => sum + (s.stopTime - s.startTime), 0) / all.length;

    return {
      totalStreams:       all.length,
      activeStreams:      active,
      cancelledStreams:   cancelled,
      totalVolumeStroops: totalVol.toString(),
      avgDurationSeconds: avgDur,
    };
  }
}
