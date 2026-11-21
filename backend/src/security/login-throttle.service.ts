import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Errors } from '../common/errors';
import { env } from '../config/env';
import { PostgresStateService } from '../database/postgres-state.service';

/**
 * Brute-force protection for the two ID/name-based logins. Failures are counted per login identifier (so one
 * account cannot be guessed at) and per client IP (so one client cannot enumerate many identifiers).
 *
 * The IP ceiling is intentionally higher than the per-identifier one: a whole class can sit behind one school
 * NAT address, and a few mistyped IDs must not lock everyone out.
 */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly state: PostgresStateService) {}

  private idKey(identifier: string): string {
    return `login:fail:id:${createHash('sha256').update(identifier).digest('hex').slice(0, 32)}`;
  }
  private ipKey(ip: string): string {
    return `login:fail:ip:${ip}`;
  }
  private get windowSeconds(): number {
    return env.LOGIN_WINDOW_MINUTES * 60;
  }
  private get ipLimit(): number {
    return env.LOGIN_MAX_ATTEMPTS * 5;
  }

  async assertAllowed(ip: string, identifier: string): Promise<void> {
    const [byId, byIp] = await Promise.all([
      this.state.windowState(this.idKey(identifier)),
      this.state.windowState(this.ipKey(ip)),
    ]);
    if (byId.count >= env.LOGIN_MAX_ATTEMPTS) throw Errors.rateLimited(byId.ttl || this.windowSeconds);
    if (byIp.count >= this.ipLimit) throw Errors.rateLimited(byIp.ttl || this.windowSeconds);
  }

  async recordFailure(ip: string, identifier: string): Promise<void> {
    await Promise.all([
      this.state.incrementWindow(this.idKey(identifier), this.windowSeconds),
      this.state.incrementWindow(this.ipKey(ip), this.windowSeconds),
    ]);
  }

  /** A successful login clears the identifier's counter (the IP counter is left to expire). */
  async recordSuccess(identifier: string): Promise<void> {
    await this.state.delete(this.idKey(identifier));
  }
}
