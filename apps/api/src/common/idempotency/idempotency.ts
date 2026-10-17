import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { Request } from 'express';
import { MSG } from '../i18n/messages';
import type { TenantPrismaService } from '../tenant/tenant-prisma.service';

/**
 * ⚖️ **الإرسالُ المكرّر لا يُنشئ مستندين** (توجيه ٢٧٦ · `ق-١٦٠٩`/ب، بالقاعدة ٣٧ — مقياسُ م٥ في المسح ٣٤).
 *
 * ## العطل
 *
 * سندُ القبض وسندُ الصرف وقبضُ الإيجار وبيعُ الكاشير المتّصل: طلبٌ واحدٌ يُرسل مرّتين (نقرةٌ مزدوجة، أو إعادةُ شبكةٍ بعد مهلة
 * لم يصل جوابُها) **يُنشئ مستندين** بقيدين وحركتَي صندوق — والخادمُ لا يميّز التكرارَ من دفعةٍ ثانيةٍ مشروعةٍ بالمبلغ نفسِه.
 * فالمميِّزُ لا يكون إلا من العميل: **مفتاحٌ يولّده للطلب الواحد** ويعيده كما هو إن أعاد الطلب. وهو ما يحمي البيعَ بلا اتصال
 * ومحاولةَ البطاقة منذ بُنيا (`clientSaleId`)، فعُمّم لا اختُرع.
 *
 * ## لماذا رأسٌ لا حقل
 *
 * `Idempotency-Key` المعيارُ الشائع، **ولا يدخل جسمَ الطلب**: فلا يتغيّر عقدُ الواجهة المولَّد ولا لقطتُها، ولا يرث صنفٌ
 * `@IsOptional` على حقلٍ يُلزمه صنفٌ يرثه (`SyncPosSaleDto` يُلزم `clientSaleId` ويرث `CreatePosSaleDto`).
 *
 * ## السلوك
 *
 * - المفتاحُ نفسُه بالطلب نفسِه ⇒ **المستندُ نفسُه** يُعاد ولا يُكتب ثانٍ.
 * - **طلبان معاً** بالمفتاح نفسِه ⇒ الثاني يصطدم بقيد الفرادة `(companyId, clientRequestId)` في القاعدة، فيقرأ ما كتبه الأوّل.
 * - المفتاحُ نفسُه **بطلبٍ آخر** (مبلغٌ أو طرفٌ غيرُه) ⇒ `409` مسمّى: مفتاحٌ أُعيد لغير طلبه، والصمتُ هنا يُخفي سنداً لم يُكتب.
 * - **بلا مفتاح** ⇒ كما كان: كلُّ طلبٍ مستندٌ — وهذا حدٌّ لا يُتجاوز، فبلا مميِّزٍ لا يُعرف التكرار. والواجهةُ ترسل مفتاحاً لكلِّ نافذة.
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** حروفٌ آمنةٌ للعنوان والسجلّ، من ثمانيةٍ إلى مئة — يتّسع لـUUID ولا لنصٍّ حرّ. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{8,100}$/;

/** يقرأ الرأسَ ويفحص صيغتَه — `undefined` حين لا رأس. */
export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const raw = req.headers[IDEMPOTENCY_KEY_HEADER];
  if (raw === undefined) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!KEY_SHAPE.test(value)) throw new BadRequestException(MSG.idempotency_key_invalid);
  return value;
});

/** يُرمى من داخل المعاملة حين يجد المفتاحَ مكتوباً — فتُترك المعاملةُ بلا كتابة ويُقرأ ما كُتب. */
export class IdempotentReplay extends Error {
  constructor() {
    super('idempotent replay');
  }
}

/**
 * **مرّةً لكلِّ مفتاح**: `lookup` يقرأ المستندَ المكتوبَ بالمفتاح (ويرمي `409` إن خالف الطلب)، و`create` يكتبه.
 * يُقرأ أوّلاً؛ ثم يُكتب؛ وإن اصطدم الكتابُ بقيد الفرادة (طلبٌ موازٍ سبقه) أو وجد المعاملةَ المفتاحَ مكتوباً، يُقرأ ما كُتب.
 */
export async function onceForKey<T>(key: string | undefined, lookup: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  if (!key) return create();
  const existing = await lookup();
  if (existing) return existing;
  try {
    return await create();
  } catch (e) {
    const collided = e instanceof IdempotentReplay || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002');
    if (collided) {
      const winner = await lookup();
      if (winner) return winner;
    }
    throw e;
  }
}

/**
 * A create request that carried a key, for the routes that keep their keys in `idempotency_records` rather than on the
 * document row: the key, the route it was sent to, and a fingerprint of who sent what.
 */
export interface KeyedRequest {
  key: string;
  scope: string;
  fingerprint: string;
}

/**
 * The keyed request for one route, or `undefined` when no key came (the route then behaves as it always did).
 * The fingerprint covers the actor and the whole request, so the same key with any other request is told apart.
 */
export function keyedRequest(key: string | undefined, scope: string, actor: { profileId: string }, request: unknown): KeyedRequest | undefined {
  if (!key) return undefined;
  return { key, scope, fingerprint: requestFingerprint({ actor: actor.profileId, request }) };
}

/** sha256 of a canonical JSON form: object keys sorted, undefined values dropped, dates as ISO strings. */
export function requestFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

/**
 * Runs the body of a keyed create inside the transaction that writes the document, then records the key with what it wrote.
 * A parallel request with the same key waits on the lock until this one commits, then finds the record and gives way before it
 * takes a document number; `onceForRequest` then answers it with the document this one wrote.
 */
export async function recordKeyedRequest<T>(
  tx: Prisma.TransactionClient,
  companyId: string,
  request: KeyedRequest | undefined,
  body: () => Promise<T>,
  resourceIdOf: (result: T) => string = (result) => (result as { id: string }).id,
): Promise<T> {
  if (!request) return body();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`idempotency:${companyId}:${request.key}`}))`;
  if (await tx.idempotencyRecord.findUnique({ where: { companyId_key: { companyId, key: request.key } }, select: { id: true } })) throw new IdempotentReplay();
  const result = await body();
  await tx.idempotencyRecord.create({
    data: { companyId, key: request.key, scope: request.scope, fingerprint: request.fingerprint, resourceId: resourceIdOf(result) },
  });
  return result;
}

/**
 * Once per key for the routes recorded in `idempotency_records`: a key already recorded answers with its document, refused
 * with a named 409 when it was recorded for another request; otherwise `create` runs, and `create` must wrap its
 * transaction body in `recordKeyedRequest` with the same request.
 */
export function onceForRequest<T, R = T>(
  tenantPrisma: Pick<TenantPrismaService, 'runInTenantContext'>,
  companyId: string,
  request: KeyedRequest | undefined,
  load: (tx: Prisma.TransactionClient, resourceId: string) => Promise<R | null>,
  create: () => Promise<T>,
): Promise<T | R> {
  return onceForKey<T | R>(
    request?.key,
    () =>
      tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const record = await tx.idempotencyRecord.findUnique({ where: { companyId_key: { companyId, key: request!.key } } });
        if (!record) return null;
        if (record.scope !== request!.scope || record.fingerprint !== request!.fingerprint) throw new ConflictException(MSG.idempotency_key_reused);
        const found = await load(tx, record.resourceId);
        if (!found) throw new ConflictException(MSG.idempotency_key_document_gone);
        return found;
      }),
    create,
  );
}

/** Metadata key of a POST route that takes no Idempotency-Key, read by the coverage spec. */
export const IDEMPOTENCY_EXEMPT = 'idempotency:exempt';

/**
 * Marks a POST route on a document controller that takes no Idempotency-Key, with the reason; the coverage spec refuses a
 * POST under such a controller that has neither the key nor this.
 */
export const IdempotencyExempt = (reason: string) => SetMetadata(IDEMPOTENCY_EXEMPT, reason);
