import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext, Role } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Opt a route out of authentication (login endpoints only). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
/** Routes are default-deny: every non-public route must declare which roles may call it. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.auth) throw new Error('Auth() used on a route that is not protected by the session guard');
  return req.auth;
});
