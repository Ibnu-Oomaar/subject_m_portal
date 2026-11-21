import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../common/decorators';
import { Errors } from '../common/errors';
import type { Role } from '../common/types';
import { env } from '../config/env';
import { SessionService } from './session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Global, default-deny guard. Every route must either be @Public() or declare @Roles(...).
 * It authenticates the session cookie, enforces the role, and requires the CSRF token on state-changing requests.
 * Authorization is always decided here on the server; nothing the browser sends is trusted for it.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const sid = req.cookies?.[env.SESSION_COOKIE_NAME];
    const session = typeof sid === 'string' && sid ? await this.sessions.resolve(sid) : null;
    if (!session) throw Errors.unauthenticated();

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!roles?.length || !roles.includes(session.role)) throw Errors.forbidden();

    if (!SAFE_METHODS.has(req.method)) {
      const sent = req.get('x-csrf-token');
      if (!sent || !safeEqual(sent, session.csrfToken)) throw Errors.csrf();
    }

    req.auth = {
      role: session.role,
      userId: session.userId,
      csrfToken: session.csrfToken,
      sessionId: sid as string,
      ip: req.ip ?? 'unknown',
    };
    return true;
  }
}
