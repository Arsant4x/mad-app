import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { evaluateCompanyStatus } from '../common/tenant/company-status.util';
import { PrismaService } from '../prisma/prisma.service';
import { MSG } from '../common/i18n/messages';

const FROZEN_TO_STOPPED_GRACE_DAYS = 30;

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

/** Only the company owner manages the subscription — an employee sub-account
 * can view the platform but never renew or pay for it. */
function assertOwner(actorType: string): void {
  if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.sub_owner_only);
}

/**
 * Subscription self-service: what state the subscription is in, and renewing it
 * from inside the platform. Works even when the tenant is frozen or stopped —
 * that is the whole point (no contacting the provider).
 *
 * Uses the raw PrismaService: `companies` carries no RLS (it's the tenant root),
 * and access is scoped by the verified companyId from the guard.
 */
@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async status(companyId: string) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { orgName: true, status: true, frozenAt: true, subStart: true, subEnd: true },
    });
    const now = new Date();
    const evaluated = evaluateCompanyStatus(company, now);

    // Days of paid subscription left (negative once past the end date).
    const daysLeft = company.subEnd ? daysBetween(now, company.subEnd) : null;

    // While frozen, how much of the read-only grace window remains before the
    // account stops entirely.
    let graceDaysLeft: number | null = null;
    if (evaluated.status === 'FROZEN' && company.frozenAt) {
      const stopsAt = new Date(company.frozenAt);
      stopsAt.setDate(stopsAt.getDate() + FROZEN_TO_STOPPED_GRACE_DAYS);
      graceDaysLeft = Math.max(0, daysBetween(now, stopsAt));
    }

    return {
      orgName: company.orgName,
      status: evaluated.status,
      subStart: company.subStart ? company.subStart.toISOString().slice(0, 10) : null,
      subEnd: company.subEnd ? company.subEnd.toISOString().slice(0, 10) : null,
      daysLeft,
      inGrace: evaluated.status === 'FROZEN',
      graceDaysLeft,
    };
  }

  /**
   * Extends the subscription and reactivates it. In production this runs only
   * after a successful payment; that gateway step is deferred, so for now this
   * is the renewal itself.
   *
   * The new end date is `months` past whichever is later — today or the current
   * end — so renewing early adds to the remaining time instead of throwing it
   * away, and renewing after a lapse starts the fresh term from today.
   */
  async renew(companyId: string, actorType: string, months: number) {
    assertOwner(actorType);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { subStart: true, subEnd: true } });
    if (!company) throw new NotFoundException(MSG.company_not_found);

    const now = new Date();
    const base = company.subEnd && company.subEnd > now ? company.subEnd : now;
    const newSubEnd = addMonths(base, months);

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        subEnd: newSubEnd,
        // subStart is fixed at first activation; only set it if somehow missing.
        ...(company.subStart ? {} : { subStart: now }),
        status: 'ACTIVE',
        frozenAt: null,
      },
    });

    return this.status(companyId);
  }
}
