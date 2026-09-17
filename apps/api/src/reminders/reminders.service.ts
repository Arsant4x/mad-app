import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { SendReminderDto, UpdateReminderPolicyDto } from './dto/reminder.dto';
import { formatMoney } from '../common/money/rounding';

/**
 * Rent-collection reminders.
 *
 * ⚠️ **Nothing here sends a message.** No SMS or WhatsApp provider is wired up,
 * so what the platform does is decide *who is due a reminder today*, render the
 * text from the company's own template, and record what the user actually sent.
 * Calling this "automatic reminders" while a human still presses send would be
 * a claim the landlord discovers is false the first time rent goes uncollected.
 */

/** Used when the company hasn't set a policy yet — chase three days ahead, then
 * weekly. Weekly rather than daily because a tenant messaged every morning
 * stops reading the messages. */
const DEFAULT_POLICY = {
  enabled: true,
  daysBefore: 3,
  repeatEveryDays: 7,
  /** Escalation is **off** until asked for. Switching it on by default would
   * bury a new company's manager under every arrear they inherited on day one,
   * and a notification screen that opens with 900 unread items is one nobody
   * reads again. */
  escalateAfterDays: null as number | null,
  escalateToUserId: null as string | null,
};

/** The message when the company has written no template of its own. */
const FALLBACK_TEMPLATE =
  'عزيزنا {tenant}، نذكّركم بقسط الإيجار البالغ {amount} المستحق بتاريخ {dueDate} عن {unit}. شاكرين لكم حسن تعاونكم.';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

@Injectable()
export class RemindersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  getPolicy(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const found = await tx.reminderPolicy.findUnique({ where: { companyId } });
      // Returned rather than created on read: a company that never opens this
      // screen shouldn't accumulate rows it didn't ask for.
      return found ?? { companyId, ...DEFAULT_POLICY };
    });
  }

  updatePolicy(companyId: string, dto: UpdateReminderPolicyDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // A recipient from another company would send this company's arrears —
      // tenant names and amounts — to a stranger. RLS scopes the lookup, so an
      // outside id simply isn't found.
      if (dto.escalateToUserId) {
        const recipient = await tx.companyUser.findFirst({ where: { id: dto.escalateToUserId, companyId } });
        if (!recipient) throw new BadRequestException(MSG.escalation_recipient_not_found);
      }

      return tx.reminderPolicy.upsert({
        where: { companyId },
        create: { companyId, ...DEFAULT_POLICY, ...dto } as unknown as Prisma.ReminderPolicyUncheckedCreateInput,
        update: dto,
      });
    });
  }

  /**
   * Who should be chased today, and with what text.
   *
   * Computed on read rather than queued in advance: a tenant who paid this
   * morning must drop off the list immediately, and a stored queue would still
   * be holding their name.
   */
  dueToday(companyId: string, contractId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const policy = (await tx.reminderPolicy.findUnique({ where: { companyId } })) ?? DEFAULT_POLICY;
      const today = startOfDay(new Date());

      if (!policy.enabled) return { enabled: false, policy, reminders: [] };

      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + policy.daysBefore);

      const installments = await tx.installment.findMany({
        where: {
          // الجزئيُّ يبقى في التذكير — قسطٌ قُبض بعضُه ما زال مستحقّاً بباقيه (`ق-١٠٤٠`/٢).
          status: { in: ['DUE', 'LATE', 'PARTIAL'] },
          // Everything already overdue, plus the ones coming up inside the
          // notice window.
          dueDate: { lte: horizon },
          // Narrowing to one lease is how a landlord chases a specific tenant
          // without hunting through the whole queue.
          contract: { status: { notIn: ['CANCELLED', 'DRAFT'] }, ...(contractId ? { id: contractId } : {}) },
        },
        orderBy: { dueDate: 'asc' },
        include: {
          contract: { select: { id: true, no: true, tenant: true, phone: true, unit: { select: { unitNo: true, property: { select: { name: true } } } } } },
          reminders: { orderBy: { sentAt: 'desc' }, take: 1, select: { sentAt: true, channel: true } },
        },
      });

      const template = (await tx.messageScript.findFirst({ where: { audience: 'TENANT' }, orderBy: { createdAt: 'asc' } }))?.text ?? FALLBACK_TEMPLATE;

      const reminders = installments
        .map((i) => {
          const last = i.reminders[0] ?? null;
          const daysSinceLast = last ? daysBetween(last.sentAt, today) : null;
          const overdueDays = daysBetween(i.dueDate, today);

          return {
            installmentId: i.id,
            contractId: i.contract.id,
            contractNo: i.contract.no,
            tenant: i.contract.tenant,
            phone: i.contract.phone,
            unitNo: i.contract.unit.unitNo,
            propertyName: i.contract.unit.property.name,
            dueDate: i.dueDate,
            amount: i.amount,
            /** Negative = still upcoming. */
            overdueDays,
            lastSentAt: last?.sentAt ?? null,
            daysSinceLast,
            message: renderTemplate(template, {
              tenant: i.contract.tenant,
              amount: formatMoney(Number(i.amount)),
              dueDate: i.dueDate.toISOString().slice(0, 10),
              unit: `${i.contract.unit.property.name} — ${i.contract.unit.unitNo}`,
              contractNo: i.contract.no,
            }),
          };
        })
        // Silence-period filter last, so the fields above are available to
        // explain *why* something is or isn't due.
        .filter((r) => r.daysSinceLast === null || r.daysSinceLast >= policy.repeatEveryDays);

      // A landlord with thousands of overdue instalments gets a work queue, not
      // a data dump: the oldest arrears are the ones to chase, and shipping
      // 4,000 rows to the browser makes the screen unusable for everyone.
      const MAX = 200;
      return { enabled: true, policy, total: reminders.length, truncated: reminders.length > MAX, reminders: reminders.slice(0, MAX) };
    });
  }

  /** Records a reminder the user actually sent. This is also what puts the
   * instalment into its silence period. */
  send(companyId: string, installmentId: string, dto: SendReminderDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const installment = await tx.installment.findUnique({ where: { id: installmentId } });
      if (!installment) throw new NotFoundException(MSG.installment_not_found);

      return tx.rentReminder.create({
        data: { installmentId, channel: dto.channel, message: dto.message.trim() } as unknown as Prisma.RentReminderUncheckedCreateInput,
      });
    });
  }

  /** What was sent on one instalment — the answer to "but we told them". */
  history(companyId: string, installmentId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.rentReminder.findMany({ where: { installmentId }, orderBy: { sentAt: 'desc' } }),
    );
  }
}

/** Substitutes `{placeholder}` from the company's own template. Unknown
 * placeholders are left as-is rather than blanked: a visible `{foo}` tells the
 * user their template has a typo, an empty gap does not. */
function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
