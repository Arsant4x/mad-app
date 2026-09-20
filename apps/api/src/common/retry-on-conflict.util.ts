import { Prisma } from '@prisma/client';

/**
 * Retries `fn` (a full `runInTenantContext` call — a fresh transaction each
 * time) when it fails on a unique-constraint violation (P2002) **on a document
 * number**. Used for numbering schemes (invoice/purchase "no", the unit's
 * `zatcaIcv`, the append-only logs' `seq`): under concurrent creates for the
 * same company, two transactions can compute the same next number, and the
 * loser's INSERT fails on `@@unique([companyId, no])`. A retry re-reads the
 * position, which by then reflects the winner's commit, so it converges instead
 * of surfacing a raw 500.
 *
 * ⚖️ **محصورةٌ في قيد الرقم** (`ق-١١٩٨`/④ — مراجعةٌ خارجية). كانت تُعيد على **أيّ** `P2002`:
 * رمزُ حسابٍ مكرَّر، أو دفعةُ صنفٍ مكرَّرة، أو وحدةٌ برقمٍ قائم — كلُّها كانت تُعاد ثماني مرّاتٍ
 * بمهلٍ عشوائية ثم تسقط بالخطأ نفسِه (مقيس: `8` نداءاتٍ على قيدٍ ليس رقماً). والإعادةُ لا
 * تُصلح تعارضاً ثابتاً، وتُطيل الرفضَ وتُعيد كلَّ ما في المعاملة من قراءاتٍ ثماني مرّات.
 * الفيصلُ **أعمدةُ القيد** حين يبلّغ بها Prisma (`meta.target`)، **وإلا فالنموذجُ** (`meta.modelName`)
 * — مقيسٌ على القاعدة (`retry-on-conflict-shape.e2e-spec`): بدور التطبيق يصل `target: null`
 * والرسالةُ «`(not available)`»، فالفيصلُ الأوّلُ وحدَه كان سيُطفئ الإعادةَ كلَّها بصمت. والنماذجُ
 * المرقَّمة **مشتقّةٌ من المخطّط**: كلُّ نموذجٍ له قيدُ فرادةٍ يحمل عمودَ ترقيم.
 */
export const NUMBERING_COLUMNS: readonly string[] = ['no', 'zatcaIcv', 'seq'];

/** النماذجُ التي يحمل أحدُ قيودها الفريدة عمودَ ترقيم — من `DMMF` لا من قائمةٍ تُكتب. */
export const NUMBERED_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models.filter((m) => m.uniqueFields.some((fields) => fields.some((f) => NUMBERING_COLUMNS.includes(f)))).map((m) => m.name),
);

/** هل الخطأُ `P2002` على قيدِ ترقيم؟ بأعمدة القيد إن بلّغها Prisma، وإلا بالنموذج. */
export function isNumberingConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  const meta = (e.meta ?? {}) as { target?: unknown; modelName?: unknown };
  const columns = Array.isArray(meta.target) ? meta.target.map(String) : typeof meta.target === 'string' ? [meta.target] : null;
  if (columns !== null) return columns.some((c) => NUMBERING_COLUMNS.includes(c));
  return typeof meta.modelName === 'string' && NUMBERED_MODELS.has(meta.modelName);
}

export async function retryOnUniqueConflict<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const isLastAttempt = i === attempts - 1;
      if (isNumberingConflict(e) && !isLastAttempt) {
        // Random jitter, not a fixed delay: without it, two callers that
        // collided once tend to stay in lockstep (both re-read the position at
        // the same relative offset and collide again on every retry).
        await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40));
        continue;
      }
      throw e;
    }
  }
  /* istanbul ignore next — unreachable: the loop always returns or throws */
  throw new Error('retryOnUniqueConflict: unreachable');
}
