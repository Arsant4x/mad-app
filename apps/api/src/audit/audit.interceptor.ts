import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { JwtPayload } from '../auth/types';
import { REDACTED_VALUE, isRedactedKey } from '../common/privacy/personal-fields';
import { REQUIRES_SCREEN_KEY } from '../common/tenant/requires-screen.decorator';
import { REQUIRES_ACTION_KEY } from '../common/tenant/requires-action.decorator';
import { AUDIT_CREATED_ID_PATH_KEY, AUDIT_ENTITY_FROM_RESULT_KEY, idFromResultPath } from './audit-entity-from-result.decorator';
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The parent this request acts on: the **first route parameter whose value is
 * an id**, in the order the path declares them.
 *
 * This used to be `req.params.id ?? req.params.contractId` — two names written
 * by hand. So attribution was decided by what a parameter was *called*, not by
 * what the route does: `/contracts/:contractId/attachments` recorded the
 * contract while `/purchases/:purchaseId/attachments` recorded the attachment,
 * for the very same operation. Reading the value instead of the name removes
 * the naming dependency, and skipping non-id segments keeps
 * `/trash/:entity/:id/restore` pointing at the row rather than at the word
 * "invoices". Falls back to the old two names, so a model whose id is not a
 * uuid behaves exactly as before rather than silently changing.
 */
function parentIdFromParams(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  for (const value of Object.values(params as Record<string, unknown>)) {
    if (typeof value === 'string' && UUID_RE.test(value)) return value;
  }
  return undefined;
}

function safeDetails(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (isSecretKey(key)) {
      out[key] = '[محذوف]';
      continue;
    }
    // حقولُ التواصل والملاحظاتُ الحرّة: يُكتب **أن الحقل تغيّر** ولا تُكتب قيمتُه (`ق-١٢٧٨`/②).
    // فالسجلُّ يحتاج أيَّ حقلٍ تغيّر لا قيمتَه، والقناعُ بآخر أربعةٍ يُبقي بياناً شخصياً — والمحوُ
    // لا يبلغ السجلَّ (لا يُعدَّل — الملحقُ ١)، فالمنعُ **عند الكتابة** أو لا منعَ أصلاً.
    if (isRedactedKey(key)) {
      out[key] = REDACTED_VALUE;
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
      tap({
        error: (err: unknown) => this.recordRefusal(context, req, method, err),
      }),
      tap((result) => {
        // Only successful calls reach here — a rejected request never happened,
        // so recording it as a change would be a lie.
        const tenant = req.tenant;
        const payload = req.user as JwtPayload | undefined;
        if (!tenant?.companyId || !payload) return;

        const screen = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_SCREEN_KEY, [context.getHandler(), context.getClass()]) ?? 'general';
        const action = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_ACTION_KEY, [context.getHandler(), context.getClass()]);

        // A handler may declare that the document it just created is the audited
        // entity — see AuditEntityFromResult for why the default is the reverse.
        const entityIsResult = this.reflector.getAllAndOverride<boolean | undefined>(AUDIT_ENTITY_FROM_RESULT_KEY, [context.getHandler(), context.getClass()]);
        const resultId = idFromResultPath(result, 'id');
        const paramId = parentIdFromParams(req.params) ?? (req.params?.id as string | undefined) ?? (req.params?.contractId as string | undefined);
        const entityId = (entityIsResult ? resultId ?? paramId : paramId ?? resultId) ?? null;

        // A row created *under* a parent's id would otherwise be unnameable: the
        // entry says "something happened to contract X" while two payments on
        // that lease look identical. Recording the child alongside keeps both
        // questions answerable — "what happened to X" and "which child was it" —
        // and costs no column, since details is already free-form. A handler
        // whose created id is not on the result root declares where it lives.
        const declaredPath = this.reflector.getAllAndOverride<string | undefined>(AUDIT_CREATED_ID_PATH_KEY, [context.getHandler(), context.getClass()]);
        const created = declaredPath ? idFromResultPath(result, declaredPath) : resultId;
        const createdId = created && created !== entityId ? created : null;

        this.audit
          .record({
            companyId: tenant.companyId,
            actorType: tenant.actorType,
            actorId: tenant.profileId,
            actorName: payload.username,
            screen,
            action: action ?? this.fallbackAction(method),
            entity: this.entityFromPath(req.path),
            entityId,
            method,
            path: req.path,
            details: createdId ? { ...safeDetails(req.body), createdId } : safeDetails(req.body),
            ip: req.ip ?? null,
          })
          .catch((e: Error) => this.logger.error(`Could not write audit entry for ${method} ${req.path}: ${e.message}`));
      }),
    );
  }

  /**
   * **المحاولةُ المرفوضة تُسجَّل — بمعيارٍ محسوم** (`ق-٥١١`).
   *
   * ── العلّة ──────────────────────────────────────────────────────────────
   *
   * كان المسجِّلُ `tap((result) => …)` **بمعالجٍ واحدٍ يعمل على النجاح وحده**
   * — **فكلُّ تعديلٍ مرفوض لا يترك أثراً إطلاقاً**. ⇒ **فهجومٌ أخفق غيرُ مرئيٍّ
   * بنيوياً لا «غيرُ ملحوظ»**، **ومنعٌ متكرّرٌ لمن يحاول ما ليس له لا يُقرأ في
   * أيّ شاشة**.
   *
   * ── والمعيار (حكمُ المالك) ──────────────────────────────────────────────
   *
   *   · **المرفوضُ بالصلاحية** (`403`) — **ومنه رفضُ العزل، وهو أهمُّ ما يُرى**.
   *   · **والمرفوضُ بالحالة** (`409`) — كاصطدام اسمٍ أو حالةٍ نهائية.
   *   · **ولا يُسجَّل المرفوضُ بشكل المُدخَل** (`400`/`422`) — **ضجيجٌ يُغرق
   *     السجل**، وخطأُ حقلٍ ليس محاولةَ تجاوز.
   *
   * ⚠️ **و`404` خارجٌ عمداً وحدُّه معلَن**: **هو حالةٌ كذلك** — **لكنه أكثرُ
   * الإخفاقات وقوعاً بلا سوء نيّة** (رابطٌ قديم، صفٌّ حُذف)، **فيُغرق النمطَ
   * الذي بُني السجلُّ لكشفه**. **ويُضاف حين يُطلَب لا افتراضاً.**
   *
   * ── ولا يُسجَّل جسمُ الطلب في الرفض ────────────────────────────────────
   *
   * 📌 **وهي قاعدةُ `company-users` معمَّمة**: **تسجيلُ ما حاوله يجعل السجلَّ
   * نسخةً ثانية من التسريب يقرأها من يملك صلاحية التدقيق**. ⇒ **فيُسجَّل وقوعُ
   * الرفض وسببُه، لا موضوعُه** — **والغرضُ كشفُ النمط لا حفظُ المحاولة**.
   */
  private recordRefusal(context: ExecutionContext, req: Request, method: string, err: unknown): void {
    const status = err instanceof HttpException ? err.getStatus() : 500;
    if (status !== HttpStatus.FORBIDDEN && status !== HttpStatus.CONFLICT) return;

    const tenant = req.tenant;
    const payload = req.user as JwtPayload | undefined;
    if (!tenant?.companyId || !payload) return;

    const screen = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_SCREEN_KEY, [context.getHandler(), context.getClass()]) ?? 'general';
    const action = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_ACTION_KEY, [context.getHandler(), context.getClass()]);
    const entityId = parentIdFromParams(req.params) ?? (req.params?.id as string | undefined) ?? null;

    this.audit
      .record({
        companyId: tenant.companyId,
        actorType: tenant.actorType,
        actorId: tenant.profileId,
        actorName: payload.username,
        screen,
        action: action ?? this.fallbackAction(method),
        entity: this.entityFromPath(req.path),
        entityId,
        method,
        path: req.path,
        // **وقوعُ الرفض وسببُه لا موضوعُه** — ولا جسمَ طلبٍ هنا بحال.
        details: { outcome: 'rejected', status },
        ip: req.ip ?? null,
      })
      .catch((e: Error) => this.logger.error(`Could not write refusal audit entry for ${method} ${req.path}: ${e.message}`));
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
