import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../auth/types';

/** The caller's network address as Express resolves it (one trusted proxy hop, see main.ts). */
export function clientIpTracker(req: Record<string, unknown>): string {
  const socket = req.socket as { remoteAddress?: string } | undefined;
  return `ip:${(req.ip as string | undefined) ?? socket?.remoteAddress ?? 'unknown'}`;
}

/**
 * Throttle key per company and user, and the network address for anyone else.
 *
 * A session token is verified by its signature before it buys its own bucket, so a forged or expired
 * token falls back to the address. An API key is not verified here (that needs the database, and the
 * global guard runs before JwtAuthGuard), so a request carrying one is counted by address too.
 * This only picks the counter; JwtAuthGuard still decides access.
 */
export function tenantTracker(jwt: JwtService): (req: Record<string, unknown>) => string {
  return (req) => {
    const headers = (req.headers ?? {}) as Record<string, unknown>;
    const header = headers.authorization;
    const token = typeof header === 'string' && /^Bearer\s+\S+$/i.test(header) ? header.replace(/^Bearer\s+/i, '') : null;
    if (token) {
      try {
        const p = jwt.verify<JwtPayload>(token);
        return `actor:${p.companyId ?? 'platform'}:${p.profileId}`;
      } catch {
        // Not a token we signed: counted by address below.
      }
    }
    return clientIpTracker(req);
  };
}
