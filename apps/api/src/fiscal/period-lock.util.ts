import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const period = await tx.fiscalPeriod.findFirst({ where: { month, year } });

  // A calendar defined but with a gap where this date falls is a genuine
  // configuration error, not something to wave through — the entry would
  // otherwise sit outside every reporting period.
  if (!period) throw new ConflictException(MSG.fiscal_no_period_for_date);

  if (period.status === 'CLOSED') {
    throw new ConflictException(formatMessage(MSG.fiscal_period_closed, { period: periodLabel(month, year) }));
  }
}
