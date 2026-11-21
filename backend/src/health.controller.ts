import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Liveness + dependency check for load balancers. Reveals nothing about the data. */
  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    const [db] = await Promise.allSettled([this.dataSource.query('SELECT 1')]);
    const ok = db.status === 'fulfilled';
    return { status: ok ? 'ok' : 'degraded', database: ok };
  }
}
