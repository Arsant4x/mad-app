import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationKind, ZatcaStatus } from '@mad-app/db';
import { secretIsSet } from '../common/crypto/secret.util';
import { LINE_ORDER } from '../common/document-lines.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { SCHEDULE_TIME_ZONE } from '../common/wall-clock.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { documentInvoiceType } from './hash-chain.util';
import { hoursSince, REPORTING_WARNING_MS, reportingClockStart, reportingDedupeKey, reportingStage } from './reporting-deadline.util';

/** Documents the authority has not answered yet. */
const UNDELIVERED: ZatcaStatus[] = ['NOT_SUBMITTED', 'SUBMITTING', 'STAMPED'];

/** At most this many new notifications per company per run, so an outage does not flood the bell at once. */
const MAX_PER_RUN = 50;

/**
 * Warns the company owner when a simplified document has not reached the authority 20 hours after
 * issue, and again once the 24 hour reporting deadline has passed. The outbox keeps retrying such a
 * document; this is what tells a person before the deadline is missed.
 *
 * Only companies connected to the authority are checked, and only documents created after the
 * connection: what was issued before it is sent on connection and was never on this clock here.
 */
@Injectable()
export class ReportingDeadlineService {
  private readonly logger = new Logger(ReportingDeadlineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Cron('*/15 * * * *', { timeZone: SCHEDULE_TIME_ZONE })
  async runForAllCompanies(now: Date = new Date()): Promise<{ companies: number; raised: number }> {
    // The unscoped client on purpose: companies has no row level security, and each company is then entered in its own context.
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    let raised = 0;
    for (const c of companies) {
      try {
        raised += await this.runForCompany(c.id, now);
      } catch (e) {
        this.logger.error(`Reporting deadline check failed for company ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
    }
    if (raised > 0) this.logger.warn(`Reporting deadline: ${raised} notifications raised across ${companies.length} companies`);
    return { companies: companies.length, raised };
  }

  /**
   * One company in its own context. Company wide by design: the reporting duty is the company's under its
   * tax number, so a document from any branch counts and the notice goes to the owner.
   */
  async runForCompany(companyId: string, now: Date = new Date()): Promise<number> {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const credential = await tx.zatcaCredential.findUnique({ where: { companyId }, select: { productionCsidEnc: true, onboardedAt: true } });
      if (!credential || !secretIsSet(credential.productionCsidEnc)) return 0;

      const warnBefore = new Date(now.getTime() - REPORTING_WARNING_MS);
      const candidates = await tx.invoice.findMany({
        where: {
          zatcaStatus: { in: UNDELIVERED },
          ...(credential.onboardedAt ? { createdAt: { gte: credential.onboardedAt } } : {}),
          OR: [{ createdAt: { lte: warnBefore } }, { issuedAt: { lte: warnBefore } }],
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          no: true,
          createdAt: true,
          issuedAt: true,
          zatcaInvoiceType: true,
          customer: { select: { kind: true, vatNumber: true, country: true } },
          lines: { ...LINE_ORDER, select: { taxExemptionReasonCode: true } },
        },
      });

      const due = candidates.flatMap((doc) => {
        // A standard document is cleared before it is handed over; the 24 hour clock is the reporting path's.
        if (documentInvoiceType(doc) !== 'simplified') return [];
        const start = reportingClockStart(doc);
        const stage = reportingStage(start, now);
        return stage === 'none' ? [] : [{ doc, stage, start, key: reportingDedupeKey(stage, doc.id) }];
      });
      if (due.length === 0) return 0;

      // Asked once up front so a duplicate never reaches the unique index, which would abort this transaction.
      const already = new Set(
        (
          await tx.notification.findMany({
            where: { kind: NotificationKind.ZATCA_REPORTING_DEADLINE, dedupeKey: { in: due.map((d) => d.key) } },
            select: { dedupeKey: true },
          })
        ).map((n) => n.dedupeKey),
      );

      let raised = 0;
      for (const { doc, stage, start } of due.filter((d) => !already.has(d.key)).slice(0, MAX_PER_RUN)) {
        const hours = hoursSince(start, now);
        const created = await NotificationsService.raise(tx, companyId, {
          kind: NotificationKind.ZATCA_REPORTING_DEADLINE,
          dedupeKey: reportingDedupeKey(stage, doc.id),
          title: stage === 'approaching' ? `مستندٌ لم يصل الهيئة ويقترب من مهلة الإبلاغ — ${doc.no}` : `مستندٌ تجاوز مهلة الإبلاغ للهيئة — ${doc.no}`,
          body:
            stage === 'approaching'
              ? `صدر ${doc.no} قبل ${hours} ساعة ولم تُجب الهيئة عنه بعد، ومهلة الإبلاغ 24 ساعة من الإصدار. الإرسال يُعاد آلياً؛ تحقّق من اتصال المنشأة بالهيئة قبل انقضاء المهلة.`
              : `صدر ${doc.no} قبل ${hours} ساعة ولم يصل الهيئة، فتجاوز مهلة الإبلاغ وهي 24 ساعة من الإصدار. الإرسال ما زال يُعاد آلياً حتى تُجيب الهيئة.`,
          linkScreen: 'invoice',
          linkId: doc.id,
        });
        if (created) raised += 1;
      }
      return raised;
    });
  }
}
