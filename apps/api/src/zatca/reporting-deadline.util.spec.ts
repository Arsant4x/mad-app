import { isUnansweredDelivery } from '../outbox/outbox.service';
import { hoursSince, REPORTING_DEADLINE_MS, REPORTING_WARNING_MS, reportingClockStart, reportingDedupeKey, reportingStage } from './reporting-deadline.util';
import { ZatcaAttemptFailedException, ZatcaNoAnswerException } from './zatca.service';

const HOUR = 3_600_000;
const ISSUED = new Date('2026-10-01T08:00:00Z');
const at = (hours: number, minutes = 0) => new Date(ISSUED.getTime() + hours * HOUR + minutes * 60_000);

describe('reporting deadline of a simplified document', () => {
  it('warns from 20 hours after issue and calls it passed from 24 hours', () => {
    expect(REPORTING_WARNING_MS).toBe(20 * HOUR);
    expect(REPORTING_DEADLINE_MS).toBe(24 * HOUR);
    expect(reportingStage(ISSUED, at(19, 59))).toBe('none');
    expect(reportingStage(ISSUED, at(20))).toBe('approaching');
    expect(reportingStage(ISSUED, at(23, 59))).toBe('approaching');
    expect(reportingStage(ISSUED, at(24))).toBe('passed');
    expect(reportingStage(ISSUED, at(240))).toBe('passed');
  });

  it('starts the clock at the recorded issue moment only when it is earlier than the row', () => {
    const createdAt = at(30);
    expect(reportingClockStart({ createdAt, issuedAt: ISSUED })).toEqual(ISSUED);
    expect(reportingClockStart({ createdAt, issuedAt: null })).toEqual(createdAt);
    expect(reportingClockStart({ createdAt, issuedAt: at(40) })).toEqual(createdAt);
  });

  it('keys each stage of each document once', () => {
    expect(reportingDedupeKey('approaching', 'i1')).toBe('zatca-report-due:i1');
    expect(reportingDedupeKey('passed', 'i1')).toBe('zatca-report-late:i1');
    expect(hoursSince(ISSUED, at(20, 59))).toBe(20);
  });
});

describe('which authority failures the outbox retries without limit', () => {
  it('a missing answer is unanswered, a failure on our side is not', () => {
    const noAnswer = new ZatcaNoAnswerException('fetch failed');
    expect(isUnansweredDelivery(noAnswer)).toBe(true);
    expect(noAnswer).toBeInstanceOf(ZatcaAttemptFailedException);
    expect(noAnswer.getStatus()).toBe(503);
    expect(noAnswer.reason).toBe('fetch failed');
    expect(isUnansweredDelivery(new ZatcaAttemptFailedException('signing failed'))).toBe(false);
  });
});
