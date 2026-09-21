import { Prisma } from '@prisma/client';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { DEBIT_NORMAL_TYPES } from '../journal/journal-posting.util';

/**
 * **محرّكُ الأستاذ العام وكشف الحساب** (`ق-١٢٦١` · الحزمة ج — `domain-scan/10` A2).
 *
 * تقريرٌ واحد يقرأ `journal_lines` بمرشِّح — **حسابٌ** (دفترُ الأستاذ) **أو بُعدٌ** (كشفُ حسابِ عميلٍ أو
 * مورّد؛ وعقارٌ أو وحدةٌ) — على مدىً وفرع، **برصيدٍ افتتاحيٍّ قبل المدى ورصيدٍ جارٍ على كلِّ سطر وربطٍ بالمستند
 * المصدر**. الرصيدُ على الطرف الطبيعيّ للحساب (`DEBIT_NORMAL_TYPES`)؛ وكشفُ العميل مدينُ الطبع (ذمّةٌ له
 * علينا) وكشفُ المورّد دائنُه.
 *
 * **المصدرُ يُشتقّ من علاقات القيد لا من عمودٍ يُكتب**: كلُّ مستندٍ يرحّل يشير إلى قيده (`journalEntryId`
 * وأخواتُه)، فيُقرأ الاتجاهُ المعاكس مرّةً واحدة عند القراءة — لا هجرةَ ولا تعبئةَ ولا كاتباً يُنسى (`①B8`
 * يُستغنى عنه). والقيدُ اليدويّ مصدرُه `MANUAL`، والافتتاحيّ `OPENING`، وقيدُ العكس `REVERSAL` بمرجع أصله.
 *
 * ⚠️ **حدٌّ معلَن:** السقفُ `5000` سطرٍ في القراءة الواحدة — ما فوقه يُعلَن `truncated` ويُضيَّق المدى؛
 * والرصيدُ الجاري صحيحٌ لما عاد لأن الافتتاحيَّ يُحسب بالتجميع قبل المدى لا من السطور المقصوصة.
 */
export const LEDGER_LINE_CAP = 5000;

export interface LedgerFilter {
  accountId?: string;
  customerId?: string;
  supplierId?: string;
  propertyId?: string;
  unitId?: string;
  branchId?: string;
  from?: Date;
  to?: Date;
}

export interface LedgerSource {
  /** نوعُ المستند المصدر — من علاقة القيد التي وُجد عليها. */
  type: string;
  id: string;
  /** رقمُ المستند إن كان له رقم؛ وإلا معرّفُه. */
  no: string;
}

export interface LedgerRow {
  lineId: string;
  entryId: string;
  entryNo: string;
  date: string;
  memo: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  /** الرصيدُ الجاري بعد هذا السطر، على الطرف الطبيعيّ — نصٌّ بخانتين (`ق-١٢٣٥`). */
  balance: string;
  source: LedgerSource;
  branchId: string | null;
  customerId: string | null;
  supplierId: string | null;
  propertyId: string | null;
  unitId: string | null;
}

/** ما يُطلب مع كل قيدٍ لاشتقاق مصدره — العلاقاتُ المعاكسة كلُّها، بمعرّفٍ ورقمٍ حيث يوجد. */
const SOURCE_INCLUDE = {
  invoices: { select: { id: true, no: true, docType: true } },
  reversedInvoices: { select: { id: true, no: true } },
  purchases: { select: { id: true, no: true } },
  payments: { select: { id: true, no: true } },
  supplierPayments: { select: { id: true, no: true } },
  goodsReceipts: { select: { id: true, no: true } },
  inventoryWriteOffs: { select: { id: true, no: true } },
  stockOpening: { select: { id: true, no: true } },
  stockOpeningLineVoid: { select: { id: true } },
  landedCosts: { select: { id: true } },
  landedCostVoids: { select: { id: true } },
  rentPayments: { select: { id: true } },
  rentAccruals: { select: { id: true } },
  depositReceipts: { select: { id: true } },
  depositSettlements: { select: { id: true } },
  contractSettlements: { select: { id: true, no: true } },
  claimIssues: { select: { id: true } },
  claimSettlements: { select: { id: true } },
  keyMoneyEntries: { select: { id: true } },
  maintenanceCosts: { select: { id: true } },
  reversalOf: { select: { id: true, no: true } },
} satisfies Prisma.JournalEntryInclude;

type EntryWithSources = Prisma.JournalEntryGetPayload<{ include: typeof SOURCE_INCLUDE }>;

/** الترتيبُ يقرّر أيَّ مصدرٍ يُسمّى حين يشير أكثرُ من مستندٍ إلى القيد نفسِه — الأخصُّ أولاً. */
const SOURCE_ORDER: { key: keyof typeof SOURCE_INCLUDE; type: string }[] = [
  { key: 'invoices', type: 'INVOICE' },
  { key: 'reversedInvoices', type: 'INVOICE_REVERSAL' },
  { key: 'purchases', type: 'PURCHASE' },
  { key: 'payments', type: 'PAYMENT' },
  { key: 'supplierPayments', type: 'SUPPLIER_PAYMENT' },
  { key: 'goodsReceipts', type: 'GOODS_RECEIPT' },
  { key: 'inventoryWriteOffs', type: 'WRITE_OFF' },
  { key: 'stockOpening', type: 'STOCK_OPENING' },
  { key: 'stockOpeningLineVoid', type: 'STOCK_OPENING_VOID' },
  { key: 'landedCosts', type: 'LANDED_COST' },
  { key: 'landedCostVoids', type: 'LANDED_COST_VOID' },
  { key: 'rentPayments', type: 'RENT_PAYMENT' },
  { key: 'rentAccruals', type: 'RENT_ACCRUAL' },
  { key: 'depositReceipts', type: 'DEPOSIT_RECEIPT' },
  { key: 'depositSettlements', type: 'DEPOSIT_SETTLEMENT' },
  { key: 'contractSettlements', type: 'CONTRACT_SETTLEMENT' },
  { key: 'claimIssues', type: 'CLAIM_ISSUE' },
  { key: 'claimSettlements', type: 'CLAIM_SETTLEMENT' },
  { key: 'keyMoneyEntries', type: 'KEY_MONEY' },
  { key: 'maintenanceCosts', type: 'MAINTENANCE' },
];

export function resolveSource(entry: EntryWithSources): LedgerSource {
  if (entry.openingForAccountId) return { type: 'OPENING', id: entry.openingForAccountId, no: entry.no };
  if (entry.reversalOf) return { type: 'REVERSAL', id: entry.reversalOf.id, no: entry.reversalOf.no };
  for (const { key, type } of SOURCE_ORDER) {
    const v = entry[key] as unknown;
    const first = Array.isArray(v) ? v[0] : v;
    if (!first) continue;
    const doc = first as { id: string; no?: string | null; docType?: string | null };
    const docType = key === 'invoices' && doc.docType && doc.docType !== 'INVOICE' ? doc.docType : type;
    return { type: docType, id: doc.id, no: doc.no ?? doc.id };
  }
  return { type: entry.auto ? 'AUTO' : 'MANUAL', id: entry.id, no: entry.no };
}

function lineWhere(filter: LedgerFilter, dated: boolean): Prisma.JournalLineWhereInput {
  const date: Prisma.DateTimeFilter = {};
  if (dated && filter.from) date.gte = filter.from;
  if (dated && filter.to) date.lte = filter.to;
  return {
    ...(filter.accountId ? { accountId: filter.accountId } : {}),
    ...(filter.customerId ? { customerId: filter.customerId } : {}),
    ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
    ...(filter.propertyId ? { propertyId: filter.propertyId } : {}),
    ...(filter.unitId ? { unitId: filter.unitId } : {}),
    journalEntry: {
      ...(Object.keys(date).length ? { date } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
    },
  };
}

/** الجانبُ الطبيعيّ للرصيد: للحساب من نوعه؛ ولكشف الطرف: العميلُ مدين والمورّدُ دائن. */
export type BalanceSide = 'debit' | 'credit';

export interface LedgerResult {
  side: BalanceSide;
  opening: string;
  rows: LedgerRow[];
  totalDebit: string;
  totalCredit: string;
  closing: string;
  count: number;
  truncated: boolean;
}

/**
 * يقرأ الدفترَ لمرشِّحٍ واحد. الافتتاحيُّ **بالتجميع** قبل `from` (لا من سطورٍ تُقرأ)؛ والسطورُ في المدى
 * مرتّبةً بالتاريخ ثم رقم القيد ثم السطر؛ والرصيدُ الجاري يُحسب على العدد لا على النصّ ويُخرَج نصّاً.
 */
export async function readLedger(tx: Prisma.TransactionClient, filter: LedgerFilter, side: BalanceSide): Promise<LedgerResult> {
  const signed = (debit: number, credit: number) => (side === 'debit' ? debit - credit : credit - debit);

  let opening = 0;
  if (filter.from) {
    const before = await tx.journalLine.aggregate({
      where: { ...lineWhere({ ...filter, to: undefined, from: undefined }, false), journalEntry: { date: { lt: filter.from }, ...(filter.branchId ? { branchId: filter.branchId } : {}) } },
      _sum: { debit: true, credit: true },
    });
    opening = round2(signed(Number(before._sum.debit ?? 0), Number(before._sum.credit ?? 0)));
  }

  const where = lineWhere(filter, true);
  const count = await tx.journalLine.count({ where });
  const lines = await tx.journalLine.findMany({
    where,
    include: { account: { select: { code: true, name: true, type: true } }, journalEntry: { include: SOURCE_INCLUDE } },
    orderBy: [{ journalEntry: { date: 'asc' } }, { journalEntry: { no: 'asc' } }, { id: 'asc' }],
    take: LEDGER_LINE_CAP,
  });

  let running = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: LedgerRow[] = lines.map((l) => {
    const debit = Number(l.debit);
    const credit = Number(l.credit);
    totalDebit += debit;
    totalCredit += credit;
    running = round2(running + signed(debit, credit));
    return {
      lineId: l.id,
      entryId: l.journalEntryId,
      entryNo: l.journalEntry.no,
      date: l.journalEntry.date.toISOString().slice(0, 10),
      memo: l.journalEntry.memo,
      accountId: l.accountId,
      accountCode: l.account.code,
      accountName: l.account.name,
      debit: money(debit),
      credit: money(credit),
      balance: money(running),
      source: resolveSource(l.journalEntry),
      branchId: l.journalEntry.branchId,
      customerId: l.customerId,
      supplierId: l.supplierId,
      propertyId: l.propertyId,
      unitId: l.unitId,
    };
  });

  return {
    side,
    opening: money(opening),
    rows,
    totalDebit: money(round2(totalDebit)),
    totalCredit: money(round2(totalCredit)),
    closing: money(running),
    count,
    truncated: count > lines.length,
  };
}

/** جانبُ الرصيد الطبيعيّ لحسابٍ من نوعه. */
export function sideOfAccountType(type: string): BalanceSide {
  return DEBIT_NORMAL_TYPES.has(type) ? 'debit' : 'credit';
}
