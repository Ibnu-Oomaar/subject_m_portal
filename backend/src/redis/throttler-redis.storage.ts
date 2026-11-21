import type { ThrottlerStorage } from '@nestjs/throttler';
import type { RedisService } from './redis.service';

// Fixed-window counter shared by all API instances. KEYS[1] = hits, KEYS[2] = block flag.
// ARGV: ttl(ms), limit, blockDuration(ms). Returns {hits, ttlMs, isBlocked, blockTtlMs}.
const SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  return {tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), 1, blockTtl}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}`;

export class ThrottlerRedisStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const hitsKey = `rl:${throttlerName}:${key}`;
    const [hits, ttlMs, blocked, blockMs] = (await this.redis.client.eval(
      SCRIPT,
      2,
      hitsKey,
      `${hitsKey}:blocked`,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.max(Math.ceil(ttlMs / 1000), 0),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.max(Math.ceil(blockMs / 1000), 0),
    };
  }
}
