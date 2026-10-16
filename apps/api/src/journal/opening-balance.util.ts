import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { companyToday } from '../common/company-day.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { assertPeriodOpen } from '../fiscal/period-lock.util';
import { createJournalEntry, DEBIT_NORMAL_TYPES, PostingLine, reverseAndDeleteJournalEntry } from './journal-posting.util';

/**
 * Opening balances as real postings (closes the named 3.8 debt): an account's
 * opening balance is never seeded into `balance` — it is posted as a balanced
 * قيد افتتاحي against the 3900 opening-balances equity account, dated at the
 * start of the fiscal year covering today (or today when no calendar exists),
 * marked `auto` and `openingForAccountId`. Editing the opening balance posts a
 * *delta* entry through the same path — history is never mutated in place —
 * and both paths go through `createJournalEntry`, so numbering, balancing and
 * closed-period refusal (assertPeriodOpen) all apply unchanged.
 *
 * Every query here filters by `companyId` explicitly even though the service
 * path already runs tenant-scoped: these functions are also called from the
 * seed and the backfill script, whose raw Prisma client has no tenant
 * extension — the explicit filter keeps them correct under any client.
 */

export const OPENING_EQUITY_CODE = '3900';
export const OPENING_EQUITY_NAME = 'الأرصدة الافتتاحية';

type AccountForOpening = { id: string; code: string; name: string; type: string };

/** The 3900 counterpart account, created on first use. An existing 3900 with a
 * non-equity type is a chart conflict the user must resolve — refusing beats
 * silently posting equity entries into, say, an expense account. */
export async function getOrCreateOpeningEquityAccount(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<AccountForOpening> {
  const existing = await tx.account.findFirst({ where: { companyId, code: OPENING_EQUITY_CODE } });
  if (existing) {
    if (existing.type !== 'equity') {
      throw new ConflictException(formatMessage(MSG.account_opening_equity_type_conflict, { code: OPENING_EQUITY_CODE }));
    }
    return existing;
  }
  return tx.account.create({
    // Explicit companyId — accepted under the tenant extension (same pattern
    // as createJournalEntry) and required under the seed/script clients.
    data: { companyId, code: OPENING_EQUITY_CODE, name: OPENING_EQUITY_NAME, type: 'equity' } as unknown as Prisma.AccountCreateInput,
  });
}

/** Opening entries carry the fiscal-year-start date so the opening position
 * belongs to the year from its first day — when a calendar covering today
 * exists, which since `ق-١٥٨٤` is the birth year of every new company. Without
 * one (a company born before it, or whose years were all deleted) today is
 * used, and posting it creates the year that contains it. */
export async function openingEntryDate(tx: Prisma.TransactionClient, companyId: string): Promise<Date> {
  // The company's own day, shaped like a '2026-08-08' DTO string so @db.Date comparisons behave identically.
  const today = await companyToday(tx, companyId);
  const year = await tx.fiscalYear.findFirst({ where: { companyId, start: { lte: today }, end: { gte: today } } });
  return year ? new Date(year.start) : today;
}

/** The two balanced lines that move `account` by `delta` on its normal side,
 * with 3900 as the counterpart. A negative delta flips the sides instead of
 * producing negative amounts, which the posting layer rightly rejects. */
export function openingDeltaLines(account: { id: string; type: string }, equityAccountId: string, delta: number): PostingLine[] {
  const amount = round2(Math.abs(delta));
  const accountGetsDebit = DEBIT_NORMAL_TYPES.has(account.type) === delta > 0;
  return [
    { accountId: account.id, debit: accountGetsDebit ? amount : 0, credit: accountGetsDebit ? 0 : amount },
    { accountId: equityAccountId, debit: accountGetsDebit ? 0 : amount, credit: accountGetsDebit ? amount : 0 },
  ];
}

/**
 * **لا يُعلَن افتتاحيٌّ فوق حركةٍ سبقته** (`ق-٢٩١`).
 *
 * القيدُ الافتتاحي يقول «هذا موقفُ الحساب عند هذا التاريخ، وكلُّ ما قبله
 * مطويٌّ فيه». فإن كانت للحساب **حركةٌ مرحَّلةٌ قبل ذلك التاريخ**، صار الرصيدُ
 * **معدوداً مرّتين** — مرّةً في الافتتاحيّ ومرّةً في حركته — **والميزانُ يبقى
 * متوازناً فلا ينبّه أحد**.
 *
 * ⚠️ **والاتجاه مقصود**: يُمنع **خلقُ** التناقض، **ولا يُعاقَب ما وقع قبل
 * القاعدة**. والصيغةُ المعكوسة (رفضُ كلِّ قيدٍ يسبق الافتتاحيّ) قِيست فأسقطت
 * **١٤ مجموعة و٣٠ توكيداً** — لا لعطلٍ فيها بل لأن مِرساتها مصطنعة: تواريخُ
 * الافتتاحيّات القائمة **يومُ تشغيل الترحيل الرجعيّ** لا يومٌ يعنيه تاجر
 * (`ق-٢٩١`، وحكمُ المالك).
 *
 * ⚠️ **وحسابٌ له افتتاحيٌّ سلفاً يمرّ**: تعديلُ الرصيد يُرحَّل **قيدَ فرقٍ**
 * على إعلانٍ قائم، لا إعلاناً جديداً — **فمنعُه معاقبةٌ على ما وقع قبل
 * القاعدة**، وهو ما اُستُثني نصّاً.
 *
 * ⚠️ **وحدٌّ معلَن**: تاريخُ الافتتاح **مشتقٌّ** (بداية السنة المالية أو
 * اليوم) لأن **الحساب لا يحمل تاريخَ افتتاحٍ يُدخله التاجر — والبنكُ يحمله**.
 * **فقاعدتان حيث أردنا واحدة**، وتُوحَّدان حين يُبنى الحقل (`ق-٢٩١`/أ).
 *
 * **على مستوى المنشأة بحقّها**: سكونُ الحساب قبل تاريخ الافتتاح يُفحص على كلّ
 * أسطره في كلّ فرع — فحركةٌ محجوبةٌ عن المُعلِن تُجيز افتتاحاً يكذب على الدفتر.
 */
export async function assertNoMovementBeforeOpening(
  tx: Prisma.TransactionClient,
  companyId: string,
  account: AccountForOpening,
  openingDate: Date,
): Promise<void> {
  const alreadyDeclared = await tx.journalEntry.findFirst({
    where: { companyId, openingForAccountId: account.id },
    select: { id: true },
  });
  if (alreadyDeclared) return;

  const prior = await tx.journalLine.findFirst({
    where: { companyId, accountId: account.id, journalEntry: { date: { lt: openingDate } } },
    orderBy: { journalEntry: { date: 'asc' } },
    select: { journalEntry: { select: { date: true, no: true } } },
  });
  if (!prior) return;

  throw new ConflictException(
    formatMessage(MSG.account_opening_after_movement, {
      code: account.code,
      name: account.name,
      opening: openingDate.toISOString().slice(0, 10),
      moved: prior.journalEntry.date.toISOString().slice(0, 10),
      entry: prior.journalEntry.no,
    }),
  );
}

export interface OpeningDeltaInput {
  companyId: string;
  account: AccountForOpening;
  /** Signed change to the account's opening balance, on its normal side. */
  delta: number;
  memo?: string;
  /**
   * **التاريخُ الذي أعلنه التاجر** (`ق-٢٩٦`) — وغيابُه يعني «لم يُعلَن»،
   * فيُشتقّ بـ`openingEntryDate` كما كان.
   *
   * ⚠️ **وبه يحيا حقلُ البنك الميت**: `bank.openingDate` كان يُخزَّن **ولا يصل
   * الأستاذ إطلاقاً** — والمقيس: **١٢ من ١٢ حساب بنكٍ تاريخُ قيده يخالف تاريخَ
   * فتحه المعلَن** (سبتمبر مقابل يناير). فصار المُعلَنُ **هو** تاريخَ القيد.
   */
  declaredDate?: Date | null;
}

/** Posts the قيد افتتاحي (or a delta entry for an edit). Returns null when the
 * delta rounds to zero — nothing to post. Callers that can race on journal
 * numbering must wrap their transaction in `retryOnUniqueConflict`, exactly
 * like every other posting service. */
export async function postOpeningDeltaEntry(tx: Prisma.TransactionClient, input: OpeningDeltaInput) {
  const delta = round2(input.delta);
  if (delta === 0) return null;

  const date = input.declaredDate ?? (await openingEntryDate(tx, input.companyId));
  await assertNoMovementBeforeOpening(tx, input.companyId, input.account, date);

  const equity = await getOrCreateOpeningEquityAccount(tx, input.companyId);
  if (equity.id === input.account.id) {
    // Backstop — the service guards this by code, but the counterpart of an
    // opening entry can never be the account being opened.
    throw new ConflictException(formatMessage(MSG.account_opening_equity_protected, { code: OPENING_EQUITY_CODE }));
  }

  return createJournalEntry(tx, {
    companyId: input.companyId,
    date,
    memo: input.memo ?? `قيد افتتاحي — ${input.account.name} (${input.account.code})`,
    auto: true,
    openingForAccountId: input.account.id,
    lines: openingDeltaLines(input.account, equity.id, delta),
  });
}

/**
 * **إعادةُ إعلان تاريخ الافتتاح** (`ق-٢٩٦/④`) — **مسارٌ واحد للحساب والبنك**.
 *
 * تغييرُ التاريخ يعني إعادةَ تأريخ القيد الافتتاحيّ. **فيُشترط سكونُ الحساب**:
 * لا سطرَ عليه خارج قيدٍ افتتاحيٍّ له. **والرفضُ يسمّي الحركة ويدلّ على مخرجٍ
 * مبنيّ** — «أدخل الفرق بقيدٍ بتاريخه» (كما في `ق-٢٩١`).
 *
 * ⚠️ **والقيدُ يُعاد ترحيلُه لا يُعدَّل تاريخُه**: رقمُه يحمل سنتَه
 * (`JE-<سنة>-<تسلسل>`)، **فتاريخٌ يُكتب فوقه يفارق رقمَه** عند عبور السنة.
 * والحسابُ ساكنٌ بحكم البوّابة، فالحذفُ والإعادةُ لا يمسّان حركةَ أحد.
 *
 * **على مستوى المنشأة بحقّها**: إعادةُ تأريخ الافتتاح تشترط سكونَ الحساب في
 * المنشأة كلِّها — وسطرٌ في فرعٍ لا يراه المُعلِن يبقى حركةً تمنعه، والقيودُ
 * الافتتاحية تُعاد كلُّها لا بعضُها.
 */
export async function redeclareOpeningDate(
  tx: Prisma.TransactionClient,
  input: { companyId: string; account: AccountForOpening; openingBalance: number; declaredDate: Date },
): Promise<void> {
  const moved = await tx.journalLine.findFirst({
    where: { companyId: input.companyId, accountId: input.account.id, journalEntry: { openingForAccountId: null } },
    orderBy: { journalEntry: { date: 'asc' } },
    select: { journalEntry: { select: { date: true, no: true } } },
  });
  if (moved) {
    throw new ConflictException(
      formatMessage(MSG.account_opening_date_locked, {
        code: input.account.code,
        name: input.account.name,
        moved: moved.journalEntry.date.toISOString().slice(0, 10),
        entry: moved.journalEntry.no,
      }),
    );
  }

  const openings = await tx.journalEntry.findMany({
    where: { companyId: input.companyId, openingForAccountId: input.account.id },
    select: { id: true, date: true },
  });
  // ⚖️ القاعدةُ الدائمة ٣٧ (توجيه ٢٧٥): القيدُ الافتتاحيُّ القديم في فترةٍ مقفلة تاريخٌ لا يُمسّ؛ كان يُحذف بلا فحصٍ
  //    فيتغيّر رصيدُ الفترة المقفلة صامتاً. والفحصُ كلُّه قبل أيّ حذف، كما يفعل حذفُ الحساب (`accounts.service.ts`).
  for (const entry of openings) await assertPeriodOpen(tx, entry.date);
  for (const entry of openings) await reverseAndDeleteJournalEntry(tx, entry.id);

  const amount = round2(input.openingBalance);
  if (amount === 0) return;
  await postOpeningDeltaEntry(tx, {
    companyId: input.companyId,
    account: input.account,
    delta: amount,
    declaredDate: input.declaredDate,
    memo: `الرصيد الافتتاحي — ${input.account.name} (${input.account.code})`,
  });
}

/**
 * Backfill for accounts created before opening balances were posted as
 * entries: their opening amount was seeded straight into `balance`, so the
 * ledger is missing the entry but the balance is already right. Posting the
 * entry applies the amount to `balance` a second time — so the account-side
 * increment is reverted right after, leaving: ledger gains the قيد افتتاحي,
 * the account's balance unchanged, and 3900 carrying the counterpart.
 *
 * Idempotent: an account that already has an opening entry is skipped, so
 * running this any number of times adds nothing twice.
 */
export async function backfillCompanyOpeningEntries(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<{ code: string; name: string; amount: number }[]> {
  const accounts = await tx.account.findMany({
    where: {
      companyId,
      openingBalance: { not: 0 },
      openingEntries: { none: {} },
      code: { not: OPENING_EQUITY_CODE },
    },
    orderBy: { code: 'asc' },
  });

  const posted: { code: string; name: string; amount: number }[] = [];
  for (const account of accounts) {
    const delta = round2(Number(account.openingBalance));
    await postOpeningDeltaEntry(tx, { companyId, account, delta });
    await tx.account.update({ where: { id: account.id }, data: { balance: { decrement: delta } } });
    posted.push({ code: account.code, name: account.name, amount: delta });
  }
  return posted;
}
