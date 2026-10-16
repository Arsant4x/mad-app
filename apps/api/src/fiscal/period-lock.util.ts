import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';
import { ensureFiscalYearFor } from './fiscal-calendar.util';

/** The placeholder is substituted *before* HttpExceptionFilter picks a
 * language, so a month **name** would have to be baked in for one language and
 * would then read wrong in the other ("Period يونيو 2033 is closed"). A
 * numeric `06/2033` is correct in both. */
function periodLabel(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

/**
 * Refuses to let anything be posted into a closed period.
 *
 * Called from `createJournalEntry`, which is the single path every posting
 * takes — manual entries, invoice/purchase auto-posting, and rent payments —
 * so closing a period locks all of them at once rather than needing the same
 * check repeated in each service.
 *
 * ⚖️ **ولا يعمل القفلُ مفتوحاً** (توجيه ٢٧٥ · `ق-١٥٨٤`، بحكم صاحب المشروع). كان هنا «لا سنةَ معرَّفةً أصلاً ⟵ لا قيد»
 * (موروثاً من النموذج كي لا تنكسر منشأةٌ بلا تقويم)، فكلُّ ترحيلٍ يمرّ حتى ينشئ التاجرُ سنةً بيده. واليوم تولد المنشأةُ بسنتها،
 * وتاريخٌ بلا فترةٍ يُنشئ سنتَه قبل السؤال (`ensureFiscalYearFor`)، فكلُّ قيدٍ يقع في فترةٍ تُقفل.
 */
export async function assertPeriodOpen(tx: Prisma.TransactionClient, date: Date): Promise<void> {
  await ensureFiscalYearFor(tx, date);

  /**
   * ⚠️ **`getUTC*` لا `getMonth`/`getFullYear`** — والفرق يفتح فترةً مقفلة.
   *
   * كل تواريخ المستندات تصل هنا مُحلَّلةً من `YYYY-MM-DD`، والمواصفة تُحلّلها
   * **UTC حصراً**. فقراءتها بدوالّ محلية تُدخِل **منطقة العملية** في حكمٍ لا
   * شأن لها به: `2027-03-01T00:00:00Z` يُقرأ `month = 3` تحت UTC والرياض،
   * و**`month = 2`** غرب غرينتش.
   *
   * والأثر ليس عرضاً خاطئاً بل **بوابةً تُفتح**: يُبحث عن فترة `02/2027` بدل
   * `03/2027`، فإن كانت الأولى مفتوحة **مرّ القيد إلى فترةٍ مقفلة**. وهذه
   * الدالة هي **بوابة كل ترحيل** — يدويٍّ وفاتورةٍ ومشترى وسند قبض — فالخلل
   * فيها يمسّ كل مسار في النظام دفعةً واحدة.
   *
   * ولا يُعالَج بضبط `TZ` على الحاويات: ذاك يُصلح منطقةً ويكسر أخرى، والمنصّة
   * متعددة المستأجرين. **فالمصدر الصحيح تاريخُ المستند كما خُزِّن، لا منطقةٌ
   * يُتّفق عليها.** (§8.13: خاصيةٌ من البيئة لا من النظام.)
   *
   * ⚠️ **وحدُّه معلَن:** يجعل القراءة موافقةً للتخزين. ولا يحلّ سؤال «أي يومٍ
   * هو اليوم لتاجرٍ في الرياض» — فذاك يخصّ ما يُرسله العميل، لا ما نقرؤه هنا.
   */
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const found = await tx.fiscalPeriod.findFirst({ where: { month, year }, select: { id: true } });
  // FOR SHARE until the posting commits: a close (FOR UPDATE) waits for it, and a posting that meets a close in
  // progress waits for it and then reads the status it committed.
  const [period] = found
    ? await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "fiscal_periods" WHERE "id" = ${found.id} FOR SHARE`
    : [];

  // Still no period: the computed year clashes with a hand-made year of a
  // different span. A genuine configuration error, not something to wave
  // through — the entry would otherwise sit outside every reporting period.
  if (!period) throw new ConflictException(MSG.fiscal_no_period_for_date);

  if (period.status === 'CLOSED') {
    throw new ConflictException(formatMessage(MSG.fiscal_period_closed, { period: periodLabel(month, year) }));
  }
}
