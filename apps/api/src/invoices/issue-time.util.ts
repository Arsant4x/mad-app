import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';
import { DEVICE_CLOCK_TOLERANCE_MIN, localDateOf, zoneOffsetMin } from '../common/wall-clock.util';

/**
 * The issue time is stamped in the signed document, so it must fall on the invoice date and must not run ahead of the
 * server clock. Its day is read with the offset sent with it, which is how the date is derived from it elsewhere, or
 * with the company's time zone when no offset was sent.
 */
export async function assertIssueTimeBounded(
  tx: Prisma.TransactionClient,
  companyId: string,
  doc: { issueDate: string; issuedAt?: string; issuedOffsetMin?: number },
  now: Date = new Date(),
): Promise<void> {
  if (!doc.issuedAt) return;
  const issuedAt = new Date(doc.issuedAt);
  if (issuedAt.getTime() > now.getTime() + DEVICE_CLOCK_TOLERANCE_MIN * 60_000) {
    throw new BadRequestException(formatMessage(MSG.invoice_issued_at_in_future, { issuedAt: issuedAt.toISOString() }));
  }
  let offsetMin = doc.issuedOffsetMin;
  if (offsetMin === undefined) {
    const { timeZone } = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { timeZone: true } });
    offsetMin = zoneOffsetMin(issuedAt, timeZone);
  }
  const day = localDateOf(issuedAt, offsetMin);
  const issueDate = new Date(doc.issueDate).toISOString().slice(0, 10);
  if (day !== issueDate) throw new BadRequestException(formatMessage(MSG.invoice_issued_at_other_day, { day, issueDate }));
}
