import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';

const INCR_WINDOW_LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {hits, redis.call('TTL', KEYS[1])}`;

const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  readonly client: Redis;

  constructor() {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableReadyCheck: true });
    this.client.on('error', (e: Error) => this.logger.error(e.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /**
   * Read-through cache with O(1) invalidation. Keys include the scope's version number; bumping the version
   * (invalidate) orphans every entry of that scope, and the orphans simply expire.
   * The version is read BEFORE the loader runs, so a write that lands mid-load never leaves stale data visible.
   */
  async cached<T>(scope: string, key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const version = (await this.client.get(`cache:ver:${scope}`)) ?? '0';
    const fullKey = `cache:${scope}:${version}:${key}`;
    const hit = await this.client.get(fullKey);
    if (hit) return JSON.parse(hit) as T;
    const value = await loader();
    await this.client.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds);
    return value;
  }

  async invalidate(scope: string): Promise<void> {
    await this.client.incr(`cache:ver:${scope}`);
  }

  /** Atomic fixed-window counter. Returns the new count and the seconds until the window resets. */
  async incrementWindow(key: string, windowSeconds: number): Promise<{ count: number; ttl: number }> {
    const [count, ttl] = (await this.client.eval(INCR_WINDOW_LUA, 1, key, windowSeconds)) as [number, number];
    return { count, ttl: Math.max(ttl, 0) };
  }

  async windowState(key: string): Promise<{ count: number; ttl: number }> {
    const [count, ttl] = await Promise.all([this.client.get(key), this.client.ttl(key)]);
    return { count: Number(count ?? 0), ttl: Math.max(ttl, 0) };
  }

  /** SET NX lock; returns a token to release with, or null when someone else holds it. */
  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = crypto.randomUUID();
    const ok = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
    return ok === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.client.eval(RELEASE_LOCK_LUA, 1, key, token);
  }
}
