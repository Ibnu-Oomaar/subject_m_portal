import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators';
import { RedisService } from './redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  /** Liveness + dependency check for load balancers. Reveals nothing about the data. */
  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    const [db, redis] = await Promise.allSettled([this.dataSource.query('SELECT 1'), this.redis.ping()]);
    const ok = db.status === 'fulfilled' && redis.status === 'fulfilled';
    return { status: ok ? 'ok' : 'degraded', database: db.status === 'fulfilled', redis: redis.status === 'fulfilled' };
  }
}
