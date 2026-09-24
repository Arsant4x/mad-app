import { Injectable, NotFoundException } from '@nestjs/common';
import { assertBoxInBranch, branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Prisma } from '@prisma/client';
import { resolveCurrencyWithin, toBaseAmount } from '../common/currency/base-amount.util';
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
        // ترتيبٌ تامّ لا جزئيّ (`ق-٣٥٦`) — ولا `createdAt` على هذا النموذج، فـ`id` وحده يحسم.
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return { items, total, page, pageSize };
    });
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateTransactionDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // بلا عملةٍ صريحة ⟵ عملةُ أساس المنشأة لا الريال (`ق-١٣٦٨`).
      const { currency, exchangeRate } = await resolveCurrencyWithin(tx, companyId, dto);
      // ⚠️ (ق-٢٨١ · ق-٢٨٢ · ق-٢٨٥) **لا يُحرَّك رصيدُ البنك هنا**: كان السطرُ
      //    اليدويّ يزيد الرصيدَ بيدٍ بلا قيدٍ يسنده. وهو **سطرُ مطابقةٍ لا مصدرُ
      //    قيد** — لا يحمل حساباً ثانياً، **وترحيلُه يخترع الطرفَ المقابل**.
      //    فالرصيدُ **مرآةٌ تتبع الأستاذ**، تُكتب من مسار الترحيل وحده.
      const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
      // مستندٌ في فرعٍ لا يستعمل صندوقَ فرعٍ آخر (`ق-١٤٣٧`).
      await assertBoxInBranch(tx, branchId, await tx.bank.findUnique({ where: { id: dto.bankId }, select: { name: true, branchId: true } }));
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

      // ⚠️ (ق-٢٨١ · ق-٢٨٢ · ق-٢٨٥) **لا يُحرَّك رصيدُ البنك هنا**: كان هذا
      //    الموضعُ يعكس المبلغَ القديم ويطبّق الجديد بيدٍ — **ورقمٌ يتحرك بلا
      //    قيدٍ يسنده هو تعريفُ العطل الذي أُصلح**. والسطرُ البنكيُّ اليدويّ
      //    **سطرُ مطابقةٍ لا مصدرُ قيد** (لا يحمل طرفاً مقابلاً أصلاً)، والرصيدُ
      //    **مرآةٌ تتبع الأستاذ** فيُكتب من مسار الترحيل وحده — يحرسه
      //    `bank-mirror.spec.ts`.
      const data: Prisma.BankTransactionUncheckedUpdateInput = {};
      if (dto.bankId !== undefined) {
        // نقلُ الحركة إلى صندوقٍ آخر يُقاس بفرعها كإنشائها (`ق-١٤٣٧`).
        await assertBoxInBranch(tx, existing.branchId, await tx.bank.findUnique({ where: { id: dto.bankId }, select: { name: true, branchId: true } }));
        data.bankId = dto.bankId;
      }
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
      // ولا يُحرَّك الرصيدُ هنا كذلك (ق-٢٨٢): حذفُ سطرِ مطابقةٍ لا يمسّ الأستاذ.
      await tx.bankTransaction.delete({ where: { id } });
    });
  }
}
