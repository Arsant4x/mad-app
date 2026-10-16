import { Injectable } from '@nestjs/common';
import { evaluateCompanyStatus, FROZEN_TO_STOPPED_GRACE_DAYS, neverSubscribed } from '../common/tenant/company-status.util';
import { PrismaService } from '../prisma/prisma.service';

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

/**
 * What state the company's subscription is in. Reachable even when the tenant is frozen or stopped,
 * so the owner always sees why writing is closed. Nothing here grants subscription time: that happens
 * only on the platform's two person subscription decision.
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
      neverSubscribed: neverSubscribed(company),
    };
  }
}
