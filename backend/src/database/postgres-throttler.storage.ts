import type { ThrottlerStorage } from '@nestjs/throttler';
import { PostgresStateService } from './postgres-state.service';

export class PostgresThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly state: PostgresStateService) {}

  increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    return this.state.incrementRateLimit(`rl:${throttlerName}:${key}`, ttl, limit, blockDuration);
  }
}
