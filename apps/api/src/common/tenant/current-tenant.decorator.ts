import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '../../auth/types';

/** Injects the request's resolved TenantContext (set by TenantGuard). */
export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.tenant) {
    throw new Error('CurrentTenant used on a route without TenantGuard applied');
  }
  return req.tenant;
});
