import { AccountStatus } from '@mad-app/db';

export interface StatusBearing {
  status: AccountStatus;
  frozenAt: Date | null;
  subEnd: Date | null;
}

/**
 * مهلة السماح بين التجميد والإيقاف — **مصدرٌ واحد**.
 *
 * كانت مكتوبةً رقماً في ملفين (هنا وفي `subscription.service.ts`) بلا حارس يمنع
 * افتراقهما: أحدهما يقرّر متى يُوقَف الحساب، والآخر يحسب العدّ التنازلي المعروض
 * على الشاشة. فتغيير أحدهما وحده يجعل التاجر يرى مهلةً لا تطابق ما يفعله الحارس.
 *
 * ⚠️ والقرار المسجَّل (المالك 2026-08-14) **يغيّر هذا الرقم إلى ستة أشهر ويُقاس من
 * `subEnd`** — فتوحيده قبل تغييره شرطٌ لا تحسين.
 */
export const FROZEN_TO_STOPPED_GRACE_DAYS = 30;

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

/**
 * A company is born with its subscription end equal to its start, and only a subscription decision
 * moves the end forward, so a term of no length means it never had a subscription. Read by the
 * subscription screen and by the guard's refusal, so neither tells such a company that it ended.
 */
export function neverSubscribed(company: { subStart: Date | null; subEnd: Date | null }): boolean {
  return !!company.subStart && !!company.subEnd && company.subEnd.getTime() <= company.subStart.getTime();
}
