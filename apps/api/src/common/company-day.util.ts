import { Prisma } from '@mad-app/db';
import { dayStartOf, zoneOffsetMin } from './wall-clock.util';

/**
 * Today as the company counts it, from the time zone stored on the company, shaped like a stored
 * `@db.Date`. A posting dated "today" uses it, so a reversal just after the company's midnight lands
 * in the company's new day and month rather than in the UTC day before it.
 */
export async function companyToday(tx: Prisma.TransactionClient, companyId: string, now: Date = new Date()): Promise<Date> {
  const { timeZone } = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { timeZone: true } });
  return dayStartOf(now, zoneOffsetMin(now, timeZone));
}
