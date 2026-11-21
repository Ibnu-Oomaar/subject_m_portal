import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '../common/types';
import { env } from '../config/env';
import { PostgresStateService } from '../database/postgres-state.service';

export interface SessionData {
  role: Role;
  userId: string;
  csrfToken: string;
  createdAt: number;
}

const SID_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

/**
 * Server-side sessions in PostgreSQL. The browser only ever holds an opaque random id in an HttpOnly cookie.
 * Database keys use a hash of the id, so reading the table does not reveal usable session ids.
 * Sessions slide on activity (idle timeout per role) and also have an absolute lifetime.
 */
@Injectable()
export class SessionService {
  constructor(private readonly state: PostgresStateService) {}

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
    await this.state.setJson(this.key(sid), data, this.idleSeconds(role), this.userKey(role, userId));
    return { sid, csrfToken };
  }

  async resolve(sid: string): Promise<SessionData | null> {
    if (!SID_PATTERN.test(sid)) return null;
    const data = await this.state.getJson<SessionData>(this.key(sid));
    if (!data) return null;
    if (Date.now() - data.createdAt > env.SESSION_ABSOLUTE_HOURS * 3600_000) {
      await this.destroy(sid);
      return null;
    }
    if (!(await this.state.touch(this.key(sid), this.idleSeconds(data.role)))) return null;
    return data;
  }

  /**
   * Checks that a session is still valid WITHOUT extending its idle timeout. Used by long-lived connections
   * (Socket.IO) so that an open but unused connection can never keep a session alive.
   */
  async peek(sid: string): Promise<SessionData | null> {
    if (!SID_PATTERN.test(sid)) return null;
    const data = await this.state.getJson<SessionData>(this.key(sid));
    if (!data) return null;
    return Date.now() - data.createdAt > env.SESSION_ABSOLUTE_HOURS * 3600_000 ? null : data;
  }

  async destroy(sid: string): Promise<void> {
    if (!SID_PATTERN.test(sid)) return;
    await this.state.delete(this.key(sid));
  }

  /** Ends every session of a user (e.g. after a passcode change), optionally keeping the current one. */
  async destroyAllForUser(role: Role, userId: string, exceptSid?: string): Promise<void> {
    const exceptKey = exceptSid && SID_PATTERN.test(exceptSid) ? this.key(exceptSid) : undefined;
    await this.state.deleteOwner(this.userKey(role, userId), exceptKey);
  }
}
