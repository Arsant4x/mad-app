import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from './types';

/** Injects the raw JWT payload — used on platform-admin routes, which have
 * no company to scope (see CurrentTenant for the tenant-scoped equivalent). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.user as JwtPayload;
});
