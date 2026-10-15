import { applyDecorators, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Throttle, ThrottlerModuleOptions } from '@nestjs/throttler';
import { clientIpTracker, tenantTracker } from './tenant-tracker';

/** Second named throttler: counts sign-in attempts per submitted username, across all addresses. */
export const ACCOUNT_THROTTLER = 'account';
const COUNTS_BY_ACCOUNT = 'throttle:counts-by-account';
const WINDOW_MS = 60_000;
const reflector = new Reflector();

/** Bucket key for the account throttler: the username in the body, or the address when there is none. */
export function accountTracker(req: Record<string, unknown>): string {
  const username = (req.body as { username?: unknown } | undefined)?.username;
  return typeof username === 'string' && username.trim() ? `account:${username.trim().toLowerCase()}` : clientIpTracker(req);
}

/** For a route reached before sign-in: counted by address whatever credentials the request carries. */
export const ThrottleByClientIp = (limit: number) => Throttle({ default: { limit, ttl: WINDOW_MS, getTracker: clientIpTracker } });

/** As ThrottleByClientIp, and also by the submitted username so one account is not tried from many addresses. */
export const ThrottleByClientIpAndAccount = (limit: number) =>
  applyDecorators(SetMetadata(COUNTS_BY_ACCOUNT, true), Throttle({ default: { limit, ttl: WINDOW_MS, getTracker: clientIpTracker }, [ACCOUNT_THROTTLER]: { limit, ttl: WINDOW_MS } }));

const countsByAccount = (context: ExecutionContext) => reflector.get<boolean | undefined>(COUNTS_BY_ACCOUNT, context.getHandler()) === true;

/**
 * The application's throttler configuration. Under Jest it is skipped (the e2e suite sends hundreds of
 * requests from one address); a suite that tests the limits passes enforceUnderTest to get the same rules.
 */
export function throttlerOptions(jwt: JwtService, opts: { enforceUnderTest?: boolean } = {}): ThrottlerModuleOptions {
  const skipped = () => !opts.enforceUnderTest && process.env.NODE_ENV === 'test';
  return {
    throttlers: [
      { name: 'default', limit: 600, ttl: WINDOW_MS },
      // A named throttler's own skipIf replaces the common one, so the test skip is repeated here.
      { name: ACCOUNT_THROTTLER, limit: 10, ttl: WINDOW_MS, getTracker: accountTracker, skipIf: (context) => skipped() || !countsByAccount(context) },
    ],
    skipIf: skipped,
    getTracker: tenantTracker(jwt),
  };
}
