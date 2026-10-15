import { HttpStatus } from '@nestjs/common';
import { MSG } from '../i18n/messages';
import { MFA_FAILURES_PER_LOCK, mfaLockDurationMs, mfaLockedException } from './mfa-lock.util';

const MINUTE = 60_000;

describe('mfaLockDurationMs', () => {
  it('sets no lock before the fifth failure in a row, nor between runs of five', () => {
    expect(MFA_FAILURES_PER_LOCK).toBe(5);
    for (const n of [0, 1, 4, 6, 9]) expect(mfaLockDurationMs(n)).toBe(0);
  });

  it('locks for 15 minutes, then doubles for each further run of five', () => {
    expect(mfaLockDurationMs(5)).toBe(15 * MINUTE);
    expect(mfaLockDurationMs(10)).toBe(30 * MINUTE);
    expect(mfaLockDurationMs(15)).toBe(60 * MINUTE);
    expect(mfaLockDurationMs(35)).toBe(960 * MINUTE);
  });

  it('never locks for more than a day', () => {
    expect(mfaLockDurationMs(40)).toBe(24 * 60 * MINUTE);
    expect(mfaLockDurationMs(5000)).toBe(24 * 60 * MINUTE);
  });
});

describe('mfaLockedException', () => {
  const now = new Date('2026-10-15T10:00:00Z');

  it('answers 429 with the minutes left under an hour', () => {
    const e = mfaLockedException(new Date(now.getTime() + 14.2 * MINUTE), now);
    expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(String(e.getResponse())).toContain(MSG.mfa_locked_minutes);
    expect(String(e.getResponse())).toContain('15');
  });

  it('answers with hours left above an hour', () => {
    const e = mfaLockedException(new Date(now.getTime() + 23.5 * 60 * MINUTE), now);
    expect(String(e.getResponse())).toContain(MSG.mfa_locked_hours);
    expect(String(e.getResponse())).toContain('24');
  });
});
