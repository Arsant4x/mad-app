import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { resolveCurrencyWithin, toBaseAmount } from '../common/currency/base-amount.util';
import { documentYear } from '../common/document-year.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { sumMoney } from '../common/money/allocation';
import { round2, toHalalas } from '../common/money/rounding';
import { assertPeriodOpen } from '../fiscal/period-lock.util';
import { lockReconciledBanks } from '../banks/reconciliation-lock.util';

/** Account types whose balance increases with a debit (asset, expense);
 * the rest (liability, equity, revenue) increase with a credit. Matches
 * `DEBIT_NORMAL_TYPES` from the original mockup's ledger logic exactly. */
export const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense']);

export interface PostingLine {
  accountId: string;
  debit: number;
  credit: number;
}

/**
 * **الإقفالُ البنكيّ** (`ق-١٢٦١` ج — التسويةُ البنكية): بنكٌ سُوّي كشفُه حتى تاريخٍ لا يُكتب على حسابه قيدٌ بذلك
 * التاريخ أو قبله — كإقفال الفترة لكنّه لحسابٍ واحد؛ والتصحيحُ بقيدٍ بعد تاريخ الإقفال. هنا لا في كلِّ مستدعٍ
 * لأن هذا هو المسارَ الواحدَ لكلِّ ترحيل (كـ`assertPeriodOpen`).
 * **على مستوى المنشأة بحقّها**: حارسٌ على حسابات القيد كلِّها — بنكٌ في أيِّ فرعٍ يحرس حسابَه، والقيدُ نفسُه هو الذي
 * حُدّد فرعُه قبل الوصول هنا؛ فمرشِّحُ فروع القارئ يُعمي الحارسَ عن بنكِ فرعٍ آخر يخصّ القيدَ نفسَه.
 */
async function assertBankNotReconciled(tx: Prisma.TransactionClient, companyId: string, accountIds: string[], date: Date): Promise<void> {
  // The shared lock makes a reconciliation close wait for this posting; no bank among the accounts means nothing to check.
  if ((await lockReconciledBanks(tx, companyId, { accountIds })).length === 0) return;
  const locked = await tx.bank.findFirst({
    where: { accountId: { in: accountIds }, reconciledUntil: { gte: date } },
    select: { name: true, reconciledUntil: true },
  });
  if (locked) {
    throw new ConflictException(
      formatMessage(MSG.bank_reconciled_locked, { bank: locked.name, until: locked.reconciledUntil!.toISOString().slice(0, 10) }),
    );
  }
}

/** Resolves each account id to its type in one query, scoped by the tenant
 * context already baked into `tx`. Throws if any id doesn't resolve — which
 * covers both a genuinely missing account and (just as importantly) another
 * company's account id smuggled into a line: under RLS/the tenant-scope
 * extension that row simply isn't visible here, so it must surface as a
 * clean 404 up front, before any write is attempted, rather than letting a
 * cross-tenant-linked row get created and then fail confusingly later. */
async function fetchAccountTypes(tx: Prisma.TransactionClient, accountIds: string[]): Promise<Map<string, string>> {
  const rows = await tx.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, type: true } });
  const types = new Map(rows.map((r) => [r.id, r.type]));
  if (accountIds.some((id) => !types.has(id))) {
    throw new NotFoundException(MSG.journal_line_account_not_found);
  }
  return types;
}

/** Moves each line's debit/credit into its account's running `balance`,
 * signed by the account's normal side. `sign` is `1` to post, `-1` to
 * reverse (used when a journal entry is deleted). Must run inside the same
 * transaction as the entry create/delete it belongs to, using a tenant-scoped
 * `tx` from `TenantPrismaService.runInTenantContext` — never a raw client. */
export async function applyLinesToBalances(
  tx: Prisma.TransactionClient,
  lines: PostingLine[],
  sign: 1 | -1,
  accountTypes?: Map<string, string>,
): Promise<void> {
  const types = accountTypes ?? (await fetchAccountTypes(tx, [...new Set(lines.map((l) => l.accountId))]));
  for (const line of lines) {
    const delta = DEBIT_NORMAL_TYPES.has(types.get(line.accountId)!) ? line.debit - line.credit : line.credit - line.debit;
    await tx.account.update({
      where: { id: line.accountId },
      data: { balance: { increment: sign * delta } },
    });
  }
}

/** `JE-<year>-<seq>`, same max-based scheme as invoice/purchase numbering —
 * see InvoicesService.nextInvoiceNumber for why count() would be wrong here. */
async function nextJournalNumber(tx: Prisma.TransactionClient, companyId: string, entryDate: Date): Promise<string> {
  // عدّادٌ ذرّيّ لا مسحُ سنة (ق-٣٢٨) — والبذرُ من أعلى قائمٍ مرّةً واحدة.
  return nextDocumentNumber(tx, companyId, entryDate, { kind: 'JE', pad: 4 }, (prefix) => highestSequenceOf(tx.journalEntry, prefix));
}

export interface CreateJournalEntryInput {
  companyId: string;
  date: Date;
  memo: string;
  lines: PostingLine[];
  auto?: boolean;
  /** Defaults to the base currency at parity — see base-amount.util. */
  currency?: string;
  exchangeRate?: number;
  branchId?: string | null;
  /** Marks this entry as an account's قيد افتتاحي (or opening-balance delta
   * entry) — see opening-balance.util.ts. */
  openingForAccountId?: string;
  /** ⚖️ القيدُ العكسيّ يحمل معرّفَ أصله (`ق-١٢٥٣`/①) — يمرّره `JournalService.reverse` وحدَه. */
  reversalOfId?: string;

  /**
   * ⚖️ **قيدُ إقفال سنةٍ مالية** (`ق-١٢٨٣` · د/③) — يمرّره `year-closing.util` وحدَه.
   *
   * **وهو الاستثناءُ الوحيد من قفل الفترات، ومقلوبُ سببِه لا خرقُه**: الإقفالُ لا
   * يقع إلا **بعد** أن تُغلق فتراتُ السنة كلُّها (يفحصه المحرّك قبل النداء)، وتاريخُه
   * نهايةُ السنة — أي **داخل فترةٍ مقفلةٍ بالضرورة**. فلو خضع للقفل لاستحال الإقفالُ
   * أصلاً، ولو فُتحت فترةٌ لأجله لصار الدفترُ مفتوحاً لغيره في الوقت نفسِه.
   *
   * والعكسُ يحمله كذلك (بتاريخ الأصل) فيمرّ من الباب نفسِه — ويُميَّز بأنه يحمل
   * `reversalOfId`.
   */
  closingForFiscalYearId?: string;

  /**
   * ── البُعد التحليلي: الوحدة المصدر ──────────────────────────────────
   *
   * **معرّفٌ واحد يمرّره المستدعي، والباقي يُشتقّ هنا.** فمن يملك عقداً يملك
   * `unitId`؛ ولا يُطلب منه عقارٌ ولا فرع، ولا يُسمح له بتمريرهما.
   *
   * ولذلك `propertyId` أدناه **ليس بديلاً يختاره المستدعي**: هو للمسار الذي
   * لا وحدة له أصلاً — بلاغ صيانةٍ على مرفقٍ مشترك، فـ`MaintenanceRequest`
   * عقارُه إلزاميّ ووحدتُه اختيارية. وحين تُعطى وحدةٌ، **يُشتقّ العقار منها
   * ويُهمَل ما مُرِّر** — فلا يمكن لسطرٍ أن يحمل وحدةً من عقارٍ وعقاراً من
   * آخر مهما أخطأ المستدعي.
   */
  unitId?: string | null;
  /** عقارٌ بلا وحدة — للمسار الذي لا وحدة له. يُهمَل متى أُعطيت `unitId`. */
  propertyId?: string | null;

  /**
   * ── بُعدُ الطرف (`ق-٨٧٣`) ──────────────────────────────────────────────
   *
   * **معرّفُ الطرف من مصدر القيد** — عميلُ الفاتورة/سند القبض، مورّدُ الشراء/سند الصرف،
   * عميلُ العقد فيما يتبعه — **ويُتحقَّق منه هنا لا يُكتب بيد**: يُقرأ الصفُّ في سياق
   * المستأجر، فطرفٌ لا يُقرأ (معرّفٌ من منشأةٍ أخرى أو محذوف) يعود فراغاً ولا يُسقط القيد.
   * والفراغُ يقول «لا طرف» — لا افتراضيّ. (وحارسُ التغطية يقيس أن كل سطرٍ يشير إليه مستندٌ
   * له طرف يحمل طرفَه.)
   */
  customerId?: string | null;
  supplierId?: string | null;
}

export interface EntryDimensions {
  branchId: string | null;
  propertyId: string | null;
  unitId: string | null;
  customerId: string | null;
  supplierId: string | null;
}

/**
 * يشتقّ أبعاد السطر من الوحدة المصدر — **الموضع الوحيد الذي تُحسب فيه**.
 *
 * والقاعدة السادسة تعني هذا حرفياً: لا يكتب أحدٌ `propertyId` بيده، بل يُقرأ
 * من `Unit.propertyId` في استعلامٍ واحد. فوحدةٌ نُقلت إلى عقارٍ آخر تُصحّح
 * نفسها في القيد التالي، ولا تبقى نسخةٌ قديمة يتذكّرها أحد.
 *
 * ⚠️ ووحدةٌ لا تُقرأ (معرّفٌ من مستأجرٍ آخر، أو محذوفة) **لا تُسقط الترحيل ولا
 * تُلفَّق**: يعود البُعد فارغاً. فالفراغ يقول «لا انتماء» — والقيد المحاسبي
 * أهمّ من بُعدٍ تحليلي، فلا يُمنع قيدٌ صحيح لأجل تصنيف.
 */
async function resolveDimensions(tx: Prisma.TransactionClient, input: CreateJournalEntryInput): Promise<EntryDimensions> {
  const branchId = input.branchId ?? null;
  const party = await resolveParty(tx, input);

  if (input.unitId) {
    const unit = await tx.unit.findUnique({ where: { id: input.unitId }, select: { id: true, propertyId: true } });
    if (unit) return { branchId, propertyId: unit.propertyId, unitId: unit.id, ...party };
    return { branchId, propertyId: null, unitId: null, ...party };
  }

  if (input.propertyId) {
    const property = await tx.property.findUnique({ where: { id: input.propertyId }, select: { id: true } });
    return { branchId, propertyId: property?.id ?? null, unitId: null, ...party };
  }

  return { branchId, propertyId: null, unitId: null, ...party };
}

/**
 * الطرفُ يُقرأ في سياق المستأجر ويُختم مقروءاً لا مُمرَّراً (`ق-٨٧٣`): عميلٌ أو مورّدٌ لا يُقرأ
 * يعود فراغاً بلا إسقاطٍ للقيد — القيدُ المحاسبي أهمّ من بُعدٍ تحليلي.
 */
async function resolveParty(tx: Prisma.TransactionClient, input: CreateJournalEntryInput): Promise<{ customerId: string | null; supplierId: string | null }> {
  const customer = input.customerId ? await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }) : null;
  const supplier = input.supplierId ? await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } }) : null;
  return { customerId: customer?.id ?? null, supplierId: supplier?.id ?? null };
}

/**
 * A manual entry needs at least two lines, each with exactly one side above zero; balanced totals alone
 * accept a single line debiting and crediting one account. Automatic postings build their own lines and
 * are not held to this, since a computed line can round to zero.
 */
export function assertManualEntryLines(lines: readonly PostingLine[]): void {
  if (lines.length < 2) throw new BadRequestException(MSG.journal_manual_entry_min_lines);
  if (lines.some((l) => (l.debit > 0) === (l.credit > 0))) throw new BadRequestException(MSG.journal_manual_line_one_side);
}

/** Creates a balanced journal entry and immediately posts it to account
 * balances — journal entries are always posted on creation in this system
 * (there's no separate draft/unposted state), matching the mockup where
 * `postJournalEntry`/`postInvoiceToLedger`/`postPurchaseToLedger` all create
 * and apply in the same step. Once created, an entry is never edited — only
 * deleted (via `reverseAndDeleteJournalEntry`) and re-created, which avoids
 * balance-drift bugs from partial edits. */
export async function createJournalEntry(
  tx: Prisma.TransactionClient,
  input: CreateJournalEntryInput,
) {
  // 🔴 **التوازنُ بما يُخزَّن لا بما يُحسب** (توجيه ٢٧٤ · مراجعة 3.3 البند 2): السطرُ يُخزَّن بخانتين، وكان الفحصُ يقارن
  // المجموعين الخامَين بسماحٍ `0.001` — فقيدٌ متوازنٌ قبل التدوير يُخزَّن غيرَ متوازن (`33.334+33.333+33.333` مقابل `100`
  // يُخزَّن `99.99` مقابل `100.00`)، وفرقٌ دون السماح يصير فرقَ هللة (`0.005` مقابل `0.0045`). فكلُّ سطرٍ بالهللة بعد
  // التدوير بسياسة المنصّة، والمجموعان يتساويان تماماً. وهنا لأن كلَّ ترحيلٍ يمرّ من هنا، يدويّاً كان أم آليّاً.
  // والسطرُ يُدوَّر مرّةً هنا ثم يُفحص ويُخزَّن ويحرّك الرصيدَ بقيمته المدوَّرة نفسِها: فلا يُترك التدويرُ للقاعدة أو المشغِّل
  // فيخالف تدويرُهما على نصف هللةٍ ما فُحص.
  const lines = input.lines.map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) }));
  const debitHalalas = lines.reduce((sum, l) => sum + toHalalas(l.debit), 0);
  const creditHalalas = lines.reduce((sum, l) => sum + toHalalas(l.credit), 0);
  if (debitHalalas <= 0 || debitHalalas !== creditHalalas) {
    throw new BadRequestException(MSG.journal_entry_unbalanced);
  }
  // ومجموعا القيد مجموعُ أسطره كما تُخزَّن، فلا يخالف رأسُ القيد أسطرَه بهللة.
  const totalDebit = sumMoney(lines.map((l) => l.debit));
  const totalCredit = sumMoney(lines.map((l) => l.credit));

  // Refuse anything dated inside a closed period. Placed here rather than in
  // each caller because this function is the one path every posting takes —
  // manual, invoice, purchase and rent alike (see assertPeriodOpen).
  //
  // ⚖️ **وقيدُ الإقفال وحدَه يمرّ** (`ق-١٢٨٣`): شرطُه أن تكون فتراتُ السنة **كلُّها
  // مقفلة**، وتاريخُه نهايتُها — فالفحصُ هنا كان سيمنع الإقفالَ لأنه أُقفل. والشرطُ
  // يُفحص في `closeFiscalYearWithinTx` قبل النداء، فلا يصل هنا قيدٌ بلا سببه.
  if (!input.closingForFiscalYearId) await assertPeriodOpen(tx, input.date);

  // Validate every referenced account belongs to this tenant *before*
  // writing anything — see fetchAccountTypes for why this must come first.
  const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
  const accountTypes = await fetchAccountTypes(tx, accountIds);
  await assertBankNotReconciled(tx, input.companyId, accountIds, input.date);

  // بلا عملةٍ صريحة ⟵ عملةُ أساس المنشأة لا الريال (`ق-١٣٦٨`) — ومن يُعلن عملتَه لا يدفع قراءةً زائدة.
  const { currency, exchangeRate } = await resolveCurrencyWithin(tx, input.companyId, input);
  // البُعد يُحسب مرّة واحدة ويُختم على كل سطر — فلا يفترق سطرٌ عن قيده، ولا
  // يُملأ في ستة عشر موضعاً فيُنسى في السابع عشر.
  const dims = await resolveDimensions(tx, input);
  const no = await nextJournalNumber(tx, input.companyId, input.date);
  const entry = await tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      no,
      date: input.date,
      memo: input.memo,
      totalDebit,
      totalCredit,
      auto: input.auto ?? false,
      branchId: input.branchId ?? null,
      openingForAccountId: input.openingForAccountId ?? null,
      reversalOfId: input.reversalOfId ?? null,
      closingForFiscalYearId: input.closingForFiscalYearId ?? null,
      currency,
      exchangeRate,
      baseTotalDebit: toBaseAmount(totalDebit, exchangeRate),
      baseTotalCredit: toBaseAmount(totalCredit, exchangeRate),
      lines: {
        create: lines.map((l) => ({
          companyId: input.companyId,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          branchId: dims.branchId,
          propertyId: dims.propertyId,
          unitId: dims.unitId,
          customerId: dims.customerId,
          supplierId: dims.supplierId,
        })),
      },
    } as unknown as Prisma.JournalEntryUncheckedCreateInput,
    include: { lines: { include: { account: true } } },
  });

  await applyLinesToBalances(tx, lines, 1, accountTypes);
  return entry;
}

/** Reverses a journal entry's effect on account balances, then deletes it
 * (its lines cascade-delete with it). No-op if the entry doesn't exist. */
export async function reverseAndDeleteJournalEntry(
  tx: Prisma.TransactionClient,
  journalEntryId: string,
): Promise<void> {
  const entry = await tx.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: true },
  });
  if (!entry) return;

  await applyLinesToBalances(
    tx,
    entry.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })),
    -1,
  );
  await tx.journalEntry.delete({ where: { id: journalEntryId } });
}
