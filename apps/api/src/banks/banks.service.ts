import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';

@Injectable()
export class BanksService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.bank.findMany({ orderBy: { name: 'asc' } }));
  }

  create(companyId: string, dto: CreateBankDto) {
    const openingBalance = dto.openingBalance ?? 0;
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.bank.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          iban: dto.iban || null,
          openingBalance,
          balance: openingBalance,
          openingDate: new Date(dto.openingDate),
        } as unknown as Prisma.BankCreateInput,
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateBankDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bank.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الحساب البنكي غير موجود');

      const data: Prisma.BankUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.iban !== undefined) data.iban = dto.iban || null;
      if (dto.openingDate !== undefined) data.openingDate = new Date(dto.openingDate);

      if (dto.openingBalance !== undefined) {
        // Preserve any drift already reflected in `balance` (e.g. from a
        // future Transactions module) by shifting it by the same delta,
        // rather than overwriting it outright — matches the mockup exactly.
        const delta = dto.openingBalance - Number(existing.openingBalance);
        data.openingBalance = dto.openingBalance;
        data.balance = Number(existing.balance) + delta;
      }

      return tx.bank.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bank.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الحساب البنكي غير موجود');
      await tx.bank.delete({ where: { id } });
    });
  }
}
