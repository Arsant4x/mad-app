import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../i18n/messages';

type Tx = Prisma.TransactionClient;

/**
 * ٥+٦ **حلُّ دفعةِ استلامٍ** — المدخلُ الواحد لكلِّ ما يُدخل بضاعةً (استلامُ شراءٍ · إدخالٌ يدويّ) (`ق-١٠٨٦`).
 *
 * الدفعةُ كيانٌ: رقمٌ وانتهاءٌ واحد لصنفٍ في منشأة، تشير إليه الطبقة. والقاعدةُ:
 *   - صنفٌ معلَنٌ تتبّعُه (`expiryTracked = true`) **بلا دفعةٍ على الاستلام** ⟵ يُردّ مسمًّى **بلا كتابة** — فالحكمُ في
 *     قبوله بلا دفعة (`§٤/٤` من الموجز: رفضٌ `400` · أو قبولٌ بطبقةٍ بلا دفعة) **ينتظر المالك**، ولا يُختار له
 *     بديلٌ هنا؛ والردُّ يقول ذلك بنصّه (`ق-١٠٨٦`).
 *   - رقمُ دفعةٍ بلا انتهاء ⟵ يُردّ: الدفعةُ تُعلَن بانتهائها، فلا دفعةَ بلا انتهاء (`ق-١٠٨١`).
 *   - رقمٌ قائمٌ لهذا الصنف **بانتهاءٍ آخر** ⟵ يُردّ مسمًّى **بلا كتابة** — والحكمُ (`§٤/٣`: رفضٌ · أو دفعةٌ جديدة
 *     بمفتاحٍ يشمل الانتهاء) **ينتظر المالك**؛ والمفتاحُ الفريد في المخطَّط يقبل البديلين فلا يُحسم هنا.
 *   - رقمٌ قائمٌ بالانتهاء نفسِه ⟵ تُعاد الدفعةُ نفسُها (استلامٌ ثانٍ من الدفعة).
 *   - لا رقمَ ولا انتهاء لصنفٍ غيرِ معلَنٍ (أو لم يُعلَن بعد) ⟵ `null`: طبقةٌ بلا دفعة كما كان.
 *
 * وصنفٌ لم يُعلن تتبّعَه بعد (`null`) لا يُحبس استلامُه — يُعدّ ويُعلَن عند لمسه (`ق-١٠٨٣`)؛ حدٌّ مقصود لا سهو.
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
    if (input.expiryTracked === true) throw new BadRequestException(MSG.batch_required_pending_ruling);
    return null;
  }
  if (!expiryDate) throw new BadRequestException(MSG.batch_expiry_required);

  const existing = await tx.stockBatch.findFirst({
    where: { companyId, productId: input.productId, batchNo },
    orderBy: { createdAt: 'asc' },
    select: { id: true, expiryDate: true },
  });
  if (existing) {
    if (toDateOnly(existing.expiryDate).getTime() !== expiryDate.getTime()) {
      throw new ConflictException(
        formatMessage(MSG.batch_expiry_conflict_pending_ruling, { batchNo, existing: existing.expiryDate.toISOString().slice(0, 10) }),
      );
    }
    return existing.id;
  }

  const created = await tx.stockBatch.create({
    data: { companyId, productId: input.productId, batchNo, expiryDate },
    select: { id: true },
  });
  return created.id;
}

/** اليومُ بلا وقت (`@db.Date` يعود من Prisma منتصفَ ليلٍ بتوقيت UTC) — فالمقارناتُ على الأيام لا اللحظات. */
export function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** هل انتهت الدفعةُ في يوم الحركة؟ — الانتهاءُ يومٌ، والحركةُ يومٌ؛ والمساوي لم ينتهِ بعد. */
export function isExpiredOn(expiryDate: Date, on: Date): boolean {
  return toDateOnly(expiryDate).getTime() < toDateOnly(on).getTime();
}
