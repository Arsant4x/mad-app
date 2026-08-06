import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * Reference implementation for every future tenant-scoped module: all data
 * access goes through `tenantPrisma.runInTenantContext`, never through the
 * raw PrismaService. The service itself never has to filter by companyId —
 * that's handled centrally (see tenant-scope.extension.ts + rls.sql).
 */
@Injectable()
export class AccountsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.account.findMany({ orderBy: { code: 'asc' } }));
  }

  create(companyId: string, dto: CreateAccountDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.assertNoDuplicateCode(tx, dto.code);
      const openingBalance = dto.openingBalance ?? 0;
      return tx.account.create({
        // `companyId` is intentionally omitted here — the tenant-scope
        // extension injects it at runtime (see tenant-scope.extension.ts).
        // Prisma's generated types don't know about that, so the cast is
        // the documented escape hatch for this pattern.
        data: {
          code: dto.code,
          name: dto.name,
          type: dto.type,
          openingBalance,
          balance: openingBalance,
        } as unknown as Prisma.AccountCreateInput,
      });
    });
  }

  update(companyId: string, id: string, dto: UpdateAccountDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.account.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.account_not_found);

      const data: Prisma.AccountUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;

      if (dto.type !== undefined && dto.type !== existing.type) {
        // Changing an account's debit/credit-normal side after it already has
        // posted journal lines would silently flip how every past posting
        // moved its balance — matches the mockup's "لا يمكن تغيير نوع حساب
        // مستخدَم بقيود مرحّلة" restriction.
        const usedInJournal = (await tx.journalLine.count({ where: { accountId: id } })) > 0;
        if (usedInJournal) throw new ConflictException(MSG.account_type_locked);
        data.type = dto.type;
      }

      if (dto.openingBalance !== undefined) {
        // Preserve any drift already posted into `balance` by shifting it by
        // the same delta, rather than overwriting it outright — same pattern
        // as BanksService.update.
        const delta = dto.openingBalance - Number(existing.openingBalance);
        data.openingBalance = dto.openingBalance;
        data.balance = Number(existing.balance) + delta;
      }

      return tx.account.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.account.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.account_not_found);
      try {
        await tx.account.delete({ where: { id } });
      } catch (e) {
        // P2003 = foreign key violation — journal_lines.accountId is ON
        // DELETE RESTRICT, so this fires when the account still has posted
        // journal lines.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ConflictException(MSG.account_has_journal_lines);
        }
        throw e;
      }
    });
  }

  private async assertNoDuplicateCode(tx: Prisma.TransactionClient, code: string, excludeId?: string): Promise<void> {
    const existing = await tx.account.findFirst({ where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException(formatMessage(MSG.account_code_taken, { code }));
  }
}
