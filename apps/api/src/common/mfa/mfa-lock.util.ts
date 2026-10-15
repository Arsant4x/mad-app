import { HttpException, HttpStatus } from '@nestjs/common';
import { formatMessage, MSG } from '../i18n/messages';

/** Wrong codes in a row that set a lock; each further run of this many doubles it. */
export const MFA_FAILURES_PER_LOCK = 5;
const MINUTE_MS = 60_000;
const FIRST_LOCK_MINUTES = 15;
const FIRST_LOCK_MS = FIRST_LOCK_MINUTES * MINUTE_MS;
const MAX_LOCK_MS = 24 * 60 * MINUTE_MS;

/** Lock length set by reaching this many consecutive failures, or 0 when it sets none. */
export function mfaLockDurationMs(failedCount: number): number {
  if (failedCount < MFA_FAILURES_PER_LOCK || failedCount % MFA_FAILURES_PER_LOCK !== 0) return 0;
  const level = failedCount / MFA_FAILURES_PER_LOCK;
  return Math.min(FIRST_LOCK_MS * 2 ** (level - 1), MAX_LOCK_MS);
}

/** 429 with the time left, in minutes under an hour and in hours above. */
export function mfaLockedException(until: Date, now: Date): HttpException {
  const leftMs = Math.max(until.getTime() - now.getTime(), 0);
  const message =
    leftMs <= 60 * MINUTE_MS
      ? formatMessage(MSG.mfa_locked_minutes, { minutes: Math.max(Math.ceil(leftMs / MINUTE_MS), 1) })
      : formatMessage(MSG.mfa_locked_hours, { hours: Math.ceil(leftMs / (60 * MINUTE_MS)) });
  return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}
