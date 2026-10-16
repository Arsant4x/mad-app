import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { createJournalEntry, DEBIT_NORMAL_TYPES, type PostingLine } from '../journal/journal-posting.util';
import { getOrCreateAccount } from '../journal/inventory-accounts.util';

/**
 * **قيدُ إقفال السنة المالية** (`ق-١٢٨٣` · د/③).
 *
 * ## ما كان
 *
 * لا إقفالَ إطلاقاً: حساباتُ الإيراد والمصروف تتراكم من التأسيس بلا نهاية،
 * **والمركزُ المالي يحمل سطرَ «نتيجة الفترة (قبل الإقفال)» أبداً** — وهو سطرٌ
 * مؤقّتٌ بالتصميم يقول «هذه السنةُ لم تُقفل بعد».
 *
 * ## والأحكامُ الثلاثة (قرار المالك في التوجيه ٢٥٢)
 *
 * **(أ) حسابٌ نظاميٌّ واحد للأرباح المبقاة** — `3300`، **مقيسٌ حرّاً** قبل اختياره:
 * مُسحت `789` منشأةً على قاعدة التطوير **داخل سياق كلٍّ**، فكان `3900` وحدَه كلَّ
 * ما يبدأ بـ`3` في المنصّة. ووسمُه نظاميٌّ: لا يُحذف ولا يُعدَّل رمزُه.
 *
 * **(ب) قيدٌ واحد** يُصفّر الإيرادَ والمصروف مقابل الأرباح المبقاة، ووصفُه يحمل
 * **صافيَ نتيجة السنة**. فالحسابُ الملخّص (`ملخّصُ الدخل`) **أداةُ دفترٍ يدويّ**
 * لا يحتاجها نظام، وقيدٌ واحد أقلُّ قيوداً وأوضحُ في المراجعة.
 *
 * **(ج) بيد صاحب الصلاحية عند إقفال السنة لا آلياً** — فتسوياتُ المراجع تقع
 * غالباً **بعد** إغلاق آخر فترة، والإقفالُ الآليُّ يسبقها. ويُشترط أن تكون
 * **فتراتُ السنة كلُّها مغلقة**.
 *
 * ## ⚠️ والرصيدُ يُقرأ حتى تاريخ النهاية لا من `account.balance`
 *
 * `account.balance` رصيدٌ **حتى اللحظة** لا حتى تاريخٍ — فسنةٌ تُقفل بعد أن جرت
 * عليها حركةُ سنةٍ تالية تُقفل بأرقامٍ ليست أرقامَها. فالمجاميعُ من **السطور**
 * بتاريخ قيدها (`date <= end`)، كما يقرؤها المركزُ المالي بالضبط.
 *
 * **والتراكميُّ لا السنويُّ عمداً**: سنةٌ سبقتها سنةٌ مقفلة يكون تراكميُّها =
 * حركتَها وحدَها (قيدُ الإقفال السابق صفّر ما قبله)، وسنةٌ سبقتها سنةٌ **لم
 * تُقفل** تحمل ما تراكم — **وهو الصواب**: بعد الإقفال يصير الإيرادُ والمصروفُ
 * صفراً في المركز المالي بتاريخه، فيزول السطرُ المؤقّت كما يجب.
 */

export const RETAINED_EARNINGS_CODE = '3300';
export const RETAINED_EARNINGS_NAME = 'الأرباح المبقاة';

/**
 * حساباتٌ نظامية — **لا تُحذف ولا يُعدَّل رمزُها** (`ق-١٢٨٣`/أ).
 *
 * ⚠️ **والقاعدةُ تُبنى على الموضعَين معاً لا على الجديد وحده** (`§8.14`): حسابُ
 * الأرصدة الافتتاحية `3900` يحمل الدورَ نفسَه — طرفٌ مقابلٌ يُنشئه النظامُ ويقرؤه
 * — **وكان محميّاً من رصيدٍ افتتاحيٍّ ذاتيٍّ وحدَه**، فلو حُرس الجديدُ وحدَه
 * لصار الاختلافُ الذي أُريد منعُه.
 */
export const SYSTEM_ACCOUNT_CODES: ReadonlyMap<string, string> = new Map([
  [RETAINED_EARNINGS_CODE, RETAINED_EARNINGS_NAME],
  ['3900', 'رصيد افتتاحي'],
]);

export const getOrCreateRetainedEarningsAccount = (tx: Prisma.TransactionClient, companyId: string) =>
  getOrCreateAccount(tx, companyId, RETAINED_EARNINGS_CODE, RETAINED_EARNINGS_NAME, 'equity');

export interface FiscalYearRow {
  id: string;
  name: string;
  start: Date;
  end: Date;
}

/**
 * رصيدُ كلِّ حساب نتيجةٍ حتى تاريخٍ — بالإشارة الطبيعية لنوعه.
 *
 * **على مستوى المنشأة بحقّها**: الأستاذُ دفترٌ واحد وقائمةُ الدخل تُقفل للمنشأة لا
 * لفرعٍ منها — فإقفالُ نتيجةِ فرعٍ وحدَه يترك الإيرادَ مفتوحاً في غيره بلا أن يُرى،
 * ويصير رصيدُ الأرباح المبقاة جزءَ النتيجة لا كلَّها.
 */
async function resultBalancesAsOf(tx: Prisma.TransactionClient, end: Date) {
  const accounts = await tx.account.findMany({
    where: { type: { in: ['revenue', 'expense'] } },
    select: { id: true, code: true, type: true },
  });
  if (accounts.length === 0) return [];
  const grouped = await tx.journalLine.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accounts.map((a) => a.id) }, journalEntry: { date: { lte: end } } },
    _sum: { debit: true, credit: true },
  });
  const sums = new Map(grouped.map((g) => [g.accountId, { debit: Number(g._sum.debit ?? 0), credit: Number(g._sum.credit ?? 0) }]));
  return accounts
    .map((a) => {
      const s = sums.get(a.id) ?? { debit: 0, credit: 0 };
      const amount = round2(DEBIT_NORMAL_TYPES.has(a.type) ? s.debit - s.credit : s.credit - s.debit);
      return { id: a.id, code: a.code, type: a.type, amount };
    })
    .filter((a) => Math.abs(a.amount) >= 0.005);
}

/**
 * قيدُ الإقفال الفعّال للسنة — أي قيدِ إقفالٍ لم يُعكس بعد.
 *
 * **على مستوى المنشأة بحقّها**: السنةُ المالية تقويمُ المنشأة كلِّها لا تقويمَ فرع،
 * وقيدُ إقفالها واحدٌ لها — فقراءتُه بفروعِ القارئ تجعل السنةَ «مقفلةً لفرعٍ مفتوحةً
 * لآخر»، وهي حالٌ لا معنى لها في دفترٍ واحد.
 */
export async function activeClosingEntry(tx: Prisma.TransactionClient, fiscalYearId: string) {
  const entries = await tx.journalEntry.findMany({
    where: { closingForFiscalYearId: fiscalYearId, reversalOfId: null },
    select: { id: true, no: true, date: true, memo: true },
    orderBy: { createdAt: 'asc' },
  });
  if (entries.length === 0) return null;
  const reversedIds = new Set(
    (await tx.journalEntry.findMany({ where: { reversalOfId: { in: entries.map((e) => e.id) } }, select: { reversalOfId: true } }))
      .map((r) => r.reversalOfId as string),
  );
  return entries.find((e) => !reversedIds.has(e.id)) ?? null;
}

/**
 * يُقفل السنةَ بقيدٍ واحد — **ويُرفض ما لا يُقفَل**:
 * فترةٌ مفتوحة · إقفالٌ قائم · سنةٌ بلا حركةِ نتيجةٍ أصلاً.
 */
export async function closeFiscalYearWithinTx(
  tx: Prisma.TransactionClient,
  params: { companyId: string; year: FiscalYearRow },
) {
  const { companyId, year } = params;

  // The periods are read FOR SHARE until the closing entry commits: a reopen (FOR UPDATE) in progress is waited for
  // and its status seen, and a reopen after this waits and then reverses the entry. Taken before the year row, since a
  // reopen holding its period writes a reversal whose key check needs the year row, and the opposite order deadlocks.
  const periods = await tx.$queryRaw<{ month: number; year: number; status: string }[]>`
    SELECT "month", "year", "status"::text AS "status" FROM "fiscal_periods"
    WHERE "companyId" = ${companyId} AND "fiscalYearId" = ${year.id}
    ORDER BY "year", "month"
    FOR SHARE`;
  const open = periods.find((p) => p.status !== 'CLOSED');
  if (open) {
    throw new ConflictException(
      formatMessage(MSG.fiscal_year_close_needs_closed_periods, { period: `${String(open.month).padStart(2, '0')}/${open.year}` }),
    );
  }

  // The year row: two closes at the same moment do not write two closing entries for one year.
  await tx.$queryRawUnsafe('SELECT id FROM fiscal_years WHERE id = $1 FOR UPDATE', year.id);

  if (await activeClosingEntry(tx, year.id)) throw new ConflictException(MSG.fiscal_year_already_closed);

  const balances = await resultBalancesAsOf(tx, year.end);
  if (balances.length === 0) throw new ConflictException(MSG.fiscal_year_nothing_to_close);

  const revenue = balances.filter((b) => b.type === 'revenue').reduce((s, b) => s + b.amount, 0);
  const expense = balances.filter((b) => b.type === 'expense').reduce((s, b) => s + b.amount, 0);
  const netResult = round2(revenue - expense);

  // كلُّ حسابٍ يُصفَّر بالجانب المقابل لرصيده — والسالبُ يقلب الجانب فلا يُكتب سطرٌ سالب.
  const lines: PostingLine[] = balances.map((b) => {
    const zeroOnDebit = b.type === 'revenue' ? b.amount > 0 : b.amount < 0;
    const value = Math.abs(b.amount);
    return { accountId: b.id, debit: zeroOnDebit ? value : 0, credit: zeroOnDebit ? 0 : value };
  });

  const retainedId = await getOrCreateRetainedEarningsAccount(tx, companyId);
  // ربحٌ ⟵ دائنٌ للمبقاة · خسارةٌ ⟵ مدينٌ لها.
  lines.push({ accountId: retainedId, debit: netResult < 0 ? Math.abs(netResult) : 0, credit: netResult > 0 ? netResult : 0 });

  /**
   * ⚠️ **المذكّرةُ نصٌّ يُخزَّن — فلا تُبنى بـ`formatMessage`** (وقعت وقُيست هنا):
   * مخرَجُ `formatMessage` يحمل **فاصلَ المعاملات (البايت الصفريّ)** ليحلّه مرشّحُ
   * اللغة عند الردّ، **و`Postgres` يرفض البايتَ الصفريّ في عمود نصّ** (`22021`).
   * فرسائلُ الاستثناء تمرّ به، **وما يُكتب في الدفتر لا**.
   */
  const memo = `إقفال السنة المالية ${year.name} — صافي ${netResult < 0 ? 'خسارة' : 'ربح'} ${money(Math.abs(netResult))}`;

  const entry = await createJournalEntry(tx, {
    companyId,
    date: year.end,
    memo,
    lines,
    auto: true,
    closingForFiscalYearId: year.id,
  });

  // القيدُ نفسُه في الردّ — فمن أقفل يرى ما رُحِّل بسطوره، ولا يحتاج مساراً ثانياً يقرؤه.
  return { entry, netResult, accounts: balances.length };
}

/**
 * يعكس قيدَ إقفالٍ فعّالاً **بقيدٍ مرقَّم بتاريخه** — لا بمحوٍ.
 *
 * يُستدعى آلياً عند **إعادة فتح فترةٍ** في سنةٍ مقفلة: «فلا يبقى قيدُ إقفالٍ على
 * أرقامٍ تغيّرت» (قرار المالك). والتاريخُ تاريخُ الأصل لا اليوم — وإلا بقي
 * المركزُ المالي بتاريخ النهاية مقفلاً على أرقامٍ لم تعد قائمة.
 *
 * **على مستوى المنشأة بحقّها**: يقرأ سطورَ **قيدٍ بعينه** ليقلبها — وقصرُها على فروع
 * القارئ يُنتج عكساً ناقصاً يترك الدفترَ غيرَ متوازن.
 */
export async function reverseClosingEntryWithinTx(
  tx: Prisma.TransactionClient,
  params: { companyId: string; fiscalYearId: string },
): Promise<{ reversalId: string; no: string } | null> {
  const active = await activeClosingEntry(tx, params.fiscalYearId);
  if (!active) return null;

  const lines = await tx.journalLine.findMany({ where: { journalEntryId: active.id }, select: { accountId: true, debit: true, credit: true } });
  const reversal = await createJournalEntry(tx, {
    companyId: params.companyId,
    date: active.date,
    // نصٌّ يُخزَّن لا رسالةُ استثناء — فلا `formatMessage` (انظر المذكّرة أعلاه).
    memo: `عكس قيد إقفال السنة ${active.no} — أُعيد فتح فترة فيها`,
    lines: lines.map((l) => ({ accountId: l.accountId, debit: Number(l.credit), credit: Number(l.debit) })),
    auto: true,
    closingForFiscalYearId: params.fiscalYearId,
    reversalOfId: active.id,
  });
  return { reversalId: reversal.id, no: reversal.no };
}
