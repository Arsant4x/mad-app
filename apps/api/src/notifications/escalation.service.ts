import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationKind } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { dayStartOf } from '../common/wall-clock.util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { formatMoney } from '../common/money/rounding';

/**
 * Late-rent escalation.
 *
 * The collection queue asks the person chasing rent to keep chasing. This asks
 * a different question: *when does an arrear stop being their problem?* Past
 * the company's threshold it goes to whoever they nominated — normally the
 * account owner — so a debt nobody is working on eventually lands on a desk
 * where somebody can decide to write it off, go legal, or step in.
 *
 * ⚠️ It escalates **inside the platform**. No email or SMS goes anywhere.
 */

/** One escalation per instalment, ever — not one per day. A manager re-told
 * every morning about the same arrear stops reading the bell, which defeats the
 * whole mechanism. The unique dedupe key is what enforces "once". */
function dedupeKeyFor(installmentId: string): string {
  return `rent-escalation:${installmentId}`;
}

function daysOverdue(dueDate: Date, today: Date): number {
  return Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
}

/** Midnight today. Warranty `endDate` is a bare date (no time), so comparing it
 * against a `new Date()` that carries the current clock time would drop a
 * warranty that expires *today* the moment the clock passes its stored 00:00.
 * Anchoring to the start of the day keeps "expires today" inside the window.
 * يومُ الآن بإزاحةٍ معلَنة لا بمنطقة العملية (`ق-١١٩٠`) — كان `setHours(0, 0, 0, 0)` محلّياً. */
const startOfToday = (): Date => dayStartOf(new Date());

/**
 * Most escalations a single run may raise.
 *
 * A company switching escalation on for the first time can be carrying years
 * of arrears — thousands of instalments past any threshold. Raising them all at
 * once produces a bell nobody will ever open again. Capped and oldest-first,
 * the worst arrears surface now and the rest arrive over following runs, since
 * what was already raised is permanently deduplicated.
 */
const MAX_PER_RUN = 50;

/**
 * How many days ahead of expiry a warranty warning fires.
 *
 * A month gives a landlord time to book a final inspection and use the cover
 * before every future fault becomes theirs. There is no per-company setting for
 * this yet — a fixed, sensible default beats a knob nobody would turn.
 */
const WARRANTY_NOTICE_DAYS = 30;

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Escalates every arrear past the company's threshold. Safe to call as often
   * as you like: the dedupe key means a second run raises nothing new.
   *
   * Returns what it raised so a manual run can say something truthful instead
   * of a silent "done".
   */
  runForCompany(companyId: string, contractId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const policy = await tx.reminderPolicy.findUnique({ where: { companyId } });

      // No policy row, escalation switched off, or reminders off entirely — all
      // mean the same thing: this company hasn't asked for escalation.
      if (!policy?.enabled || policy.escalateAfterDays === null || policy.escalateAfterDays === undefined) {
        return { escalated: 0, threshold: null as number | null, skipped: 'disabled' as const };
      }

      const threshold = policy.escalateAfterDays;
      const today = new Date();
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - threshold);

      const overdue = await tx.installment.findMany({
        where: {
          // الجزئيُّ يُصعَّد كالمتأخّر — باقيه دَينٌ تجاوز عتبةَ التأخّر (`ق-١٠٤٠`/٢).
          status: { in: ['DUE', 'LATE', 'PARTIAL'] },
          dueDate: { lt: cutoff },
          // Narrowing to one lease is how a collector pushes a specific case
          // up now, rather than waiting for the nightly sweep to reach it.
          contract: { status: { notIn: ['CANCELLED', 'DRAFT'] }, ...(contractId ? { id: contractId } : {}) },
        },
        orderBy: { dueDate: 'asc' },
        include: {
          contract: { select: { id: true, no: true, tenant: true, unit: { select: { unitNo: true, property: { select: { name: true } } } } } },
        },
      });

      // Which of these were escalated already. Asked once, up front, rather
      // than letting every run re-attempt thousands of inserts that the unique
      // index would only reject again.
      const alreadyRaised = new Set(
        (
          await tx.notification.findMany({
            where: { kind: NotificationKind.RENT_ESCALATION, dedupeKey: { in: overdue.map((i) => dedupeKeyFor(i.id)) } },
            select: { dedupeKey: true },
          })
        ).map((n) => n.dedupeKey),
      );

      const fresh = overdue.filter((i) => !alreadyRaised.has(dedupeKeyFor(i.id))).slice(0, MAX_PER_RUN);

      let escalated = 0;
      for (const i of fresh) {
        const late = daysOverdue(i.dueDate, today);
        const raised = await NotificationsService.raise(tx, companyId, {
          kind: NotificationKind.RENT_ESCALATION,
          dedupeKey: dedupeKeyFor(i.id),
          // Recipient is resolved at raise time, not at read time: if the
          // company later changes who receives escalations, what already went
          // to the previous manager stays theirs — it is a record of what was
          // handed to whom.
          targetUserId: policy.escalateToUserId,
          title: `تأخر تحصيل ${late} يوم — ${i.contract.tenant}`,
          body:
            `قسط بمبلغ ${formatMoney(Number(i.amount))} مستحق منذ ${i.dueDate.toISOString().slice(0, 10)} ` +
            `(${late} يوماً) على العقد ${i.contract.no} — ${i.contract.unit.property.name} وحدة ${i.contract.unit.unitNo}. ` +
            `تجاوز حد التصعيد المحدد (${threshold} يوم).`,
          linkScreen: 'contracts',
          linkId: i.contract.id,
        });
        if (raised) escalated += 1;
      }

      // `remaining` is what the cap held back — the caller can say "50 raised,
      // 900 still to come" instead of implying the job is finished.
      return {
        escalated,
        threshold,
        checked: overdue.length,
        remaining: overdue.length - alreadyRaised.size - escalated,
      };
    });
  }

  /**
   * Warns about cover that is about to lapse.
   *
   * A warranty is worth money only while it is live, and the last weeks are
   * exactly when a landlord would want a final inspection done — after it
   * expires, every fault is theirs. The alert is what turns a filed document
   * into a decision.
   *
   * Same dedupe discipline as escalation: one warning per warranty, ever.
   */
  warrantyExpiryForCompany(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const today = startOfToday();
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + WARRANTY_NOTICE_DAYS);

      const expiring = await tx.warranty.findMany({
        // Already-expired cover is excluded: warning about something that
        // lapsed last year is noise, not notice.
        where: { endDate: { gte: today, lte: horizon } },
        orderBy: { endDate: 'asc' },
        include: { property: { select: { name: true } }, unit: { select: { unitNo: true } } },
      });

      let raised = 0;
      for (const w of expiring) {
        const daysLeft = Math.round((w.endDate.getTime() - today.getTime()) / 86400000);
        const where = w.unit ? `${w.property.name} وحدة ${w.unit.unitNo}` : w.property.name;

        const created = await NotificationsService.raise(tx, companyId, {
          kind: NotificationKind.WARRANTY_EXPIRING,
          dedupeKey: `warranty-expiring:${w.id}`,
          title: `ضمان ينتهي خلال ${daysLeft} يوم — ${w.subject}`,
          body:
            `ضمان «${w.subject}» على ${where} من ${w.provider} ينتهي في ${w.endDate.toISOString().slice(0, 10)}. ` +
            `بعد هذا التاريخ تتحمل الشركة كل عطل. يُنصح بفحص ما يغطيه قبل انتهائه.`,
          linkScreen: 'warranties',
          linkId: w.id,
        });
        if (created) raised += 1;
      }

      return { raised, checked: expiring.length, noticeDays: WARRANTY_NOTICE_DAYS };
    });
  }

  /**
   * Daily sweep across every active company.
   *
   * ⚠️ This runs in the API process. Two API instances means this fires twice —
   * which is *harmless by design*, because the unique dedupe key makes the
   * second run a no-op rather than a second notification. If this ever moves to
   * a real job queue, that property is what makes the move safe.
   *
   * A failure in one company must not stop the rest, so each is caught and
   * logged individually.
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async runForAllCompanies(): Promise<{ companies: number; escalated: number; warned: number }> {
    // Deliberately the unscoped client: this is the one place that legitimately
    // crosses tenants — to then enter each tenant's own context below.
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

    let escalated = 0;
    let warned = 0;
    for (const c of companies) {
      // Escalation and warranty checks are independent: a failure in one must
      // not skip the other for the same company, nor the rest of the sweep.
      try {
        const result = await this.runForCompany(c.id);
        escalated += result.escalated;
      } catch (e) {
        this.logger.error(`Escalation sweep failed for company ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
      try {
        const result = await this.warrantyExpiryForCompany(c.id);
        warned += result.raised;
      } catch (e) {
        this.logger.error(`Warranty-expiry sweep failed for company ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
    }

    if (escalated > 0) this.logger.log(`Escalation sweep raised ${escalated} notification(s) across ${companies.length} company(ies)`);
    if (warned > 0) this.logger.log(`Warranty-expiry sweep raised ${warned} notification(s) across ${companies.length} company(ies)`);
    return { companies: companies.length, escalated, warned };
  }
}
