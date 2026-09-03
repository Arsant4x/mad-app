import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { JwtPayload } from '../auth/types';
import { REQUIRES_SCREEN_KEY } from '../common/tenant/requires-screen.decorator';
import { REQUIRES_ACTION_KEY } from '../common/tenant/requires-action.decorator';
import { AUDIT_ENTITY_FROM_RESULT_KEY } from './audit-entity-from-result.decorator';
import { NO_AUDIT_KEY } from './no-audit.decorator';
import { AuditService } from './audit.service';

/** Fields that must never reach the audit trail, matched case-insensitively as
 * substrings so `passwordHash`, `apiKeyEnc`, `refreshToken` are all caught. A
 * log that leaks credentials is a bigger liability than the one it replaces. */
const SECRET_FIELDS = ['password', 'token', 'secret', 'otp', 'privatekey', 'apikey', 'csr', 'certificate'];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_FIELDS.some((s) => k.includes(s));
}

/** Copies a request body minus secrets, and minus anything large enough to
 * bloat the trail (file buffers, long text). */
function safeDetails(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (isSecretKey(key)) {
      out[key] = '[محذوف]';
      continue;
    }
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = typeof value === 'string' && value.length > 300 ? `${value.slice(0, 300)}…` : value;
    } else {
      // Nested objects/arrays are summarized rather than embedded whole.
      out[key] = Array.isArray(value) ? `[${value.length} عنصر]` : '[كائن]';
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Records every successful mutating request to the audit trail.
 *
 * Deliberately a **global interceptor** rather than per-service calls: an audit
 * log you have to remember to write is one that silently has holes, and holes
 * are exactly where a dispute lands. Any new endpoint is covered the day it
 * ships, without its author doing anything.
 *
 * Failures never break the request — an unrecordable action still has to be
 * allowed to happen, and the error is logged for operators.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();

    // Reads are not audited here. "Who looked at what" (SPEC 12.3) is a
    // separate, much higher-volume concern and gets its own design.
    const isMutation = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
    if (!isMutation) return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(NO_AUDIT_KEY, [context.getHandler(), context.getClass()]);
    if (skip) return next.handle();

    return next.handle().pipe(
      tap((result) => {
        // Only successful calls reach here — a rejected request never happened,
        // so recording it as a change would be a lie.
        const tenant = req.tenant;
        const payload = req.user as JwtPayload | undefined;
        if (!tenant?.companyId || !payload) return;

        const screen = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_SCREEN_KEY, [context.getHandler(), context.getClass()]) ?? 'general';
        const action = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_ACTION_KEY, [context.getHandler(), context.getClass()]);

        const resultId = (result as { id?: string } | null)?.id;
        const paramId = (req.params?.id as string | undefined) ?? (req.params?.contractId as string | undefined);
        // A handler may declare that the document it just created is the audited
        // entity — see AuditEntityFromResult for why the default is the reverse.
        const entityIsResult = this.reflector.getAllAndOverride<boolean | undefined>(AUDIT_ENTITY_FROM_RESULT_KEY, [context.getHandler(), context.getClass()]);

        this.audit
          .record({
            companyId: tenant.companyId,
            actorType: tenant.actorType,
            actorId: tenant.profileId,
            actorName: payload.username,
            screen,
            action: action ?? this.fallbackAction(method),
            entity: this.entityFromPath(req.path),
            entityId: (entityIsResult ? resultId ?? paramId : paramId ?? resultId) ?? null,
            method,
            path: req.path,
            details: safeDetails(req.body),
            ip: req.ip ?? null,
          })
          .catch((e: Error) => this.logger.error(`Could not write audit entry for ${method} ${req.path}: ${e.message}`));
      }),
    );
  }

  /** Used only for endpoints that haven't declared an action yet, so the trail
   * stays complete while action coverage is still being rolled out. */
  private fallbackAction(method: string): string {
    if (method === 'POST') return 'add';
    if (method === 'DELETE') return 'delete';
    return 'edit';
  }

  /** First path segment — `/contracts/123/payments` → `contracts`. Good enough
   * to group the trail by area without coupling it to controller internals. */
  private entityFromPath(path: string): string {
    return path.split('/').filter(Boolean)[0] ?? 'unknown';
  }
}
