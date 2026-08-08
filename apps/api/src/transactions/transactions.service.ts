import { Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Prisma } from '@prisma/client';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { MSG } from '../common/i18n/messages';

const TX_INCLUDE = { bank: true } as const;

@Injectable()
export class TransactionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', query: ListTransactionsQueryDto = {}) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 25;
      const q = query.search?.trim();
      // The search nests under AND: branchFilter's restricted form already
      // claims the top-level OR key, and spreading a second OR over it would
      // replace the branch scope with the search — leaking other branches' rows.
      const where: Prisma.BankTransactionWhereInput = {
        ...branchFilter(allowedBranchIds),
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    { description: { contains: q, mode: 'insensitive' } },
                    { bank: { name: { contains: q, mode: 'insensitive' } } },
                    { source: { contains: q, mode: 'insensitive' } },
                    { entryNo: { contains: q, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
      };

      // Sequential on purpose: an interactive transaction runs on a single
      // connection, so concurrent queries on `tx` would only race for it.
      const total = await tx.bankTransaction.count({ where });
      const items = await tx.bankTransaction.findMany({
        where,
        include: TX_INCLUDE,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return { items, total, page, pageSize };
    });
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateTransactionDto) {
    const { currency, exchangeRate } = resolveCurrency(dto);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // Bank balance is updated first so the `bank` relation included below
      // reflects the post-transaction balance (both statements run inside
      // the same DB transaction, so the create sees the just-applied update).
      const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
      await tx.bank.update({ where: { id: dto.bankId }, data: { balance: { increment: dto.amount } } });
      return tx.bankTransaction.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          bankId: dto.bankId,
          branchId,
          date: new Date(dto.date),
          description: dto.description,
          amount: dto.amount,
          source: dto.source || null,
          currency,
          exchangeRate,
          baseAmount: toBaseAmount(dto.amount, exchangeRate),
        } as unknown as Prisma.BankTransactionCreateInput,
        include: TX_INCLUDE,
      });
    });
  }

  update(companyId: string, id: string, dto: UpdateTransactionDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bankTransaction.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.bank_transaction_not_found);

      // Reverse the old amount from the old bank, then apply the new amount
      // to the (possibly different) new bank — matches the mockup exactly,
      // and correctly nets out to just the delta when the bank is unchanged.
      await tx.bank.update({ where: { id: existing.bankId }, data: { balance: { decrement: existing.amount } } });
      const newBankId = dto.bankId ?? existing.bankId;
      const newAmount = dto.amount ?? Number(existing.amount);
      await tx.bank.update({ where: { id: newBankId }, data: { balance: { increment: newAmount } } });

      const data: Prisma.BankTransactionUncheckedUpdateInput = {};
      if (dto.bankId !== undefined) data.bankId = dto.bankId;
      if (dto.date !== undefined) data.date = new Date(dto.date);
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.amount !== undefined) {
        data.amount = dto.amount;
        data.baseAmount = toBaseAmount(dto.amount, dto.exchangeRate ?? Number(existing.exchangeRate));
      }
      if (dto.currency) data.currency = dto.currency;
      if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
      if (dto.source !== undefined) data.source = dto.source || null;

      return tx.bankTransaction.update({ where: { id }, data, include: TX_INCLUDE });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bankTransaction.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.bank_transaction_not_found);
      await tx.bank.update({ where: { id: existing.bankId }, data: { balance: { decrement: existing.amount } } });
      await tx.bankTransaction.delete({ where: { id } });
    });
  }
}
