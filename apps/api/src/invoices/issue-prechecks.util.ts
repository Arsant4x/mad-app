import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { computeDocumentTotals } from '../common/money/totals';
import { assertPeriodOpen } from '../fiscal/period-lock.util';
import {
  adjustmentNotePostingCodes,
  assertPostingAccounts,
  COST_OF_SALES_CODE,
  invoicePostingCodes,
  prepaymentApplicationPostingCodes,
  prepaymentInvoicePostingCodes,
} from '../journal/auto-posting.util';
import { assertInventoryAccountUsable } from '../journal/inventory-accounts.util';
import { assertCustomerPrepaymentsAccountUsable } from '../journal/prepayment-account.util';
import { assertReturnsWithinSold, deductionPlan, ReturnExceedsSoldError, type ReturnRequestLine } from './sale-fulfilment.util';

/**
 * ⚖️ **المستندُ الضريبيّ يُفحص قبل ترقيمه** (`ق-١٤٩٠` — «ما يحمل رقمَ مستندٍ ضريبيّ يُفحص قبل الترقيم»).
 *
 * ## العلّة
 *
 * رقمُ المستند يُحجز على منفذ العدّاد ويلتزم فوراً (`common/sequence-allocator.ts` — «الرقمُ لا يرتدّ مع معاملة العمل»)،
 * **فكلُّ رفضٍ بعد سطر الترقيم يترك فجوةً في سلسلةٍ تصل الهيئة** (`INV` · `CN` · `DN` · `PP` — رقمُها معرّفُ المستند
 * المختوم). وكان يُرفض بعد الترقيم: الفترةُ المقفلة أو الغائبة (عبر `createJournalEntry`) · حسابُ `5100` لقيد التكلفة ·
 * حسابُ `1300`/`2450` بنوعٍ آخر · فحوصُ الدفعات المقدَّمة الأربعة · الإرجاعُ فوق المبيع تراكمياً · حساباتُ قيد الإشعار ·
 * وحسابُ `2200` لمستند الدفعة المقدَّمة. **والقياسُ** قراءةُ الشيفرة في جولة `ق-١٤٩٠` (جدولُ المسارات المرقَّمة)،
 * **والإثباتُ الحيّ** `test/tax-docs-checked-before-numbering.e2e-spec.ts` — يوكّد الرقمَ التاليَ متّصلاً لا الرفضَ وحده.
 *
 * ## القاعدة
 *
 * **كلُّ فحصٍ هنا يقرأ ما يقرؤه التنفيذ بعينه** (رموزُ القيد من دوالّها في `auto-posting.util` · ما سيُخصم من
 * `deductionPlan` · ما بِيع وأُعيد من `assertReturnsWithinSold`) — فلا يفترق الفحصُ عن رفض التنفيذ الذي يتقدّمه. **والفحصُ
 * الموجود بعد الترقيم يبقى طبقةً ثانية** لما يتغيّر بين الفحص والكتابة في معاملاتٍ متزامنة (نمط `#634`: «هذا الفحصُ
 * يسمّي، والقاعدةُ تمنع»).
 *
 * ⚠️ **وحدودُه معلَنة**: (١) **المراجعُ الداخلية** (`JE` · `RCV` · `PAY` · `PUR` · …) خارجه — حدٌّ معلَن بقرار المالك.
 * (٢) **سقوطُ البنية** (مهلةُ المعاملة · تعارضٌ متزامن يعيده `retryOnUniqueConflict`) يحرق الرقمَ بعد الترقيم ولا يمنعه
 * فحصٌ مسبق — ثمنُ المنفذ المستقلّ (`ق-٣٤٨`). (٣) **بيعٌ بصنفٍ متعقَّب تكلفتُه صفر** (مؤقّتٌ بلا تكلفةٍ معروفة) لا قيدَ
 * تكلفةٍ له، والفحصُ يطلب `5100` وفترتَه مع ذلك — أشدُّ من التنفيذ بحالةٍ حدّية، لا أرخى.
 */

type Tx = Prisma.TransactionClient;

/** الرفضُ الواحد لمرتجعٍ فوق المبيع — برسالته وأرقامه، للفحص قبل الترقيم وللتنفيذ بعده. */
export function returnExceedsSoldRefusal(e: ReturnExceedsSoldError): BadRequestException {
  return new BadRequestException(formatMessage(MSG.return_exceeds_sold, { sold: e.sold, returned: e.alreadyReturned, requested: e.requested }));
}

const PREPAYMENT_DOC_INCLUDE = {
  appliedAsPrepayment: { select: { invoiceId: true } },
  prepaymentPayment: { select: { id: true } },
} as const;

/** مستندُ دفعةٍ مقدَّمة (386) جاز تطبيقُه — مقروءاً بما يحتاجه التطبيق. */
export type ApplicablePrepayment = Prisma.InvoiceGetPayload<{ include: typeof PREPAYMENT_DOC_INCLUDE }>;

/**
 * ④A1 · (`ق-١٤٩٠`) **الدفعاتُ المقدَّمة المسمّاة تُفحص قبل ترقيم فاتورة التوريد** — الفحوصُ الأربعة التي كانت في
 * `applyPrepayments` بعد الترقيم، بنصّها وترتيبها: ما ليس دفعةً مقدَّمة · لعميلٍ آخر · طُبّق من قبل · ما يفوق مجموعُه
 * إجماليَّ الفاتورة (بعملتها، تراكمياً بترتيب الطلب). ويُعيدها مرتَّبةً فيطبّقها التنفيذ بلا قراءةٍ ثانية؛ ويبقى عدُّ
 * التخصيص المنقول (`moved.count !== 1`) هناك طبقةَ السباق.
 *
 * **على مستوى المنشأة بحقّها**: مستندُ 386 يُقرأ بمعرّفه المسمّى في الطلب أيّاً كان فرعُ سند قبضه — فالدفعةُ المقدَّمة
 * التزامٌ للعميل على المنشأة، وقراءتُها بفرع القارئ تردّ «غيرَ موجود» لمستندٍ قائم يُطبَّق على توريدٍ من فرعٍ آخر.
 */
export async function readApplicablePrepayments(
  tx: Tx,
  sale: { customerId: string; currency: string; total: number; prepaymentInvoiceIds: readonly string[] },
): Promise<ApplicablePrepayment[]> {
  const ids = [...new Set(sale.prepaymentInvoiceIds)];
  const docs = await tx.invoice.findMany({ where: { id: { in: ids } }, include: PREPAYMENT_DOC_INCLUDE });
  const ordered: ApplicablePrepayment[] = [];
  let applied = 0;
  for (const id of ids) {
    const doc = docs.find((d) => d.id === id);
    if (!doc || doc.docType !== 'PREPAYMENT' || !doc.prepaymentPayment) throw new NotFoundException(MSG.prepayment_not_found);
    if (doc.customerId !== sale.customerId) throw new BadRequestException(formatMessage(MSG.prepayment_other_customer, { no: doc.no }));
    // ⚖️ (`ق-١٥٠٣`/ب) **مقدَّمٌ بعملةٍ لا يُطبَّق على فاتورةٍ بأخرى** — كان يمرّ فيُدين `1200` بأساس المقدَّم لا بسعر التوريد، وتُقارَن
    //    مبالغُ بعملتين كأنها عملةٌ واحدة (القياس B4 · P5). وهو لا يتوقّف على الإطار المحاسبيّ؛ واتّجاهُ فرق السعر بالعملة نفسِها
    //    ينتظر قراءةَ القسم الثلاثين. **وقبل مقارنة المجموع** — فتلك لا معنى لها بعملتين. والرموزُ بلا اعتبارٍ لحالة الأحرف.
    if (doc.currency.trim().toUpperCase() !== sale.currency.trim().toUpperCase()) {
      throw new BadRequestException(formatMessage(MSG.prepayment_currency_mismatch, { no: doc.no, prepayment: doc.currency, invoice: sale.currency }));
    }
    if (doc.appliedAsPrepayment.length > 0) throw new ConflictException(formatMessage(MSG.prepayment_already_applied, { no: doc.no }));
    applied = round2(applied + Number(doc.total));
    if (applied > sale.total + 0.005) {
      throw new BadRequestException(formatMessage(MSG.prepayment_exceeds_invoice, { no: doc.no, applied: money(applied), total: money(sale.total) }));
    }
    ordered.push(doc);
  }
  return ordered;
}

/**
 * **فاتورةُ البيع قبل ترقيمها** (`createWithinTx` — ومنها الكاشيرُ وتحويلُ العرض والبدل):
 *
 *   ① حساباتُ قيدها (`invoicePostingCodes` — `ق-١٤٦٦`)، **و`5100` حين يُخصم من الرفّ** (`deductionPlan`) مع `1300` بنوعه؛
 *   ② **الفترةُ** بتاريخ المستند متى سيُرحَّل قيدٌ — قيدُها أو قيدُ تكلفتها أو قيدُ تطبيق دفعةٍ مقدَّمة؛
 *   ③ **الدفعاتُ المقدَّمة** المسمّاة (`readApplicablePrepayments`) وحساباتُ قيد تطبيقها و`2450` بنوعه.
 *
 * والترتيبُ ترتيبُ التنفيذ: قيودُ الفاتورة وتكلفتها تُرحَّل قبل تطبيق الدفعات المقدَّمة.
 */
export async function assertSaleIssuable(
  tx: Tx,
  companyId: string,
  sale: {
    issueDate: Date;
    branchId: string | null;
    customerId: string;
    lines: readonly { productId?: string | null }[];
    /** عملةُ المستند — ولا يُطبَّق عليه مقدَّمٌ بعملةٍ أخرى (`ق-١٥٠٣`/ب). */
    currency: string;
    /** إجماليُّ المستند بعملته — يُقارَن به مجموعُ الدفعات المقدَّمة كما في التطبيق. */
    total: number;
    base: { baseTotal: number; baseSubtotal: number; baseTaxTotal: number };
    prepaymentInvoiceIds?: readonly string[];
  },
): Promise<{ prepayments: ApplicablePrepayment[] }> {
  const plan = await deductionPlan(tx, { branchId: sale.branchId, lines: sale.lines.map((l) => ({ productId: l.productId ?? null })) });
  const codes = [...invoicePostingCodes(sale.base), ...(plan.deducts ? [COST_OF_SALES_CODE] : [])];
  await assertPostingAccounts(tx, codes);
  if (plan.deducts) await assertInventoryAccountUsable(tx, companyId);

  const prepaymentIds = sale.prepaymentInvoiceIds ?? [];
  if (codes.length > 0 || prepaymentIds.length > 0) await assertPeriodOpen(tx, sale.issueDate);
  if (prepaymentIds.length === 0) return { prepayments: [] };

  const prepayments = await readApplicablePrepayments(tx, {
    customerId: sale.customerId,
    currency: sale.currency,
    total: sale.total,
    prepaymentInvoiceIds: prepaymentIds,
  });
  const applicationCodes = prepayments.flatMap((d) => prepaymentApplicationPostingCodes({ gross: Number(d.baseTotal), vat: Number(d.baseTaxTotal) }));
  await assertPostingAccounts(tx, [...new Set(applicationCodes)]);
  await assertCustomerPrepaymentsAccountUsable(tx, companyId);
  return { prepayments };
}

/**
 * **الإشعارُ الدائن أو المدين قبل ترقيمه** (`createAdjustmentNote`):
 *
 *   ① **الإرجاعُ فوق المبيع تراكمياً** (الدائنُ وحده — `assertReturnsWithinSold`، بالقراءة والحكم اللذين يحكم بهما التنفيذ)؛
 *   ② حساباتُ قيده (`adjustmentNotePostingCodes`)، **و`5100` مع `1300` بنوعه** حين يعود شيءٌ إلى الرفّ فيُعكس قيدُ تكلفته؛
 *   ③ **الفترةُ** بتاريخ الإشعار متى سيُرحَّل قيدُه أو قيدُ عكس تكلفته.
 */
export async function assertAdjustmentNoteIssuable(
  tx: Tx,
  companyId: string,
  note: {
    docType: 'CREDIT_NOTE' | 'DEBIT_NOTE';
    issueDate: Date;
    lines: readonly ReturnRequestLine[];
    base: { baseTotal: number; baseTaxTotal: number };
  },
): Promise<void> {
  let restocking = 0;
  if (note.docType === 'CREDIT_NOTE') {
    try {
      restocking = await assertReturnsWithinSold(tx, note.lines);
    } catch (e) {
      if (e instanceof ReturnExceedsSoldError) throw returnExceedsSoldRefusal(e);
      throw e;
    }
  }
  const codes = [...adjustmentNotePostingCodes(note.base), ...(restocking > 0 ? [COST_OF_SALES_CODE] : [])];
  await assertPostingAccounts(tx, codes);
  if (restocking > 0) await assertInventoryAccountUsable(tx, companyId);
  if (codes.length > 0) await assertPeriodOpen(tx, note.issueDate);
}

/**
 * ④A1 — **مبالغُ مستند الدفعة المقدَّمة (386) من المقبوض** — الدالّةُ الواحدة التي يُصدَر بها المستند
 * (`issuePrepaymentWithinTx`) ويُفحص بها قبل ترقيم السند (`assertPrepaymentIssuable`)، فلا يفترق الفحصُ عن الإصدار.
 *
 * الصافي يُختار بحيث يساوي إجماليُّ المستند المقبوضَ؛ فإن تعذّر (قفزةُ تدوير الضريبة تتخطّى المقبوضَ — كـ`0.80`:
 * `0.69 ⟵ 0.79` و`0.70 ⟵ 0.81`) اختير **أكبرُ صافٍ لا يفوق إجماليُّه المقبوضَ** — فلا يُخصَّص على المستند أكثرُ ممّا
 * قُبض. ومقبوضٌ لا صافيَ له يُرفض بـ`prepayment_amount_positive`.
 */
export function prepaymentDocumentAmounts(
  grossAmount: number,
  taxRate: number,
): { gross: number; net: number; subtotal: number; taxTotal: number; total: number } {
  const gross = round2(grossAmount);
  if (gross <= 0) throw new BadRequestException(MSG.prepayment_amount_positive);
  const base = round2(gross / (1 + taxRate / 100));
  const totalsOf = (net: number) => computeDocumentTotals([{ quantity: 1, unitPrice: net, taxRate }]);
  const candidates = [base, round2(base - 0.01), round2(base + 0.01), round2(base - 0.02)].filter((net) => net > 0 && totalsOf(net).total <= gross);
  if (candidates.length === 0) throw new BadRequestException(MSG.prepayment_amount_positive);
  const net = candidates.reduce((best, n) => (totalsOf(n).total > totalsOf(best).total ? n : best), candidates[0]);
  const { subtotal, taxTotal, total } = totalsOf(net);
  return { gross, net, subtotal, taxTotal, total };
}

/**
 * (`ق-١٤٩٠`) **مستندُ الدفعة المقدَّمة قبل ترقيم سند القبض الذي يُصدره** — فيُرفض قبل رقمَي `RCV` و`PP` معاً: مبلغُه
 * (`prepaymentDocumentAmounts`) · حساباتُ قيده (`prepaymentInvoicePostingCodes`: `1200`، و`2200` حين ضريبة) · و`2450`
 * بنوعه. والفترةُ لا تُفحص هنا: قيدُ السند بالتاريخ نفسه يُرحَّل قبل ترقيم المستند فيرفضه قبل `PP` (وبعد `RCV` —
 * حدُّ السندات الداخلية المعلَن).
 */
export async function assertPrepaymentIssuable(
  tx: Tx,
  companyId: string,
  p: { grossAmount: number; exchangeRate: number; taxRate: number },
): Promise<void> {
  const doc = prepaymentDocumentAmounts(p.grossAmount, p.taxRate);
  await assertPostingAccounts(
    tx,
    prepaymentInvoicePostingCodes({ baseTotal: toBaseAmount(doc.total, p.exchangeRate), baseTaxTotal: toBaseAmount(doc.taxTotal, p.exchangeRate) }),
  );
  await assertCustomerPrepaymentsAccountUsable(tx, companyId);
}
