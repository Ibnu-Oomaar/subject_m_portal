import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '../common/types';
import { env } from '../config/env';
import { RedisService } from '../redis/redis.service';

export interface SessionData {
  role: Role;
  userId: string;
  csrfToken: string;
  createdAt: number;
}

const SID_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

/**
 * Server-side sessions in Redis. The browser only ever holds an opaque random id in an HttpOnly cookie.
 * Redis keys use a hash of the id, so reading Redis does not reveal usable session ids.
 * Sessions slide on activity (idle timeout per role) and also have an absolute lifetime.
 */
@Injectable()
export class SessionService {
  constructor(private readonly redis: RedisService) {}

  private hash(sid: string): string {
    return createHash('sha256').update(sid).digest('hex');
  }
  private key(sid: string): string {
    return `sess:${this.hash(sid)}`;
  }
  private userKey(role: Role, userId: string): string {
    return `sess:user:${role}:${userId}`;
  }
  private idleSeconds(role: Role): number {
    return (role === 'teacher' ? env.TEACHER_SESSION_IDLE_MINUTES : env.STUDENT_SESSION_IDLE_MINUTES) * 60;
  }

  /** A new session id is issued on every login, which prevents session fixation. */
  async create(role: Role, userId: string): Promise<{ sid: string; csrfToken: string }> {
    const sid = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const data: SessionData = { role, userId, csrfToken, createdAt: Date.now() };
    const hashed = this.hash(sid);
    await this.redis.client
      .multi()
      .set(`sess:${hashed}`, JSON.stringify(data), 'EX', this.idleSeconds(role))
      .sadd(this.userKey(role, userId), hashed)
      .expire(this.userKey(role, userId), env.SESSION_ABSOLUTE_HOURS * 3600)
      .exec();
    return { sid, csrfToken };
  }

  async resolve(sid: string): Promise<SessionData | null> {
    if (!SID_PATTERN.test(sid)) return null;
    const raw = await this.redis.client.get(this.key(sid));
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData;
    if (Date.now() - data.createdAt > env.SESSION_ABSOLUTE_HOURS * 3600_000) {
      await this.destroy(sid, data);
      return null;
    }
    await this.redis.client.expire(this.key(sid), this.idleSeconds(data.role));
    return data;
  }

  /**
   * Checks that a session is still valid WITHOUT extending its idle timeout. Used by long-lived connections
   * (Socket.IO) so that an open but unused connection can never keep a session alive.
   */
  async peek(sid: string): Promise<SessionData | null> {
    if (!SID_PATTERN.test(sid)) return null;
    const raw = await this.redis.client.get(this.key(sid));
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData;
    return Date.now() - data.createdAt > env.SESSION_ABSOLUTE_HOURS * 3600_000 ? null : data;
  }

  async destroy(sid: string, known?: SessionData | null): Promise<void> {
    if (!SID_PATTERN.test(sid)) return;
    const data = known ?? (await this.redis.getJson<SessionData>(this.key(sid)));
    const pipeline = this.redis.client.multi().del(this.key(sid));
    if (data) pipeline.srem(this.userKey(data.role, data.userId), this.hash(sid));
    await pipeline.exec();
  }

  /** Ends every session of a user (e.g. after a passcode change), optionally keeping the current one. */
  async destroyAllForUser(role: Role, userId: string, exceptSid?: string): Promise<void> {
    const keep = exceptSid ? this.hash(exceptSid) : null;
    const hashes = await this.redis.client.smembers(this.userKey(role, userId));
    const doomed = hashes.filter((h) => h !== keep);
    if (!doomed.length) return;
    await this.redis.client
      .multi()
      .del(...doomed.map((h) => `sess:${h}`))
      .srem(this.userKey(role, userId), ...doomed)
      .exec();
  }
}
