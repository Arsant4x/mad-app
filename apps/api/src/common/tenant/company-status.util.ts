import { AccountStatus } from '@prisma/client';

export interface StatusBearing {
  status: AccountStatus;
  frozenAt: Date | null;
  subEnd: Date | null;
}

const FROZEN_TO_STOPPED_GRACE_DAYS = 30;

/**
 * Mirrors the mockup's checkSubscriptionStatus(): a company transitions
 * ACTIVE -> FROZEN once past its subscription end date, then FROZEN ->
 * STOPPED after a 30-day grace period with no renewal. Pure function so it
 * can be reused at login time and on every tenant-guarded request without
 * duplicating the rule.
 */
export function evaluateCompanyStatus(company: StatusBearing, now: Date = new Date()): { status: AccountStatus; frozenAt: Date | null } {
  if (!company.subEnd) {
    return { status: company.status, frozenAt: company.frozenAt };
  }

  if (company.status === 'ACTIVE' && now > company.subEnd) {
    return { status: 'FROZEN', frozenAt: now };
  }

  if (company.status === 'FROZEN' && company.frozenAt) {
    const limit = new Date(company.frozenAt);
    limit.setDate(limit.getDate() + FROZEN_TO_STOPPED_GRACE_DAYS);
    if (now > limit) {
      return { status: 'STOPPED', frozenAt: company.frozenAt };
    }
  }

  return { status: company.status, frozenAt: company.frozenAt };
}
