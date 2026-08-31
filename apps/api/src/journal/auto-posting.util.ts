import { Prisma } from '@prisma/client';
import { roundTo } from '../common/money/rounding';
import { getOrCreateInputVatAccount, getOrCreateInventoryAccount } from './inventory-accounts.util';
import { createJournalEntry, PostingLine, reverseAndDeleteJournalEntry } from './journal-posting.util';

/** Resolves a set of account codes to ids, scoped by the tenant context
 * already baked into `tx`. Returns `null` (soft-skip signal) if any code
 * isn't set up for this company yet — matches the mockup's
 * `postInvoiceToLedger`/`postPurchaseToLedger`, which silently skip posting
 * rather than blocking the invoice/purchase itself when the chart of
 * accounts isn't ready. */
async function resolveAccountIds(tx: Prisma.TransactionClient, codes: string[]): Promise<Map<string, string> | null> {
  const rows = await tx.account.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  const ids = new Map(rows.map((r) => [r.code, r.id]));
  return codes.every((c) => ids.has(c)) ? ids : null;
}

const PURCHASE_CATEGORY_ACCOUNT: Record<string, string> = {
  'رواتب': '5200',
  'رواتب وأجور': '5200',
  'تكلفة مبيعات': '5100',
  'مواد خام': '5100',
  'بضاعة': '5100',
  'مصروفات أخرى': '5400',
  'مصروفات تأسيس': '5500',
};

/** Default 5300 = "مصروفات إدارية وعمومية" (general & administrative),
 * matching the mockup's `purchaseExpenseAccount` fallback exactly. */
export function purchaseExpenseAccountCode(category?: string | null): string {
  return PURCHASE_CATEGORY_ACCOUNT[(category ?? '').trim()] ?? '5300';
}

/** Currency gains and losses on settlement — the owner picked 5600 for this.
 * A single account carries both directions: a gain lands as a credit against
 * it, which is how a one-line FX difference is conventionally presented. */
export const FX_DIFFERENCE_ACCOUNT = '5600';

/**
 * `branchId` is the source document's branch: the auto-posted entry has to
 * land in the same branch, otherwise a per-branch P&L built from the ledger
 * would never reconcile with the documents it came from.
 *
 * Amounts are **base-currency** figures (the `base*` columns), never the
 * document's own currency: a ledger has one unit, and posting 100 USD next to
 * 100 SAR would make every report meaningless.
 */
export interface InvoiceForPosting {
  branchId?: string | null;
  no: string;
  issueDate: Date;
  customerName: string;
  baseSubtotal: number;
  baseTaxTotal: number;
  baseTotal: number;
}

/** Debit A/R (1200) for the total, credit Revenue (4100) for the subtotal,
 * credit VAT payable (2200) for the tax — matches the mockup's
 * `invoicePostingLines`/`postInvoiceToLedger`. Returns `null` (soft-skip) if
 * the invoice has nothing to post or a required account is missing. */
export async function postInvoiceEntry(tx: Prisma.TransactionClient, companyId: string, inv: InvoiceForPosting) {
  if (inv.baseTotal <= 0) return null;

  const needCodes = ['1200', '4100', ...(inv.baseTaxTotal > 0 ? ['2200'] : [])];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  const lines: PostingLine[] = [{ accountId: ids.get('1200')!, debit: inv.baseTotal, credit: 0 }];
  if (inv.baseSubtotal > 0) lines.push({ accountId: ids.get('4100')!, debit: 0, credit: inv.baseSubtotal });
  if (inv.baseTaxTotal > 0) lines.push({ accountId: ids.get('2200')!, debit: 0, credit: inv.baseTaxTotal });

  return createJournalEntry(tx, {
    companyId,
    date: inv.issueDate,
    memo: `فاتورة مبيعات ${inv.no} — ${inv.customerName}`,
    lines,
    auto: true,
    branchId: inv?.branchId ?? null,
  });
}

/**
 * The mirror image of `postInvoiceEntry` — what a credit note posts: credit
 * A/R (1200) for the total, debit Revenue (4100) for the subtotal, debit VAT
 * payable (2200) for the tax.
 *
 * A **separate reversing entry**, never an edit of the original invoice's
 * posted entry: the sale really happened and its entry stays; the credit note
 * is its own document with its own ledger footprint (same rule as
 * `postClaimWaiverEntry` and journal-posting.util's never-edit principle).
 */
export async function postCreditNoteEntry(tx: Prisma.TransactionClient, companyId: string, note: InvoiceForPosting) {
  if (note.baseTotal <= 0) return null;

  const needCodes = ['1200', '4100', ...(note.baseTaxTotal > 0 ? ['2200'] : [])];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  const lines: PostingLine[] = [];
  if (note.baseSubtotal > 0) lines.push({ accountId: ids.get('4100')!, debit: note.baseSubtotal, credit: 0 });
  if (note.baseTaxTotal > 0) lines.push({ accountId: ids.get('2200')!, debit: note.baseTaxTotal, credit: 0 });
  lines.push({ accountId: ids.get('1200')!, debit: 0, credit: note.baseTotal });

  return createJournalEntry(tx, {
    companyId,
    date: note.issueDate,
    memo: `إشعار دائن ${note.no} — ${note.customerName}`,
    lines,
    auto: true,
    branchId: note.branchId ?? null,
  });
}

/** A debit note bills *more* for an already-invoiced sale (an undercharge
 * correction), so it posts in the same direction as the invoice itself —
 * only the memo distinguishes it in the ledger. */
export async function postDebitNoteEntry(tx: Prisma.TransactionClient, companyId: string, note: InvoiceForPosting) {
  if (note.baseTotal <= 0) return null;

  const needCodes = ['1200', '4100', ...(note.baseTaxTotal > 0 ? ['2200'] : [])];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  const lines: PostingLine[] = [{ accountId: ids.get('1200')!, debit: note.baseTotal, credit: 0 }];
  if (note.baseSubtotal > 0) lines.push({ accountId: ids.get('4100')!, debit: 0, credit: note.baseSubtotal });
  if (note.baseTaxTotal > 0) lines.push({ accountId: ids.get('2200')!, debit: 0, credit: note.baseTaxTotal });

  return createJournalEntry(tx, {
    companyId,
    date: note.issueDate,
    memo: `إشعار مدين ${note.no} — ${note.customerName}`,
    lines,
    auto: true,
    branchId: note.branchId ?? null,
  });
}

/**
 * ⭐ **قيد تكلفة المبيعات — لحظة البيع لا لحظة الشراء.**
 *
 * مدين `5100 تكلفة المبيعات` · دائن `1300 المخزون`، بمجموع ما استُهلك من
 * الطبقات فعلاً — **لا بسعر بيعٍ ولا بمتوسطٍ مفترَض**.
 *
 * وهو الطرف الثاني لما فعلته `م٥`: الشراء صار أصلاً، **وهنا يصير الأصلُ
 * تكلفةً حين يخرج**. فالهامش يُقرأ لأول مرة: إيرادٌ وتكلفتُه في الفترة نفسها.
 *
 * ⚠️ **وقيدٌ منفصل عن قيد الفاتورة** لا سطران فيه: الفاتورة حدثٌ إيرادي
 * والتكلفة حدثٌ مخزنيّ، وقد يقع أحدهما بلا الآخر (بيع خدمة · أو بضاعة بلا
 * مستودع). ودمجُهما يجعل تعذّر أحدهما يُسقط الآخر.
 */
export async function postCogsEntry(
  tx: Prisma.TransactionClient,
  companyId: string,
  c: { branchId?: string | null; no: string; date: Date; baseCost: number },
) {
  if (c.baseCost <= 0) return null;

  const ids = await resolveAccountIds(tx, ['5100']);
  if (!ids) return null;

  return createJournalEntry(tx, {
    companyId,
    date: c.date,
    memo: `تكلفة مبيعات ${c.no}`,
    lines: [
      { accountId: ids.get('5100')!, debit: c.baseCost, credit: 0 },
      { accountId: await getOrCreateInventoryAccount(tx, companyId), debit: 0, credit: c.baseCost },
    ],
    auto: true,
    branchId: c.branchId ?? null,
  });
}

/** Base-currency amounts, for the reason given on `InvoiceForPosting`. */
export interface PurchaseForPosting {
  branchId?: string | null;
  no: string;
  date: Date;
  supplierName: string;
  category: string | null;
  baseSubtotal: number;
  baseTaxAmount: number;
  baseTotal: number;
  /**
   * نصيب البنود **المخزنية** من الإجمالي قبل الضريبة، بالعملة الأساسية.
   *
   * صفرٌ لشراءٍ خدميّ بالكامل — وهو حال كل مستندٍ كُتب قبل `م١`، فيُرحَّل
   * كما كان يُرحَّل تماماً. **فالموجة لا تُعيد تفسير الماضي.**
   */
  baseStockedSubtotal?: number;
}

/** Debit the category's expense account for the subtotal, debit VAT (2200)
 * for the tax (it reduces what's owed to the authority), credit A/P (2100)
 * for the total — matches the mockup's `postPurchaseToLedger`. Returns
 * `null` (soft-skip) if there's nothing to post or a required account is
 * missing. */
export async function postPurchaseEntry(tx: Prisma.TransactionClient, companyId: string, p: PurchaseForPosting) {
  if (p.baseTotal <= 0) return null;

  const stocked = roundTo(p.baseStockedSubtotal ?? 0, 'LINE_AMOUNT');
  const serviceSubtotal = roundTo(p.baseSubtotal - stocked, 'LINE_AMOUNT');

  const expCode = purchaseExpenseAccountCode(p.category);
  const needCodes = ['2100', ...(serviceSubtotal !== 0 ? [expCode] : [])];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  const lines: PostingLine[] = [];

  /**
   * ⭐ **البند المخزني أصلٌ لا مصروف** — ولا يصير تكلفةً إلا لحظة البيع
   * (`م٦`). وقبل هذه الموجة كان يذهب إلى `5100` مباشرةً، فالهامش **مقلوب لا
   * غائب**: تكلفةٌ بلا إيرادها ثم إيرادٌ بلا تكلفته.
   */
  if (stocked > 0) {
    lines.push({ accountId: await getOrCreateInventoryAccount(tx, companyId), debit: stocked, credit: 0 });
  }
  if (serviceSubtotal !== 0) {
    lines.push({ accountId: ids.get(expCode)!, debit: serviceSubtotal, credit: 0 });
  }
  /**
   * ⚠️ **ضريبة المدخلات إلى حسابها هي (`1250`) لا إلى `2200`.**
   *
   * كان حسابٌ واحد يحمل الاتجاهين: الشراء يُمدِّنه والبيع يُدائنه. **فرصيده
   * يصير سالباً كلما زادت المشتريات** — مقيس على مجسّ حيّ: `-7500`. وحسابُ
   * التزامٍ برصيدٍ سالب ليس التزاماً، والإقرار الضريبي يُقرأ منه.
   */
  if (p.baseTaxAmount > 0) {
    lines.push({ accountId: await getOrCreateInputVatAccount(tx, companyId), debit: p.baseTaxAmount, credit: 0 });
  }
  lines.push({ accountId: ids.get('2100')!, debit: 0, credit: p.baseTotal });

  return createJournalEntry(tx, {
    companyId,
    date: p.date,
    memo: `فاتورة شراء ${p.no} — ${p.supplierName}`,
    lines,
    auto: true,
    branchId: p.branchId ?? null,
  });
}

export interface RentPaymentForPosting {
  branchId?: string | null;
  /**
   * ⭐ **البُعد التحليلي — إلزاميّ عمداً لا اختياري.**
   *
   * كل حمولةٍ في هذا الملف تحمل نصوص عرضٍ (`contractNo` · `tenant`) تُبنى منها
   * المذكّرة — **وهي لا تصلح بُعداً**: نصٌّ يتغيّر بتعديل اسم، ولا يُربط بصفّ.
   * فأُضيف المعرّف نفسه.
   *
   * وإلزاميّتُه هي الحارس الأول: مسارُ ترحيلٍ جديد **لا يُترجم** بدونه، فيُمنع
   * النسيان بنية لا يُكتشف بعد وقوعه. (والعقار يُشتقّ منه في
   * `createJournalEntry` — لا يُمرَّر ولا يُكتب.)
   */
  unitId: string;
  contractNo: string;
  tenant: string;
  date: Date;
  /// Cash received, valued at the **settlement** rate.
  baseNetAmount: number;
  /// The same cash valued at the rate the **contract** was priced at. Equal to
  /// `baseNetAmount` whenever the rate hasn't moved, which is always the case
  /// for a single-currency company.
  baseExpectedAmount: number;
}

/**
 * Debit cash (1000), credit rental revenue (4200) — a distinct revenue account
 * from sales invoices' 4100, matching the mockup's rent-collection posting
 * (`confirmRentPayment`).
 *
 * When the currency moved between pricing and settlement, the two sides no
 * longer match: revenue is credited at the contract's rate (what was actually
 * earned) while cash is debited at the settlement rate (what actually arrived),
 * and the gap is a realized currency gain or loss posted to 5600. Recognising
 * it as revenue instead would overstate the business's operating performance
 * with something the market did.
 *
 * Returns `null` (soft-skip) if a required account isn't set up yet.
 */
export async function postRentPaymentEntry(tx: Prisma.TransactionClient, companyId: string, p: RentPaymentForPosting) {
  if (p.baseNetAmount <= 0) return null;

  // Rounded to the ledger's 2 decimals before comparing: a rate carries 6, so
  // an unrounded difference would post lines like 0.0000001 forever.
  const cash = Math.round(p.baseNetAmount * 100) / 100;
  const revenue = Math.round(p.baseExpectedAmount * 100) / 100;
  const fxDifference = Math.round((cash - revenue) * 100) / 100;

  const needCodes = ['1000', '4200', ...(fxDifference !== 0 ? [FX_DIFFERENCE_ACCOUNT] : [])];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  const lines: PostingLine[] = [
    { accountId: ids.get('1000')!, debit: cash, credit: 0 },
    { accountId: ids.get('4200')!, debit: 0, credit: revenue },
  ];

  if (fxDifference > 0) {
    // More cash than the contract priced — a gain, credited against 5600.
    lines.push({ accountId: ids.get(FX_DIFFERENCE_ACCOUNT)!, debit: 0, credit: fxDifference });
  } else if (fxDifference < 0) {
    lines.push({ accountId: ids.get(FX_DIFFERENCE_ACCOUNT)!, debit: -fxDifference, credit: 0 });
  }

  return createJournalEntry(tx, {
    companyId,
    date: p.date,
    memo: `دفعة إيجار — عقد ${p.contractNo} — ${p.tenant}`,
    unitId: p.unitId,
    lines,
    auto: true,
    branchId: p?.branchId ?? null,
  });
}

export interface CustomerPaymentForPosting {
  paymentNo: string;
  customerName: string;
  date: Date;
  /** النقد الداخل بالعملة الأساسية = مبلغ الدفعة × سعر يومها. سالبٌ في العكس. */
  baseCash: number;
  /** الذمّة المسوّاة بالعملة الأساسية = كل تخصيص × سعر **فاتورته**، لا سعر
   * الدفعة. الفارق بينهما ربح/خسارة صرف محقَّقة، لا إيراد ولا خصم. */
  baseReceivable: number;
  branchId?: string | null;
  reversal?: boolean;
}

/**
 * مقبوض من عميل (4.5): مدين الصندوق/البنك 1000 · دائن ذمم العملاء 1200.
 *
 * **لا إيراد هنا إطلاقاً** — الإيراد اعتُرف به يوم الفاتورة
 * (postInvoiceEntry). التحصيل تسويةُ ذمّة لا بيعٌ جديد، وخلطهما يضاعف
 * إيراد السنة.
 *
 * فرق العملة: الفاتورة قيّدت ذمّتها بسعر يومها، والنقد يدخل بسعر يوم
 * الدفعة — فما بينهما فرقٌ **محقَّق** يُرحَّل على 5600 تماماً كما في سداد
 * الإيجار، بدل أن يتضخّم أو ينكمش به النقد أو الذمّة.
 *
 * الدفعة العكسية تمرّ بنفس الدالة بمبالغ سالبة فتنقلب الأطراف — قيدٌ مضاد
 * يُبقي الأصل كما هو (المرحَّل لا يُعدَّل ولا يُحذف).
 *
 * تُعيد null (تخطٍّ ناعم) إن لم تُهيَّأ الحسابات بعد — كسائر الترحيلات.
 */
export async function postCustomerPaymentEntry(tx: Prisma.TransactionClient, companyId: string, p: CustomerPaymentForPosting) {
  const cash = Math.round(p.baseCash * 100) / 100;
  const receivable = Math.round(p.baseReceivable * 100) / 100;
  if (cash === 0 && receivable === 0) return null;

  const fxDifference = Math.round((cash - receivable) * 100) / 100;
  const needCodes = ['1000', '1200', ...(fxDifference !== 0 ? [FX_DIFFERENCE_ACCOUNT] : [])];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  // الموجب يعني نقداً داخلاً وذمّةً تنقص؛ السالب (العكس) يقلبهما معاً.
  const lines: PostingLine[] = [
    { accountId: ids.get('1000')!, debit: cash > 0 ? cash : 0, credit: cash < 0 ? -cash : 0 },
    { accountId: ids.get('1200')!, debit: receivable < 0 ? -receivable : 0, credit: receivable > 0 ? receivable : 0 },
  ];

  if (fxDifference > 0) {
    // نقدٌ أكثر مما قُيّدت به الذمّة — ربح صرف محقَّق.
    lines.push({ accountId: ids.get(FX_DIFFERENCE_ACCOUNT)!, debit: 0, credit: fxDifference });
  } else if (fxDifference < 0) {
    lines.push({ accountId: ids.get(FX_DIFFERENCE_ACCOUNT)!, debit: -fxDifference, credit: 0 });
  }

  return createJournalEntry(tx, {
    companyId,
    date: p.date,
    memo: `${p.reversal ? 'عكس مقبوض' : 'مقبوض من عميل'} — سند ${p.paymentNo} — ${p.customerName}`,
    lines,
    auto: true,
    branchId: p.branchId ?? null,
  });
}

/** Where tenant deposits are held. A liability: the money is the tenant's
 * until the lease ends, so it must never appear as revenue on receipt. */
export const TENANT_DEPOSITS_ACCOUNT = '2300';
/** Where a forfeited deposit lands — deliberately not 4200, so keeping a
 * deposit doesn't masquerade as rental income. */
export const OTHER_INCOME_ACCOUNT = '4300';

export interface DepositForPosting {
  /** ⭐ البُعد التحليلي — إلزاميّ، انظر RentPaymentForPosting.unitId. */
  unitId: string;
  contractNo: string;
  tenant: string;
  date: Date;
  /** In the reporting currency, like every other posting. */
  baseAmount: number;
  typeLabel: string;
}

/**
 * Debit cash (1000), credit tenant deposits (2300).
 *
 * The deposit is *not* income. Recording it as such would overstate the year's
 * profit and then require a reversal when it's refunded — which is exactly the
 * error the old `Contract.deposit` column invited by holding a number nothing
 * ever posted.
 *
 * Only called for company-held deposits. One blocked on Ejar is recorded but
 * never posted: no cash arrived, and the company owes nothing back because it
 * is not the custodian.
 *
 * Returns `null` (soft-skip) if a required account isn't set up yet.
 */
export async function postDepositReceiptEntry(tx: Prisma.TransactionClient, companyId: string, d: DepositForPosting) {
  if (d.baseAmount <= 0) return null;

  const ids = await resolveAccountIds(tx, ['1000', TENANT_DEPOSITS_ACCOUNT]);
  if (!ids) return null;

  return createJournalEntry(tx, {
    companyId,
    date: d.date,
    memo: `${d.typeLabel} — عقد ${d.contractNo} — ${d.tenant}`,
    unitId: d.unitId,
    lines: [
      { accountId: ids.get('1000')!, debit: d.baseAmount, credit: 0 },
      { accountId: ids.get(TENANT_DEPOSITS_ACCOUNT)!, debit: 0, credit: d.baseAmount },
    ],
    auto: true,
  });
}

export interface DepositSettlementForPosting {
  /** ⭐ البُعد التحليلي — إلزاميّ، انظر RentPaymentForPosting.unitId. */
  unitId: string;
  contractNo: string;
  tenant: string;
  date: Date;
  /** True when the company itself held the money and raised the liability. */
  heldByCompany: boolean;
  /** The full held amount, which is what leaves the liability account. */
  baseAmount: number;
  /** Deductions already grouped by where they should land. */
  againstReceivable: number;
  againstIncome: number;
  refund: number;
  typeLabel: string;
}

/**
 * Settles a deposit — and the entry depends entirely on **who was holding it**.
 *
 * **Company-held.** Debit 2300 for the whole amount: the obligation ends here
 * regardless of where the money goes. Then credit each destination:
 *
 * - **unpaid rent** → 1200, because that rent was already recognized as revenue
 *   when the invoice was raised; crediting income again would count it twice;
 * - **damage, utilities, cleaning, other** → 4300, income the landlord keeps;
 * - **the remainder** → 1000, cash actually handed back.
 *
 * **Ejar-held.** There is no liability to clear — the money was never the
 * company's. Only the awarded deductions move: the platform releases them to
 * the company, so cash is debited and the same two destinations credited. The
 * refund is settled between Ejar and the tenant and touches nothing here, so a
 * full refund posts **no entry at all**.
 *
 * Returns `null` (soft-skip) if a required account isn't set up yet, or if
 * there is genuinely nothing to post.
 */
export async function postDepositSettlementEntry(tx: Prisma.TransactionClient, companyId: string, s: DepositSettlementForPosting) {
  if (s.baseAmount <= 0) return null;

  const awarded = Math.round((s.againstReceivable + s.againstIncome) * 100) / 100;
  // Ejar refunding the tenant in full is a real, valid outcome that simply
  // never touches this company's books.
  if (!s.heldByCompany && awarded <= 0) return null;

  const needCodes = [
    ...(s.heldByCompany ? [TENANT_DEPOSITS_ACCOUNT] : ['1000']),
    ...(s.againstReceivable > 0 ? ['1200'] : []),
    ...(s.againstIncome > 0 ? [OTHER_INCOME_ACCOUNT] : []),
    ...(s.heldByCompany && s.refund > 0 ? ['1000'] : []),
  ];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  const lines: PostingLine[] = s.heldByCompany
    ? [{ accountId: ids.get(TENANT_DEPOSITS_ACCOUNT)!, debit: s.baseAmount, credit: 0 }]
    : [{ accountId: ids.get('1000')!, debit: awarded, credit: 0 }];

  if (s.againstReceivable > 0) lines.push({ accountId: ids.get('1200')!, debit: 0, credit: s.againstReceivable });
  if (s.againstIncome > 0) lines.push({ accountId: ids.get(OTHER_INCOME_ACCOUNT)!, debit: 0, credit: s.againstIncome });
  if (s.heldByCompany && s.refund > 0) lines.push({ accountId: ids.get('1000')!, debit: 0, credit: s.refund });

  return createJournalEntry(tx, {
    companyId,
    date: s.date,
    memo: `تسوية ${s.typeLabel} — عقد ${s.contractNo} — ${s.tenant}${s.heldByCompany ? '' : ' (محجوز لدى إيجار)'}`,
    unitId: s.unitId,
    lines,
    auto: true,
  });
}

export interface ContractSettlementForPosting {
  /** ⭐ البُعد التحليلي — إلزاميّ، انظر RentPaymentForPosting.unitId. */
  unitId: string;
  contractNo: string;
  tenant: string;
  date: Date;
  baseAmount: number;
}

/**
 * Early-termination settlement: debit the tenant (1200), credit other income
 * (4300).
 *
 * **Not** 4200. Rental revenue is earned by letting the property for a period;
 * this is compensation for a period the tenant is *not* occupying it. Booking
 * it as rent would overstate occupancy-driven revenue and make the yield
 * figures on the reports lie.
 *
 * A receivable rather than cash, because agreeing the settlement and collecting
 * it are separate events — and once it is a receivable, a held deposit can be
 * applied against it through the normal deduction flow.
 *
 * Returns `null` (soft-skip) if a required account isn't set up yet.
 */
export async function postContractSettlementEntry(tx: Prisma.TransactionClient, companyId: string, s: ContractSettlementForPosting) {
  if (s.baseAmount <= 0) return null;

  const ids = await resolveAccountIds(tx, ['1200', OTHER_INCOME_ACCOUNT]);
  if (!ids) return null;

  return createJournalEntry(tx, {
    companyId,
    date: s.date,
    memo: `تسوية إلغاء عقد ${s.contractNo} — ${s.tenant}`,
    unitId: s.unitId,
    lines: [
      { accountId: ids.get('1200')!, debit: s.baseAmount, credit: 0 },
      { accountId: ids.get(OTHER_INCOME_ACCOUNT)!, debit: 0, credit: s.baseAmount },
    ],
    auto: true,
  });
}

export interface ClaimForPosting {
  /** ⭐ البُعد التحليلي — إلزاميّ، انظر RentPaymentForPosting.unitId. */
  unitId: string;
  contractNo: string;
  tenant: string;
  date: Date;
  baseAmount: number;
  kindLabel: string;
}

/**
 * Raising a claim: debit the tenant (1200), credit other income (4300).
 *
 * Same shape as a cancellation settlement, and for the same reason — a repair
 * the tenant caused or a late fee is income, but not *rental* income. Keeping
 * both out of 4200 is what lets a rent-roll report mean what it says.
 */
export async function postClaimIssueEntry(tx: Prisma.TransactionClient, companyId: string, c: ClaimForPosting) {
  if (c.baseAmount <= 0) return null;

  const ids = await resolveAccountIds(tx, ['1200', OTHER_INCOME_ACCOUNT]);
  if (!ids) return null;

  return createJournalEntry(tx, {
    companyId,
    date: c.date,
    memo: `مطالبة (${c.kindLabel}) — عقد ${c.contractNo} — ${c.tenant}`,
    unitId: c.unitId,
    lines: [
      { accountId: ids.get('1200')!, debit: c.baseAmount, credit: 0 },
      { accountId: ids.get(OTHER_INCOME_ACCOUNT)!, debit: 0, credit: c.baseAmount },
    ],
    auto: true,
  });
}

/** Collecting a claim: cash in (1000 or the bank's account), receivable out. */
export async function postClaimPaymentEntry(tx: Prisma.TransactionClient, companyId: string, c: ClaimForPosting) {
  if (c.baseAmount <= 0) return null;

  const ids = await resolveAccountIds(tx, ['1000', '1200']);
  if (!ids) return null;

  return createJournalEntry(tx, {
    companyId,
    date: c.date,
    memo: `تحصيل مطالبة (${c.kindLabel}) — عقد ${c.contractNo} — ${c.tenant}`,
    unitId: c.unitId,
    lines: [
      { accountId: ids.get('1000')!, debit: c.baseAmount, credit: 0 },
      { accountId: ids.get('1200')!, debit: 0, credit: c.baseAmount },
    ],
    auto: true,
  });
}

/**
 * Writing a claim off: reverse the income and clear the receivable.
 *
 * A reversing entry rather than deleting the original. The claim really was
 * raised — the tenant may well have been told about it — so the ledger has to
 * show both that it happened and that it was dropped.
 */
export async function postClaimWaiverEntry(tx: Prisma.TransactionClient, companyId: string, c: ClaimForPosting) {
  if (c.baseAmount <= 0) return null;

  const ids = await resolveAccountIds(tx, ['1200', OTHER_INCOME_ACCOUNT]);
  if (!ids) return null;

  return createJournalEntry(tx, {
    companyId,
    date: c.date,
    memo: `إسقاط مطالبة (${c.kindLabel}) — عقد ${c.contractNo} — ${c.tenant}`,
    unitId: c.unitId,
    lines: [
      { accountId: ids.get(OTHER_INCOME_ACCOUNT)!, debit: c.baseAmount, credit: 0 },
      { accountId: ids.get('1200')!, debit: 0, credit: c.baseAmount },
    ],
    auto: true,
  });
}

/** Key money the company paid for the right to occupy a leased site. An asset:
 * the benefit runs for the whole tenancy, not just the month it was paid. */
export const KEY_MONEY_ASSET_ACCOUNT = '1600';

export interface KeyMoneyForPosting {
  /** ⭐ البُعد التحليلي — إلزاميّ، انظر RentPaymentForPosting.unitId. */
  unitId: string;
  contractNo: string;
  tenant: string;
  date: Date;
  baseAmount: number;
  received: boolean;
}

/**
 * Key money, posted according to which way it went.
 *
 * **Received** — cash in, other income. Not rent: it buys the *right to the
 * location*, and it is not refundable, which is what separates it from a
 * deposit.
 *
 * **Paid** — cash out, capitalized to 1600. Expensing it immediately would
 * dump a lump sum into one month's P&L for a benefit that runs for years.
 *
 * ⚠️ **Amortization is not implemented.** Paid key money sits in 1600 until
 * someone writes it down with a manual journal entry. Spreading it over the
 * lease term is the correct treatment and is a separate piece of work — doing
 * it silently and wrongly would be worse than leaving it visible.
 */
export async function postKeyMoneyEntry(tx: Prisma.TransactionClient, companyId: string, k: KeyMoneyForPosting) {
  if (k.baseAmount <= 0) return null;

  const ids = await resolveAccountIds(tx, ['1000', k.received ? OTHER_INCOME_ACCOUNT : KEY_MONEY_ASSET_ACCOUNT]);
  if (!ids) return null;

  const lines: PostingLine[] = k.received
    ? [
        { accountId: ids.get('1000')!, debit: k.baseAmount, credit: 0 },
        { accountId: ids.get(OTHER_INCOME_ACCOUNT)!, debit: 0, credit: k.baseAmount },
      ]
    : [
        { accountId: ids.get(KEY_MONEY_ASSET_ACCOUNT)!, debit: k.baseAmount, credit: 0 },
        { accountId: ids.get('1000')!, debit: 0, credit: k.baseAmount },
      ];

  return createJournalEntry(tx, {
    companyId,
    date: k.date,
    memo: `${k.received ? 'تقبيل مقبوض' : 'تقبيل مدفوع'} — عقد ${k.contractNo} — ${k.tenant}`,
    unitId: k.unitId,
    lines,
    auto: true,
  });
}

/** What keeping the buildings running costs — deliberately not 5300, so a
 * landlord can separate property upkeep from office overheads. */
export const MAINTENANCE_EXPENSE_ACCOUNT = '5700';

export interface MaintenanceCostForPosting {
  /**
   * ⭐ البُعد التحليلي — **وهذا المسار وحده يقبل عقاراً بلا وحدة**.
   * `MaintenanceRequest.propertyId` إلزاميّ و`unitId` اختياريّ في المخطَّط:
   * بلاغٌ على مرفقٍ مشترك (مصعد · موقف) عقارُه معلوم ووحدتُه لا وجود لها.
   * فإجبارُ وحدةٍ هنا كان سيلفّق انتماءً — والفراغ أصدق.
   */
  propertyId: string;
  unitId?: string | null;
  title: string;
  propertyName: string;
  date: Date;
  baseAmount: number;
}

/**
 * Debit maintenance expense (5700), credit cash (1000).
 *
 * Posted when the work is *completed*, not when it is reported: a request that
 * is still open has no known cost, and one that gets cancelled never has one.
 *
 * Recovering the cost from the tenant is a separate decision — that is what a
 * claim is for, and it posts on its own.
 */
export async function postMaintenanceCostEntry(tx: Prisma.TransactionClient, companyId: string, m: MaintenanceCostForPosting) {
  if (m.baseAmount <= 0) return null;

  const ids = await resolveAccountIds(tx, [MAINTENANCE_EXPENSE_ACCOUNT, '1000']);
  if (!ids) return null;

  return createJournalEntry(tx, {
    companyId,
    date: m.date,
    memo: `صيانة — ${m.propertyName} — ${m.title}`,
    // المسار الوحيد الذي يمرّر عقاراً: بلاغُ مرفقٍ مشترك لا وحدة له.
    // وحين توجد وحدة يُهمَل هذا ويُشتقّ العقار منها — انظر resolveDimensions.
    propertyId: m.propertyId,
    unitId: m.unitId ?? null,
    lines: [
      { accountId: ids.get(MAINTENANCE_EXPENSE_ACCOUNT)!, debit: m.baseAmount, credit: 0 },
      { accountId: ids.get('1000')!, debit: 0, credit: m.baseAmount },
    ],
    auto: true,
  });
}

/** Reverses and deletes a document's linked auto-posted entry, if any —
 * shared by both invoice and purchase delete/repost paths. No-op when
 * `journalEntryId` is null (the document was never posted, e.g. missing
 * accounts at creation time). */
export async function unpostIfLinked(tx: Prisma.TransactionClient, journalEntryId: string | null): Promise<void> {
  if (!journalEntryId) return;
  await reverseAndDeleteJournalEntry(tx, journalEntryId);
}
