import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatMessage, type MessageKey } from '../i18n/messages';
import { round2 } from '../money/rounding';

/**
 * ⚖️ **مصدرٌ واحد لِما يشترك فيه إشعارُ البيع وإشعارُ المورّد** (`ق-١٠٠٨`/١ — «يُستخرَج ولا يُنسخ»).
 *
 * الإشعارُ مستندُ تعديلٍ على أصل — في الجانبين: يُفحص الأصلُ، وتُعبَّأ بنودُه من الأصل، ويُتحقَّق
 * من بنود المرتجع، ويُسقَف بما تبقّى، ويدخل التقاريرَ بإشارته، ويخفّض المتبقّي. هذه الستّةُ
 * **استُخرجت من `invoices.service` إلى هنا** ويستدعيها الجانبان — وما يختلف (الحساباتُ، والرفُّ
 * خروجاً أو دخولاً، والهيئةُ والختمُ والرقم) يبقى في جانبه **لسببٍ واحدٍ مكتوب: مستندُنا أم
 * مستندُهم** (`ق-١٠٠٦`).
 */
export type NoteSide = 'credit' | 'debit';

/** أنواعُ مستندات جانبٍ واحد: الأساسُ وإشعاراه — `INVOICE`/`CREDIT_NOTE`/`DEBIT_NOTE` أو نظيرُها في الشراء. */
export interface NoteKinds<K extends string> {
  base: K;
  credit: K;
  debit: K;
}

/**
 * ① **الهدفُ الذي يقبل الإشعار**: المستندُ الأساس، أو **الإشعارُ المقابل** (دائنٌ على مدينٍ زائد
 * وعكسُه — `ق-٩٥٢`)، ولا إشعارَ على إشعارٍ من نوعه (يعكس مرّتين أو يفوتر مرّتين) — ولا على مُغلَق
 * (مردودةٌ في البيع). يُعيد إن كان الهدفُ إشعاراً مقابلاً، فلا مرتجعَ فيه ولا رفّ.
 */
export function assertAdjustableTarget<K extends string>(
  original: { docType: K; closed: boolean },
  side: NoteSide,
  kinds: NoteKinds<K>,
  messages: { invalid: MessageKey; closed: MessageKey },
): { correctsOpposite: boolean } {
  const opposite = side === 'credit' ? kinds.debit : kinds.credit;
  if (original.docType !== kinds.base && original.docType !== opposite) throw new BadRequestException(messages.invalid);
  if (original.closed) throw new BadRequestException(messages.closed);
  return { correctsOpposite: original.docType === opposite };
}

export interface OriginalLine {
  id: string;
  description: string;
  productId: string | null;
  quantity: Prisma.Decimal | number;
  unitPrice: Prisma.Decimal | number;
  /** ④B1 — خصمُ السطر كما كُتب على الأصل؛ الإشعارُ الكامل ينقله كي يعكس ما فُوتر لا الإجمالي. */
  discount?: Prisma.Decimal | number | null;
  taxRate: Prisma.Decimal | number;
  /** ⑧ فئةُ الضريبة وسببُها كما كُتبت على الأصل — تُنقل مع السطر لا تُقرأ من البطاقة (سطرُ الشراء بلا فئةٍ بعد). */
  taxCategory?: string | null;
  taxExemptionReasonCode?: string | null;
  taxExemptionReason?: string | null;
}

/**
 * ② **الإشعارُ الكامل يُعبَّأ من بنود الأصل** — والصنفُ يُنقل مع السطر: إشعارٌ يفقد صنفه يعكس
 * القيمةَ ولا يستطيع عكس تكلفته. و`extra` ما يضيفه كلُّ جانبٍ على سطره (رابطُ المرتجع وحالتُه).
 * ⑧ وفئةُ الضريبة تُنقل كما كُتبت: الإشعارُ يعكس ما فُوتر لا ما على البطاقة اليوم.
 */
export function linesFromOriginal<L extends OriginalLine, X extends object>(lines: readonly L[], extra: (line: L) => X) {
  return lines.map((l) => ({
    description: l.description,
    productId: l.productId ?? undefined,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    discount: Number(l.discount ?? 0),
    taxRate: Number(l.taxRate),
    ...(l.taxCategory
      ? { taxCategory: l.taxCategory as 'S' | 'Z' | 'E' | 'O', taxExemptionReasonCode: l.taxExemptionReasonCode ?? undefined, taxExemptionReason: l.taxExemptionReason ?? undefined }
      : {}),
    ...extra(l),
  }));
}

/**
 * ③ **سطرُ مرتجعٍ يشير إلى سطرٍ من الأصل نفسِه** (`SPEC 30.2`) وبصنفه، وبكميةٍ لا تتجاوز ما في الأصل
 * — والتراكمُ عبر الإشعارات السابقة يفحصه جانبُ الرفّ من الحركات. سطرٌ بلا رابطٍ إشعارٌ محاسبيّ.
 */
export function assertReturnLinesBelong<L extends { id: string; productId: string | null; quantity: Prisma.Decimal | number }>(
  lines: readonly { returnsId?: string | null; productId?: string | null; quantity: number }[],
  originalLines: readonly L[],
  messages: { notOriginal: MessageKey; exceeds: MessageKey },
): void {
  const byId = new Map(originalLines.map((l) => [l.id, l]));
  for (const l of lines) {
    if (!l.returnsId) continue;
    const source = byId.get(l.returnsId);
    if (!source) throw new BadRequestException(messages.notOriginal);
    if (l.quantity > Number(source.quantity) + 1e-9) {
      throw new BadRequestException(formatMessage(messages.exceeds, { sold: Number(source.quantity), returned: 0, requested: l.quantity }));
    }
    if (source.productId && l.productId && l.productId !== source.productId) throw new BadRequestException(messages.notOriginal);
  }
}

/**
 * ④ **السقفُ من الأصل** (`ق-١٠٠٦`/⑤): مجموعُ إشعاراتِ الجهة الواحدة على أصلٍ لا يتجاوزه — وما ردَّه
 * إشعارٌ سابق يُخصم. الطرفان مدوَّران إلى مقياس المال قبل المقارنة، والهامشُ يمتصّ التمثيلَ العائم
 * لا فرقَ تدوير (وهو ما كان يرفض ائتماناً كاملاً مشروعاً). يُعيد المتبقّي.
 */
export function assertWithinRemaining(noteTotal: number, originalTotal: number, priorNotesTotal: number, message: MessageKey): number {
  const remaining = round2(originalTotal - priorNotesTotal);
  if (round2(noteTotal) > remaining + 0.001) throw new BadRequestException(message);
  return remaining;
}

/** ⑤ **إشارةُ المستند في الإقرار والتقارير**: الدائنُ يخفّض وما عداه يزيد — والمبالغُ مخزَّنةٌ موجبةً، فالنوعُ يحمل الاتجاه. */
export function adjustmentSign(docType: string, creditKind: string): 1 | -1 {
  return docType === creditKind ? -1 : 1;
}

/**
 * ⑥ **المتبقّي على مستندٍ** بعد إشعاراته الدائنة وما خُصّص عليه من سندات — والإشعارُ الدائن نفسُه لا
 * متبقّيَ عليه (هو التخفيض). مُسقَّفٌ بالصفر: مستندٌ ائتُمن كلُّه وسُدِّد لا يقرأ ديناً على الطرف الآخر.
 * (قاعدة `4.5`: أي رقم يعرض «المتبقّي» يُحسب من التخصيصات لا من حقل.)
 */
export function outstandingAfterNotes(
  doc: { docType: string; total: Prisma.Decimal | number | string },
  credited: number,
  allocated: number,
  creditKind: string,
): number {
  if (doc.docType === creditKind) return 0;
  return Math.max(0, round2(Number(doc.total) - credited - allocated));
}
