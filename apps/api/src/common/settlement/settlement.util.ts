import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { toBaseAmount } from '../currency/base-amount.util';
import { formatMessage, MessageKey, MSG } from '../i18n/messages';
import { formatMoney, round2 } from '../money/rounding';
import { money } from '../money/text';

/**
 * ⭐ **تسويةُ مستندٍ بسند — المشتركُ بين سند القبض وسند الصرف، مستخرَجاً لا منسوخاً** (`ق-٨٧١`).
 *
 * ── لماذا ملفٌّ واحد ──────────────────────────────────────────────────────────
 *
 * سندُ الصرف للمورّد **مرآةُ** سند القبض للعميل: تخصيصٌ على مستنداتٍ مفتوحة بقفلِ صفٍّ
 * (`6.12`) · «المسدَّد» و«المتبقّي» من التخصيصات لا من حقل · حالةٌ مشتقّةٌ مخزَّنة ·
 * ذمّةٌ مسوّاة بسعر **المستند** لا بسعر السند · وعكسٌ بدل الحذف. **ومنطقٌ يُنسخ يُنتج
 * نسختين تفترقان** — وقد عُدّت سبعُ نسخٍ من مُجرِّدٍ واحد في هذا المستودع أربعٌ منها
 * معطوبة (`§8.25`: المركزةُ تجعل العيبَ قابلاً للرؤية). **فالاستخراجُ هنا شرطُ قبولٍ لا
 * تحسين** — والجدولان اثنان والمسارُ واحد.
 *
 * ── ما لا يعرفه هذا الملف عمداً ──────────────────────────────────────────────
 *
 * لا يعرف عميلاً ولا مورّداً ولا حساباً: يُمرَّر له **هدفُ التسوية** (`SettlementTarget`)
 * — الجدولُ المقفول وعمودُ الطرف ومفوَّضُ التخصيصات ورسائلُ الرفض — ويعمل عليه. فسندٌ
 * ثالثٌ غداً (مستخلصُ مقاولٍ مثلاً) يعرّف هدفَه ولا ينسخ سطراً.
 *
 * ⚠️ **والمعرِّفاتُ في الاستعلام الخامّ من الهدف لا من الطلب**: `Prisma.raw` يقبل نصّاً
 * حرفياً، والأسماءُ هنا من اتحادٍ مغلق (`'invoices' | 'purchases'`) لا من مستخدم.
 */

/** فرقٌ أقلّ من هللة لا يُعتدّ به — المال يُقارن مقرَّباً لخانتين. */
export const SETTLEMENT_EPS = 0.005;

/** الحالةُ المشتقّة من المخصَّص مقابل الإجمالي — بلا بُعدٍ زمنيّ (التأخّرُ شأنُ من يعرضه). */
export type SettlementStatus = 'DUE' | 'PARTIAL' | 'PAID';

/**
 * المدفوعُ يتقدّم على كلِّ شيء: مستندٌ سُدِّد بعضُه `PARTIAL` وإن تأخّر، والمسدَّدُ كاملاً `PAID`.
 * والحسابُ بخانتين: `total - EPS` كي لا تُبقي هللةُ تقريبٍ مستنداً مفتوحاً إلى الأبد.
 */
export function deriveSettlementStatus(allocated: number, total: number): SettlementStatus {
  const paid = round2(allocated);
  const due = round2(total);
  if (paid >= due - SETTLEMENT_EPS) return 'PAID';
  if (paid > SETTLEMENT_EPS) return 'PARTIAL';
  return 'DUE';
}

/** تخصيصٌ واحد: مستندٌ ومبلغٌ بعملة السند. */
export interface SettlementAllocation {
  documentId: string;
  amount: number;
}

/**
 * مفوَّضُ جدول التخصيصات — `tx.paymentAllocation` أو `tx.supplierPaymentAllocation`.
 * يُمرَّر مفوَّضُ Prisma لا استعلامٌ خامّ **كي تحقنه طبقةُ المستأجر الأولى** كما تحقن كلَّ قراءة.
 *
 * ⚠️ الوسيطُ `never` مقصود: توقيعُ `groupBy` المولَّد لكل نموذجٍ عامٌّ متشعّب لا يُطابَق بواجهةٍ
 * مكتوبة، ودالّةٌ تقبل وسائطَ بعينها تُسنَد إلى ما يقبل `never` — فيُقبل أيُّ مفوَّضٍ له `groupBy`
 * بلا `as` عند كل استدعاء، ويُحصر التحويلُ في `allocatedByDocument` وحدَه.
 */
export interface AllocationDelegate {
  groupBy: (args: never) => Promise<unknown>;
}

type GroupedAllocation = Record<string, unknown> & { _sum: { amount: Prisma.Decimal | number | null } };

export interface SettlementTarget {
  /** الجدولُ الذي يُقفل صفُّه عند التخصيص. */
  table: 'invoices' | 'purchases';
  /** عمودُ الطرف عليه — من يملك المستند. */
  partyColumn: 'customerId' | 'supplierId';
  /** مفتاحُ المستند في جدول التخصيصات. */
  documentKey: 'invoiceId' | 'purchaseId';
  allocations: AllocationDelegate;
  /** رسالتا الرفض المسمّاتان — مستندٌ لا يوجد، ومستندٌ لطرفٍ آخر. */
  documentNotFound: MessageKey;
  wrongParty: MessageKey;
}

/** مجموعُ المخصَّص لكل مستند — **مصدرُ الحقيقة الوحيد لـ«المسدَّد»**، في استعلامٍ واحد. */
export async function allocatedByDocument(target: SettlementTarget, documentIds: string[]): Promise<Map<string, number>> {
  if (!documentIds.length) return new Map();
  const groupBy = target.allocations.groupBy as unknown as (args: {
    by: string[];
    where: Record<string, unknown>;
    _sum: { amount: true };
  }) => Promise<GroupedAllocation[]>;
  const rows = await groupBy({
    by: [target.documentKey],
    where: { [target.documentKey]: { in: documentIds } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [String(r[target.documentKey]), round2(Number(r._sum.amount ?? 0))]));
}

export async function allocatedFor(target: SettlementTarget, documentId: string): Promise<number> {
  return (await allocatedByDocument(target, [documentId])).get(documentId) ?? 0;
}

/**
 * يُلحق بكل مستندٍ مخصَّصَه ومتبقّيَه محسوبَين، **ويُبقي المفتوحَ وحدَه** — شاشةُ توزيع السند.
 */
export function withRemaining<T extends { id: string; total: Prisma.Decimal | number | string }>(
  documents: T[],
  allocated: Map<string, number>,
): Array<T & { allocated: number; remaining: number }> {
  return documents
    .map((doc) => {
      const paid = allocated.get(doc.id) ?? 0;
      return { ...doc, allocated: paid, remaining: round2(Number(doc.total) - paid) };
    })
    .filter((doc) => doc.remaining > SETTLEMENT_EPS);
}

/**
 * يُلحق بالسند **مخصَّصَه** (مجموعُ تخصيصاته — موقَّعاً: العاكسُ سالبٌ) **وغيرَ المخصَّص** منه
 * (مبلغُه − مخصَّصُه) — نصّاً بخانتين على الحدّ (`ق-١٢٣٥`). كانت شاشةُ السندات تجمع التخصيصات
 * بنفسها (`ق-١٢٤٣`: الشاشةُ تقرأ ولا تحسب)؛ والحسابُ هنا لأن الملفَّ هو مالكُ معنى التخصيص للجانبين.
 */
export function withAllocatedTotals<T extends { amount: Prisma.Decimal | number | string; allocations: { amount: Prisma.Decimal | number | string }[] }>(
  payment: T,
): T & { allocatedTotal: string; unallocated: string } {
  const allocated = round2(payment.allocations.reduce((s, a) => s + Number(a.amount), 0));
  return { ...payment, allocatedTotal: money(allocated), unallocated: money(Number(payment.amount) - allocated) };
}

interface LockedDocument {
  id: string;
  no: string;
  total: string;
  currency: string;
  partyId: string;
  exchangeRate: string;
}

/**
 * **يقفل صفَّ المستند الأصليّ قبل أن يُحسب ما بقي منه** (`ق-١٥٧٥` · البندُ 18 من مراجعة 3.3).
 *
 * الردُّ والإشعاراتُ تحسب «القابلَ للردّ» و«المتبقّي من الأصل» بمجاميعَ عادية ثم تكتب، فمعاملتان متزامنتان
 * تقرآن المجموعَ نفسَه قبل أن تلتزم إحداهما وتمرّان معاً: ردّان بألفٍ على إشعارٍ بألف. فالقفلُ على **الأصل**
 * لا على الإشعار، لأن إشعاراتٍ عدّة على أصلٍ واحد تتقاسم رصيدَه؛ والثانيةُ تنتظر هنا ثم تقرأ المجاميعَ **بعد**
 * التزام الأولى (`READ COMMITTED` يقرأ الملتزَم عند كلِّ عبارة)، فتُرفض مسمّاةً. وهو نمطُ القفل أدناه بعينه،
 * والجدولُ من اتحادٍ مغلق لا من الطلب.
 *
 * **ونظائرُه في الجزء الثاني** (توجيه ٢٧٤ · مسحُ نظائر البندين 18 و27): كلُّ فعلٍ يفحص حالَ مستندٍ ثم يكتب أثراً يقفل
 * صفَّه **قبل** الفحص: اعتمادُ الشطب · إقفالُ المناوبة · إلغاءُ التسوية والإيداع والعقد؛ والإيداعُ يقفل **الدرج** قبل
 * أن يقيس رصيدَه. فالثاني ينتظر هنا ثم يقرأ ما التزمه الأوّل ويُرفض برسالته.
 */
export type LockableDocument = 'invoices' | 'purchases' | 'inventory_write_offs' | 'pos_shifts' | 'network_settlements' | 'cash_deposits' | 'contracts' | 'cash_drawers';

export async function lockDocumentRow(tx: Prisma.TransactionClient, table: LockableDocument, id: string): Promise<void> {
  const t = Prisma.raw(`"${table}"`);
  await tx.$queryRaw`SELECT id FROM ${t} WHERE id = ${id} FOR UPDATE`;
}

/**
 * يقفل صفوفَ المستندات المستهدفة ثم يتحقّق من الحدَّين:
 * مجموعُ التخصيصات ≤ مبلغُ السند · وكلُّ تخصيصٍ ≤ متبقّي مستندِه.
 *
 * الترتيبُ مقصود (`6.12`): قفلُ الصفّ داخل المعاملة يجعل المتسابقَ الثاني ينتظر هنا، ثم يقرأ
 * المتبقّي **بعد** خصم الأول — فيُرفض مسمّىً بدل أن يتجاوزه. ويعيد سعرَ صرف كل مستندٍ
 * لأن الذمّة تُسوّى بسعره لا بسعر السند.
 */
export async function lockAndAssertAllocationsFit(
  tx: Prisma.TransactionClient,
  target: SettlementTarget,
  settlement: { amount: number; currency: string; partyId: string; allocations: SettlementAllocation[] },
): Promise<Map<string, { exchangeRate: number }>> {
  const rates = new Map<string, { exchangeRate: number }>();
  if (!settlement.allocations.length) return rates;

  const sum = round2(settlement.allocations.reduce((s, a) => s + a.amount, 0));
  if (sum > Math.abs(settlement.amount) + SETTLEMENT_EPS) {
    throw new BadRequestException(
      formatMessage(MSG.allocations_exceed_payment, { sum: formatMoney(sum), amount: formatMoney(Math.abs(settlement.amount)) }),
    );
  }

  const table = Prisma.raw(`"${target.table}"`);
  const partyColumn = Prisma.raw(`"${target.partyColumn}"`);
  for (const a of settlement.allocations) {
    const locked = await tx.$queryRaw<LockedDocument[]>`
      SELECT id, no, total::text, currency, ${partyColumn} AS "partyId", "exchangeRate"::text
      FROM ${table} WHERE id = ${a.documentId} FOR UPDATE`;
    if (!locked.length) throw new NotFoundException(target.documentNotFound);
    const doc = locked[0];

    if (doc.partyId !== settlement.partyId) throw new BadRequestException(formatMessage(target.wrongParty, { no: doc.no }));
    // عملتان مختلفتان تجعلان «المتبقّي» و«المخصَّص» بمقياسين — رفضٌ صريح خيرٌ من تخصيصٍ صامتٍ خاطئ.
    if (doc.currency !== settlement.currency) {
      throw new BadRequestException(
        formatMessage(MSG.allocation_currency_mismatch, { no: doc.no, invoiceCurrency: doc.currency, paymentCurrency: settlement.currency }),
      );
    }

    const remaining = round2(Number(doc.total) - (await allocatedFor(target, a.documentId)));
    if (a.amount > remaining + SETTLEMENT_EPS) {
      throw new BadRequestException(
        formatMessage(MSG.allocation_exceeds_remaining, { no: doc.no, remaining: formatMoney(remaining), amount: formatMoney(a.amount) }),
      );
    }
    rates.set(a.documentId, { exchangeRate: Number(doc.exchangeRate) });
  }
  return rates;
}

/**
 * الذمّةُ المسوّاة بالعملة الأساسية: كلُّ تخصيصٍ بسعر **مستندِه** (فذمّتُه قُيّدت بذلك السعر)،
 * وما لم يُخصَّص بسعر السند (لا مستندَ يُنسب إليه — دفعةٌ على الحساب). والفارقُ بينها وبين
 * النقد بسعر يومه فرقُ صرفٍ محقَّق.
 */
export function baseSettledOf(
  amount: number,
  settlementRate: number,
  allocations: SettlementAllocation[],
  rates: Map<string, { exchangeRate: number }>,
): number {
  const allocatedSum = round2(allocations.reduce((s, a) => s + a.amount, 0));
  const fromAllocations = allocations.reduce((s, a) => s + toBaseAmount(a.amount, rates.get(a.documentId)?.exchangeRate ?? settlementRate), 0);
  const onAccount = toBaseAmount(round2(amount - allocatedSum), settlementRate);
  return round2(fromAllocations + onAccount);
}

/**
 * حارسا العكس: سندٌ عاكس لا يُعكس ولا يُعاد توزيعه، وأصلٌ عُكس مرّةً لا يُعكس ثانية —
 * والرفضُ يسمّي السندَ العاكس القائم.
 */
export function assertReversible(original: { reversesId: string | null }, existingReversal: { no: string } | null): void {
  if (original.reversesId) throw new ConflictException(MSG.payment_reversal_immutable);
  if (existingReversal) throw new ConflictException(formatMessage(MSG.payment_already_reversed, { no: existingReversal.no }));
}

// أثرُ السند على مرآة البنك (`mirrorBankMovement`) يعيش في `journal/auto-posting.util` لا هنا:
// المرآةُ تُكتب من مسار الترحيل وحدَه (`ق-٢٨٢`) — فتسكن الملفَّ الذي يُرحّل.
