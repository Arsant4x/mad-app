import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { MSG } from '../common/i18n/messages';

@Injectable()
export class CustomersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.customer.findMany({ ...{ orderBy: { name: 'asc' } }, ...(includeArchived ? {} : { where: { archived: false } }) }));
  }

  create(companyId: string, dto: CreateCustomerDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber);
      return tx.customer.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          vatNumber: dto.vatNumber || null,
          phone: dto.phone || null,
          creditLimit: dto.creditLimit ?? 0,
        } as unknown as Prisma.CustomerCreateInput,
      });
    });
  }

  update(companyId: string, id: string, dto: UpdateCustomerDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber, id);

      const data: Prisma.CustomerUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.vatNumber !== undefined) data.vatNumber = dto.vatNumber || null;
      if (dto.phone !== undefined) data.phone = dto.phone || null;
      if (dto.creditLimit !== undefined) data.creditLimit = dto.creditLimit;

      return tx.customer.update({ where: { id }, data });
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      return tx.customer.update({ where: { id }, data: { archived } });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      // Checked explicitly rather than by catching a foreign-key error: a soft
      // delete never touches the FK, so the database can no longer be the one
      // refusing this. Same rule (CLAUDE.md 6.4), enforced where it's visible.
      const invoiceCount = await tx.invoice.count({ where: { customerId: id } });
      if (invoiceCount > 0) throw new ConflictException(MSG.customer_has_invoices);

      // Soft delete — recoverable from the trash for 30 days.
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  /** Mirrors the mockup's duplicate-name/duplicate-VAT check in createCustomer(). */
  private async assertNoDuplicate(tx: Prisma.TransactionClient, name?: string, vatNumber?: string, excludeId?: string): Promise<void> {
    if (!name && !vatNumber) return;
    const or: Prisma.CustomerWhereInput[] = [];
    if (name) or.push({ name });
    if (vatNumber) or.push({ vatNumber });

    const existing = await tx.customer.findFirst({
      where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) {
      throw new ConflictException(existing.name === name ? `يوجد عميل بنفس الاسم "${name}" بالفعل` : 'يوجد عميل بنفس الرقم الضريبي بالفعل');
    }
  }
}
