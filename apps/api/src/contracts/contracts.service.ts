import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Property, Unit } from '@prisma/client';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postRentPaymentEntry } from '../journal/auto-posting.util';
import { activeReservationForUnit, expireStaleReservations } from '../reservations/reservations.service';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { generateInstallmentSchedule } from './installment-schedule.util';

const CONTRACT_INCLUDE = {
  unit: { include: { property: true } },
  installments: { orderBy: { dueDate: 'asc' as const } },
  payments: { orderBy: { date: 'desc' as const } },
};

/** Maps a Unit's free-text `type` to the same activity-type space as
 * Property.activityType, so the two can be compared. Custom/unrecognized
 * unit types simply skip the check (see validateContract) — there's no way
 * to validate an arbitrary free-text type against the fixed property enum. */
const UNIT_TYPE_TO_ACTIVITY: Record<string, string> = {
  'سكني': 'residential',
  'محل': 'shop',
  'معرض': 'showroom',
  'مكتب': 'office',
  'مخزن': 'warehouse',
};

@Injectable()
export class ContractsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => this.listRefreshed(tx));
  }

  findOne(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.refreshInstallmentStatuses(tx, id);
      const contract = await tx.contract.findUnique({ where: { id }, include: CONTRACT_INCLUDE });
      if (!contract) throw new NotFoundException('العقد غير موجود');
      return contract;
    });
  }

  create(companyId: string, dto: CreateContractDto) {
    // Retries the whole transaction on a "no" collision from a concurrent
    // create — same reasoning as InvoicesService.create.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const unit = await tx.unit.findUnique({ where: { id: dto.unitId }, include: { property: true } });
        if (!unit) throw new NotFoundException('الوحدة غير موجودة');

        const start = new Date(dto.start);
        const end = new Date(dto.end);
        const isDraft = dto.draft ?? false;
        if (!isDraft) await this.validateContract(tx, unit, unit.property, start, end, dto.tenant);

        const no = await this.nextContractNumber(tx);
        const customerId = isDraft ? null : (await this.syncTenantCustomer(tx, dto.tenant, dto.phone)).id;

        const created = await tx.contract.create({
          data: {
            unitId: dto.unitId,
            customerId,
            no,
            ejarNo: dto.ejarNo,
            tenant: dto.tenant,
            phone: dto.phone,
            value: dto.value,
            cycle: dto.cycle,
            start,
            end,
            deposit: dto.deposit ?? 0,
            services: dto.services,
            furnished: dto.furnished,
            status: isDraft ? 'DRAFT' : 'DUE',
          } as unknown as Prisma.ContractUncheckedCreateInput,
        });

        if (!isDraft) {
          const schedule = generateInstallmentSchedule(start, end, dto.value, dto.cycle);
          await tx.installment.createMany({
            data: schedule.map((s) => ({
              contractId: created.id,
              dueDate: s.dueDate,
              amount: s.amount,
            })) as unknown as Prisma.InstallmentUncheckedCreateInput[],
          });

          // Matches the mockup: creating a live (non-draft) contract for a
          // unit that carries a matching-name active reservation converts
          // that reservation rather than leaving it dangling — mismatched
          // names were already rejected above by validateContract.
          const rsv = await activeReservationForUnit(tx, dto.unitId);
          if (rsv) await tx.reservation.update({ where: { id: rsv.id }, data: { status: 'CONVERTED' } });
        }

        return tx.contract.findUniqueOrThrow({ where: { id: created.id }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateContractDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.contract.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('العقد غير موجود');

      const data: Prisma.ContractUncheckedUpdateInput = {};
      if (dto.tenant !== undefined) data.tenant = dto.tenant;
      if (dto.phone !== undefined) data.phone = dto.phone;
      if (dto.services !== undefined) data.services = dto.services;
      if (dto.furnished !== undefined) data.furnished = dto.furnished;
      if (dto.ejarNo !== undefined) data.ejarNo = dto.ejarNo;

      return tx.contract.update({ where: { id }, data, include: CONTRACT_INCLUDE });
    });
  }

  cancel(companyId: string, id: string, dto: CancelContractDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.contract.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('العقد غير موجود');
      if (existing.status === 'CANCELLED') throw new ConflictException('العقد ملغى بالفعل');

      const cancelDate = new Date(dto.cancelDate);
      const data: Prisma.ContractUncheckedUpdateInput = { status: 'CANCELLED', cancelDate, cancelReason: dto.cancelReason };
      // Shrinking `end` to the cancel date is what frees the unit up again —
      // UnitsService's status check only looks at contracts still covering
      // today (start <= today <= end).
      if (cancelDate < existing.end) data.end = cancelDate;

      await tx.contract.update({ where: { id }, data });

      if (dto.installmentDisposition === 'cancel') {
        await tx.installment.updateMany({
          where: { contractId: id, status: { in: ['DUE', 'LATE'] }, dueDate: { gte: cancelDate } },
          data: { status: 'CANCELLED' },
        });
      }

      return tx.contract.findUniqueOrThrow({ where: { id }, include: CONTRACT_INCLUDE });
    });
  }

  recordPayment(companyId: string, contractId: string, dto: RecordPaymentDto) {
    // Retries on a journal-entry "no" collision from a concurrent payment.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException('العقد غير موجود');

        let installment = null;
        if (dto.installmentId) {
          installment = await tx.installment.findUnique({ where: { id: dto.installmentId } });
          if (!installment || installment.contractId !== contractId) throw new NotFoundException('القسط غير موجود');
        }

        if (dto.method === 'BANK' && !dto.bankId) throw new BadRequestException('الرجاء اختيار الحساب البنكي');
        const bank = dto.method === 'BANK' ? await tx.bank.findUnique({ where: { id: dto.bankId! } }) : null;
        if (dto.method === 'BANK' && !bank) throw new NotFoundException('الحساب البنكي غير موجود');

        const discount = dto.discount ?? 0;
        const netAmount = Math.round((dto.amount - discount) * 100) / 100;
        if (netAmount <= 0) throw new BadRequestException('المبلغ الصافي يجب أن يكون أكبر من صفر');

        const journalEntry = await postRentPaymentEntry(tx, companyId, {
          contractNo: contract.no,
          tenant: contract.tenant,
          date: new Date(dto.date),
          netAmount,
        });

        if (bank) {
          await tx.bank.update({ where: { id: bank.id }, data: { balance: { increment: netAmount } } });
          await tx.bankTransaction.create({
            data: {
              bankId: bank.id,
              date: new Date(dto.date),
              description: `دفعة إيجار — عقد ${contract.no} — ${contract.tenant}`,
              amount: netAmount,
              source: 'rent',
              matched: !!journalEntry,
              entryNo: journalEntry?.no ?? null,
            } as unknown as Prisma.BankTransactionUncheckedCreateInput,
          });
        }

        const payment = await tx.rentPayment.create({
          data: {
            contractId,
            installmentId: dto.installmentId,
            date: new Date(dto.date),
            amount: dto.amount,
            discount,
            netAmount,
            method: dto.method,
            bankId: dto.method === 'BANK' ? dto.bankId : undefined,
            notes: dto.notes,
            journalEntryId: journalEntry?.id,
          } as unknown as Prisma.RentPaymentUncheckedCreateInput,
        });

        if (installment) {
          await tx.installment.update({ where: { id: installment.id }, data: { status: 'PAID' } });
        }

        return tx.rentPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { installment: true } });
      }),
    );
  }

  private async validateContract(tx: Prisma.TransactionClient, unit: Unit, property: Property, start: Date, end: Date, tenantName: string, excludeContractId?: string): Promise<void> {
    if (start > end) throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');

    if (property.activityType && property.activityType !== 'mixed') {
      const mapped = UNIT_TYPE_TO_ACTIVITY[unit.type];
      if (mapped && mapped !== property.activityType) {
        throw new ConflictException('نوع الوحدة لا يتوافق مع نشاط العقار المحدَّد');
      }
    }
    if (property.activityType === 'residential' && property.activitySubtype && unit.subtype && unit.subtype !== property.activitySubtype) {
      throw new ConflictException('فئة الوحدة لا تتوافق مع الفئة السكنية المحدَّدة للعقار');
    }
    if (property.ownership === 'leased' && property.leaseStart && property.leaseEnd) {
      if (start < property.leaseStart || end > property.leaseEnd) {
        throw new ConflictException('مدة العقد يجب أن تقع ضمن فترة عقد إيجار العقار الأصلي');
      }
    }

    const overlapping = await tx.contract.findFirst({
      where: {
        unitId: unit.id,
        status: { not: 'CANCELLED' },
        ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
        start: { lte: end },
        end: { gte: start },
      },
    });
    if (overlapping) throw new ConflictException(`تعارض تواريخ — الوحدة مؤجَّرة بالفعل بموجب العقد ${overlapping.no} خلال هذه الفترة`);

    await expireStaleReservations(tx);
    const activeRsv = await activeReservationForUnit(tx, unit.id);
    if (activeRsv && activeRsv.name.trim() !== tenantName.trim()) {
      throw new ConflictException(
        `تعذّر الحفظ — هذه الوحدة محجوزة بعربون لـ"${activeRsv.name}" حتى ${activeRsv.expiryDate.toISOString().slice(0, 10)}. لا يمكن تأجيرها لمستأجر آخر قبل انتهاء الحجز، أو أدخل نفس الاسم لتحويل الحجز إلى عقد`,
      );
    }
  }

  private async syncTenantCustomer(tx: Prisma.TransactionClient, name: string, phone?: string) {
    const existing = await tx.customer.findFirst({ where: { name } });
    if (existing) {
      if (phone && phone !== existing.phone) {
        return tx.customer.update({ where: { id: existing.id }, data: { phone } });
      }
      return existing;
    }
    return tx.customer.create({ data: { name, phone } as unknown as Prisma.CustomerCreateInput });
  }

  /** `EJ-<year>-<seq>`, same max-based scheme as invoice/purchase/journal
   * numbering — see InvoicesService.nextInvoiceNumber for why count() would
   * be wrong here. */
  private async nextContractNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `EJ-${year}-`;
    const rows = await tx.contract.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });
    const maxSeq = rows.reduce((max, r) => {
      const n = parseInt(r.no.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  /** Lazily flips DUE -> LATE for any installment whose due date has passed
   * — matches the mockup's `refreshInstallmentStatuses`, called on every
   * read rather than via a background job. */
  private async refreshInstallmentStatuses(tx: Prisma.TransactionClient, contractId?: string): Promise<void> {
    await tx.installment.updateMany({
      where: { status: 'DUE', dueDate: { lt: new Date() }, ...(contractId ? { contractId } : {}) },
      data: { status: 'LATE' },
    });
  }

  private async listRefreshed(tx: Prisma.TransactionClient) {
    await this.refreshInstallmentStatuses(tx);
    return tx.contract.findMany({ include: CONTRACT_INCLUDE, orderBy: { start: 'desc' } });
  }
}
