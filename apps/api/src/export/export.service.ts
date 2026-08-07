import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { MSG } from '../common/i18n/messages';

/**
 * Every tenant-owned collection the export carries, keyed by the name it gets
 * in the file. Flat on purpose: children (installments, journal lines…) are
 * their own arrays with foreign keys intact, so the export is a faithful copy
 * of the data rather than a lossy nested view.
 */
const EXPORT_DELEGATES = [
  ['activities', 'businessActivity'],
  ['branches', 'branch'],
  ['currencies', 'currency'],
  ['exchangeRates', 'exchangeRate'],
  ['fiscalYears', 'fiscalYear'],
  ['fiscalPeriods', 'fiscalPeriod'],
  ['accounts', 'account'],
  ['journalEntries', 'journalEntry'],
  ['journalLines', 'journalLine'],
  ['customers', 'customer'],
  ['invoices', 'invoice'],
  ['invoiceLines', 'invoiceLine'],
  ['suppliers', 'supplier'],
  ['purchases', 'purchase'],
  ['products', 'product'],
  ['warehouses', 'warehouse'],
  ['stockMovements', 'stockMovement'],
  ['employees', 'employee'],
  ['leaveTypes', 'leaveType'],
  ['leaveRequests', 'leaveRequest'],
  ['banks', 'bank'],
  ['bankTransactions', 'bankTransaction'],
  ['properties', 'property'],
  ['units', 'unit'],
  ['contracts', 'contract'],
  ['installments', 'installment'],
  ['rentPayments', 'rentPayment'],
  ['contractDeposits', 'contractDeposit'],
  ['depositDeductions', 'depositDeduction'],
  ['contractClaims', 'contractClaim'],
  ['contractKeyMoney', 'contractKeyMoney'],
  ['contractHandovers', 'contractHandover'],
  ['handoverItems', 'handoverItem'],
  ['reservations', 'reservation'],
  ['maintenanceRequests', 'maintenanceRequest'],
  ['warranties', 'warranty'],
  ['rentReminders', 'rentReminder'],
  ['obligations', 'governmentObligation'],
  ['messageScripts', 'messageScript'],
] as const;

type DelegateLike = { findMany: (args?: unknown) => Promise<unknown[]> };

@Injectable()
export class ExportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The company's data as one JSON document.
   *
   * Owner-only: an employee with a screen or two of permissions must not be
   * able to walk out with the entire database. Works during the grace period by
   * design — the owner's rule for a lapsed subscription is literally "view and
   * **export** only", and a merchant deciding whether to leave needs its data
   * to decide with.
   */
  async exportAll(companyId: string, actorType: string) {
    if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.export_owner_only);

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { orgName: true, legalName: true, vatNumber: true, crNumber: true, subStart: true, subEnd: true, createdAt: true },
    });

    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const data: Record<string, unknown[]> = {};
      for (const [key, delegate] of EXPORT_DELEGATES) {
        data[key] = await ((tx as unknown as Record<string, DelegateLike>)[delegate]).findMany();
      }
      return {
        format: 'mad-app-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        company,
        data,
      };
    });
  }
}
