import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { formatMessage, MSG } from '../i18n/messages';

type Tx = Prisma.TransactionClient;

/**
 * ٥+٦ **حلُّ دفعةِ استلامٍ** — المدخلُ الواحد لكلِّ ما يُدخل بضاعةً (استلامُ شراءٍ · إدخالٌ يدويّ) (`ق-١٠٨٦`)،
 * بأحكام المالك (`ق-١٠٩٠` · `ق-١٠٩١`):
 *
 * الدفعةُ كيانٌ **هويّتُه صنفٌ ورقم**، وانتهاؤه واحدٌ لا يتغيّر؛ تشير إليه الطبقة. والقاعدةُ:
 *   - صنفٌ معلَنٌ تتبّعُه (`expiryTracked = true`) **بلا دفعةٍ على الاستلام** ⟵ يُرفض `400` باسمه **بلا كتابة**
 *     (`ق-١٠٩١`): «القبولُ يُعيد الـ218 بلباسٍ جديد، وهو الصفرُ الصامت بعينه».
 *   - رقمُ دفعةٍ بلا انتهاء ⟵ يُردّ: الدفعةُ تُعلَن بانتهائها، فلا دفعةَ بلا انتهاء (`ق-١٠٨١`).
 *   - رقمٌ قائمٌ لهذا الصنف **بانتهاءٍ آخر** ⟵ يُرفض `409` باسمه **بلا كتابة** (`ق-١٠٩٠`): «الدفعةُ هويّةٌ، وما يُعلَّق
 *     عليه التاريخُ لا يتغيّر» — والقاعدةُ تحرسه بمفتاحٍ فريد `(companyId, productId, batchNo)` فلا يُترك البابُ لمن يأتي بعدنا.
 *   - رقمٌ قائمٌ بالانتهاء نفسِه ⟵ تُعاد الدفعةُ نفسُها (استلامٌ ثانٍ من الدفعة).
 *   - لا رقمَ ولا انتهاء لصنفٍ غيرِ معلَنٍ (أو لم يُعلَن بعد) ⟵ `null`: طبقةٌ بلا دفعة كما كان.
 *
 * وصنفٌ لم يُعلن تتبّعَه بعد (`null`) لا يُحبس استلامُه — يُعدّ ويُعلَن عند لمسه (`ق-١٠٨٣`)؛ حدٌّ مقصود لا سهو.
 *
 * **والإدراجُ بالمفتاح لا بالقراءة**: `INSERT … ON CONFLICT DO NOTHING` على المفتاح نفسِه — فاستلامان متزامنان لدفعةٍ
 * جديدة لا يُسقطان أحدَهما بخطأ فرادةٍ يُفسد المعاملة، بل يقرأ الثاني ما كتبه الأوّل ويقيس انتهاءَه كالمسار العادي.
 */
export interface ReceiptBatchInput {
  productId: string;
  expiryTracked: boolean | null;
  batchNo: string | null | undefined;
  expiryDate: Date | null | undefined;
}

export async function resolveReceiptBatch(tx: Tx, companyId: string, input: ReceiptBatchInput): Promise<string | null> {
  const batchNo = input.batchNo?.trim() || null;
  const expiryDate = input.expiryDate ? toDateOnly(input.expiryDate) : null;

  if (!batchNo) {
    if (input.expiryTracked === true) throw new BadRequestException(MSG.batch_required);
    return null;
  }
  if (!expiryDate) throw new BadRequestException(MSG.batch_expiry_required);

  const existing = await findBatch(tx, companyId, input.productId, batchNo);
  if (existing) return sameOrConflict(existing, batchNo, expiryDate);

  const id = randomUUID();
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "stock_batches" ("id", "companyId", "productId", "batchNo", "expiryDate")
    VALUES (${id}, ${companyId}, ${input.productId}, ${batchNo}, ${expiryDate}::date)
    ON CONFLICT ("companyId", "productId", "batchNo") DO NOTHING
    RETURNING "id"`;
  if (inserted.length === 1) return inserted[0].id;

  // سبقنا غيرُنا إلى الرقم نفسِه في هذه اللحظة — يُقرأ ما كتب ويُقاس انتهاؤه كالمسار العادي.
  const raced = await findBatch(tx, companyId, input.productId, batchNo);
  if (!raced) throw new Error(`الدفعةُ ${batchNo} لم تُدرَج ولم تُقرأ — سباقٌ لم يُحسم`);
  return sameOrConflict(raced, batchNo, expiryDate);
}

function findBatch(tx: Tx, companyId: string, productId: string, batchNo: string) {
  return tx.stockBatch.findFirst({ where: { companyId, productId, batchNo }, select: { id: true, expiryDate: true } });
}

function sameOrConflict(batch: { id: string; expiryDate: Date }, batchNo: string, expiryDate: Date): string {
  if (toDateOnly(batch.expiryDate).getTime() !== expiryDate.getTime()) {
    throw new ConflictException(formatMessage(MSG.batch_expiry_conflict, { batchNo, existing: batch.expiryDate.toISOString().slice(0, 10) }));
  }
  return batch.id;
}

/** اليومُ بلا وقت (`@db.Date` يعود من Prisma منتصفَ ليلٍ بتوقيت UTC) — فالمقارناتُ على الأيام لا اللحظات. */
export function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** هل انتهت الدفعةُ في يوم الحركة؟ — الانتهاءُ يومٌ، والحركةُ يومٌ؛ والمساوي لم ينتهِ بعد. */
export function isExpiredOn(expiryDate: Date, on: Date): boolean {
  return toDateOnly(expiryDate).getTime() < toDateOnly(on).getTime();
}
