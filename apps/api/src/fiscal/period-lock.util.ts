import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';

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
 * **No fiscal years defined at all means no restriction.** That's deliberate
 * and matches the mockup: a company that has never set up a fiscal calendar
 * must keep working exactly as before, otherwise this feature would silently
 * break every existing installation the moment it shipped.
 */
export async function assertPeriodOpen(tx: Prisma.TransactionClient, date: Date): Promise<void> {
  const anyPeriod = await tx.fiscalPeriod.findFirst({ select: { id: true } });
  if (!anyPeriod) return;

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
  const period = await tx.fiscalPeriod.findFirst({ where: { month, year } });

  // A calendar defined but with a gap where this date falls is a genuine
  // configuration error, not something to wave through — the entry would
  // otherwise sit outside every reporting period.
  if (!period) throw new ConflictException(MSG.fiscal_no_period_for_date);

  if (period.status === 'CLOSED') {
    throw new ConflictException(formatMessage(MSG.fiscal_period_closed, { period: periodLabel(month, year) }));
  }
}
