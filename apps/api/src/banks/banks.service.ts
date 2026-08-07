import { Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Prisma } from '@prisma/client';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { MSG } from '../common/i18n/messages';

@Injectable()
export class BanksService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', includeArchived = false) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.bank.findMany({ where: { ...branchFilter(allowedBranchIds), ...(includeArchived ? {} : { archived: false }) }, orderBy: { name: 'asc' } }));
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateBankDto) {
    const openingBalance = dto.openingBalance ?? 0;
    const { currency, exchangeRate } = resolveCurrency(dto);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
      return tx.bank.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          branchId,
          iban: dto.iban || null,
          openingBalance,
          balance: openingBalance,
          openingDate: new Date(dto.openingDate),
          currency,
          exchangeRate,
          baseOpeningBalance: toBaseAmount(openingBalance, exchangeRate),
          baseBalance: toBaseAmount(openingBalance, exchangeRate),
        } as unknown as Prisma.BankCreateInput,
      });
    });
  }

  update(companyId: string, id: string, dto: UpdateBankDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bank.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.bank_not_found);

      const data: Prisma.BankUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.iban !== undefined) data.iban = dto.iban || null;
      if (dto.openingDate !== undefined) data.openingDate = new Date(dto.openingDate);

      if (dto.openingBalance !== undefined) {
        // Preserve any drift already reflected in `balance` (e.g. from a
        // future Transactions module) by shifting it by the same delta,
        // rather than overwriting it outright — matches the mockup exactly.
        const delta = dto.openingBalance - Number(existing.openingBalance);
        const rate = Number(existing.exchangeRate);
        data.openingBalance = dto.openingBalance;
        data.balance = Number(existing.balance) + delta;
        data.baseOpeningBalance = toBaseAmount(dto.openingBalance, rate);
        data.baseBalance = toBaseAmount(Number(existing.balance) + delta, rate);
      }

      return tx.bank.update({ where: { id }, data });
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bank.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.bank_not_found);
      return tx.bank.update({ where: { id }, data: { archived } });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bank.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.bank_not_found);
      await tx.bank.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
