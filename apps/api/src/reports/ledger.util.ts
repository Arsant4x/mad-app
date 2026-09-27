import { Prisma } from '@mad-app/db';
import { requestedBranchFilter } from '../branches/branch-scope.util';
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
 * **المصدرُ يُشتقّ من المستندات التي تشير إلى القيد لا من عمودٍ يُكتب**: كلُّ مستندٍ يرحّل يحمل `journalEntryId`
 * (أو أخواتِه)، فيُقرأ الاتجاهُ المعاكس **باستعلامٍ واحدٍ موحَّد** على جداول المستندات لمعرّفات القيود المقروءة —
 * لا هجرةَ ولا تعبئةَ ولا كاتباً يُنسى (`①B8` يُستغنى عنه). والقيدُ اليدويّ مصدرُه `MANUAL`، والافتتاحيّ `OPENING`،
 * وقيدُ العكس `REVERSAL` بمرجع أصله.
 *
 * ⚠️ **لماذا استعلامٌ خامّ لا `include`**: استنباطُ حمولة `include` لعشرين علاقةً على القيد أسقط `ts-jest` بنفاد
 * الذاكرة (مقيس 2026-09-21 — محطّتان `EXIT=134`)؛ والاتحادُ الخامّ يُعيد صفوفاً بشكلٍ معلَن صراحةً.
 *
 * ⚠️ **حدٌّ معلَن:** السقفُ `5000` سطرٍ في القراءة الواحدة — ما فوقه يُعلَن `truncated` ويُضيَّق المدى؛
 * والرصيدُ الجاري صحيحٌ لما عاد لأن الافتتاحيَّ يُحسب بالتجميع قبل المدى لا من السطور المقصوصة.
 */
export const LEDGER_LINE_CAP = 5000;

export interface LedgerFilter {
  /** فروعُ القارئ — القراءةُ تُرشَّح بها دائماً (`ق-٥١٧`)، وبالفرع المطلوب إن طُلب وكان من فروعه. */
  allowedBranchIds: string[] | 'all';
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
  /** نوعُ المستند المصدر — من الجدول الذي وُجد فيه (أو `MANUAL`/`AUTO`/`OPENING`/`REVERSAL`). */
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

/**
 * أذرعُ الاتحاد: جدولُ المستند، عمودُه الذي يشير إلى القيد، نوعُه، وعمودُ رقمه إن كان — **بترتيب الأخصّية**: حين
 * يشير أكثرُ من مستندٍ إلى القيد نفسِه (نادرٌ) يُسمّى الأسبقُ هنا. `docType` للفاتورة يميّز الإشعارَين.
 */
const SOURCE_ARMS: { table: string; col: string; type: string; no: string | null; docType?: boolean }[] = [
  { table: 'invoices', col: 'journalEntryId', type: 'INVOICE', no: 'no', docType: true },
  { table: 'invoices', col: 'reversalJournalEntryId', type: 'INVOICE_REVERSAL', no: 'no' },
  { table: 'purchases', col: 'journalEntryId', type: 'PURCHASE', no: 'no' },
  { table: 'payments', col: 'journalEntryId', type: 'PAYMENT', no: 'no' },
  { table: 'supplier_payments', col: 'journalEntryId', type: 'SUPPLIER_PAYMENT', no: 'no' },
  { table: 'goods_receipts', col: 'journalEntryId', type: 'GOODS_RECEIPT', no: 'no' },
  { table: 'inventory_write_offs', col: 'journalEntryId', type: 'WRITE_OFF', no: 'no' },
  { table: 'stock_openings', col: 'journalEntryId', type: 'STOCK_OPENING', no: 'no' },
  { table: 'stock_opening_lines', col: 'voidJournalEntryId', type: 'STOCK_OPENING_VOID', no: null },
  { table: 'landed_cost_distributions', col: 'journalEntryId', type: 'LANDED_COST', no: null },
  { table: 'landed_cost_distributions', col: 'voidJournalEntryId', type: 'LANDED_COST_VOID', no: null },
  { table: 'rent_payments', col: 'journalEntryId', type: 'RENT_PAYMENT', no: null },
  { table: 'rent_accruals', col: 'journalEntryId', type: 'RENT_ACCRUAL', no: null },
  { table: 'contract_deposits', col: 'journalEntryId', type: 'DEPOSIT_RECEIPT', no: null },
  { table: 'contract_deposits', col: 'settlementEntryId', type: 'DEPOSIT_SETTLEMENT', no: null },
  { table: 'contracts', col: 'settlementEntryId', type: 'CONTRACT_SETTLEMENT', no: 'no' },
  { table: 'contract_claims', col: 'journalEntryId', type: 'CLAIM_ISSUE', no: null },
  { table: 'contract_claims', col: 'settlementEntryId', type: 'CLAIM_SETTLEMENT', no: null },
  { table: 'contract_key_money', col: 'journalEntryId', type: 'KEY_MONEY', no: null },
  { table: 'maintenance_requests', col: 'journalEntryId', type: 'MAINTENANCE', no: null },
];

const SOURCE_UNION_SQL = SOURCE_ARMS.map(
  (a, i) =>
    `SELECT "${a.col}" AS entry_id, '${a.type}' AS type, id, ${a.no ? `"${a.no}"::text` : 'NULL::text'} AS no, ${a.docType ? '"docType"::text' : 'NULL::text'} AS doc_type, ${i} AS prio FROM "${a.table}" WHERE "${a.col}" = ANY($1::text[])`,
).join(' UNION ALL ');

type SourceHit = { entry_id: string; type: string; id: string; no: string | null; doc_type: string | null; prio: number };

/** يقرأ مصادرَ مجموعةِ قيودٍ دفعةً واحدة — الأخصُّ (الأسبقُ ذراعاً) لكلِّ قيد. */
export async function sourcesOf(tx: Prisma.TransactionClient, entryIds: string[]): Promise<Map<string, LedgerSource>> {
  const out = new Map<string, LedgerSource>();
  if (entryIds.length === 0) return out;
  const hits = await tx.$queryRawUnsafe<SourceHit[]>(SOURCE_UNION_SQL, entryIds);
  hits.sort((a, b) => a.prio - b.prio);
  for (const h of hits) {
    if (out.has(h.entry_id)) continue;
    const type = h.type === 'INVOICE' && h.doc_type && h.doc_type !== 'INVOICE' ? h.doc_type : h.type;
    out.set(h.entry_id, { type, id: h.id, no: h.no ?? h.id });
  }
  return out;
}

type EntryHead = { id: string; no: string; auto: boolean; openingForAccountId: string | null; reversalOf: { id: string; no: string } | null };

/** مصدرُ قيدٍ واحد: افتتاحيٌّ ثم عكسٌ ثم مستندٌ ثم يدويٌّ/آليّ. */
export function resolveSource(entry: EntryHead, fromDocs: LedgerSource | undefined): LedgerSource {
  if (entry.openingForAccountId) return { type: 'OPENING', id: entry.openingForAccountId, no: entry.no };
  if (entry.reversalOf) return { type: 'REVERSAL', id: entry.reversalOf.id, no: entry.reversalOf.no };
  if (fromDocs) return fromDocs;
  return { type: entry.auto ? 'AUTO' : 'MANUAL', id: entry.id, no: entry.no };
}

function lineWhere(filter: LedgerFilter, scope: Prisma.JournalEntryWhereInput, date: Prisma.DateTimeFilter | undefined): Prisma.JournalLineWhereInput {
  return {
    ...(filter.accountId ? { accountId: filter.accountId } : {}),
    ...(filter.customerId ? { customerId: filter.customerId } : {}),
    ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
    ...(filter.propertyId ? { propertyId: filter.propertyId } : {}),
    ...(filter.unitId ? { unitId: filter.unitId } : {}),
    journalEntry: { ...(date ? { date } : {}), ...scope },
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
  // فروعُ القارئ مصدرُ المرشِّح الواحد (`branches/branch-scope.util`) — لا يُقرأ فرعٌ ليس له.
  const scope = requestedBranchFilter(filter.allowedBranchIds, filter.branchId);

  let opening = 0;
  if (filter.from) {
    const before = await tx.journalLine.aggregate({
      where: lineWhere(filter, scope, { lt: filter.from }),
      _sum: { debit: true, credit: true },
    });
    opening = round2(signed(Number(before._sum.debit ?? 0), Number(before._sum.credit ?? 0)));
  }

  const range: Prisma.DateTimeFilter = {};
  if (filter.from) range.gte = filter.from;
  if (filter.to) range.lte = filter.to;
  const where = lineWhere(filter, scope, Object.keys(range).length ? range : undefined);
  const count = await tx.journalLine.count({ where });
  const lines = await tx.journalLine.findMany({
    where,
    select: {
      id: true,
      journalEntryId: true,
      accountId: true,
      debit: true,
      credit: true,
      customerId: true,
      supplierId: true,
      propertyId: true,
      unitId: true,
      account: { select: { code: true, name: true } },
      journalEntry: {
        select: { id: true, no: true, date: true, memo: true, branchId: true, auto: true, openingForAccountId: true, reversalOf: { select: { id: true, no: true } } },
      },
    },
    orderBy: [{ journalEntry: { date: 'asc' } }, { journalEntry: { no: 'asc' } }, { id: 'asc' }],
    take: LEDGER_LINE_CAP,
  });

  const docs = await sourcesOf(tx, [...new Set(lines.map((l) => l.journalEntryId))]);

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
      source: resolveSource(l.journalEntry, docs.get(l.journalEntryId)),
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
