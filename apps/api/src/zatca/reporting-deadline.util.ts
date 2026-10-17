const HOUR_MS = 3_600_000;

/** A simplified document has to reach the authority within 24 hours of being issued. */
export const REPORTING_DEADLINE_MS = 24 * HOUR_MS;

/** The owner is warned this long after issue, while there is still time to act. */
export const REPORTING_WARNING_MS = 20 * HOUR_MS;

export type ReportingStage = 'none' | 'approaching' | 'passed';

/**
 * When the reporting clock started: the moment written on the document when it is earlier than
 * the row itself (a sale rung offline and synced later), otherwise when the row was created.
 * A recorded moment later than the row is not trusted to push the deadline back.
 */
export function reportingClockStart(doc: { createdAt: Date; issuedAt: Date | null }): Date {
  return doc.issuedAt && doc.issuedAt.getTime() < doc.createdAt.getTime() ? doc.issuedAt : doc.createdAt;
}

export function reportingStage(clockStart: Date, now: Date): ReportingStage {
  const age = now.getTime() - clockStart.getTime();
  if (age >= REPORTING_DEADLINE_MS) return 'passed';
  if (age >= REPORTING_WARNING_MS) return 'approaching';
  return 'none';
}

/** Whole hours since the clock started, for the notification text. */
export function hoursSince(clockStart: Date, now: Date): number {
  return Math.floor((now.getTime() - clockStart.getTime()) / HOUR_MS);
}

export function reportingDedupeKey(stage: Exclude<ReportingStage, 'none'>, invoiceId: string): string {
  return stage === 'approaching' ? `zatca-report-due:${invoiceId}` : `zatca-report-late:${invoiceId}`;
}
