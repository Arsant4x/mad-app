import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { lockReconciledBanks, onOrBeforeReconciled } from '../banks/reconciliation-lock.util';
import { assertBoxInBranch, branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Prisma } from '@mad-app/db';
import { resolveCurrencyWithin, resolveFollowingCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { formatMessage, MSG } from '../common/i18n/messages';

const TX_INCLUDE = { bank: true } as const;

@Injectable()
export class TransactionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * 🔴 **السطرُ بفروع الفاعل — لا بمعرّفه وحدَه** (`ق-١٤٤٠`): كان التعديلُ والحذفُ يقرآن `findUnique({ id })`
   * فموظّفٌ مقيَّدٌ بفرعٍ عدّل سطرَ بنكِ فرعٍ آخر وحذفه حذفاً صلباً. ⟸ خارجُ فروعه **غيرُ موجودٍ له** (`404` كالقائمة)،
   * وسطرُ المنشأة كلِّها (`branchId: null`) مرئيٌّ للجميع كما في `list` — فالمرشِّحُ مرشِّحُ القائمة نفسُه.
   */
  private async findVisible(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', id: string) {
    const existing = await tx.bankTransaction.findFirst({ where: { id, ...branchFilter(allowedBranchIds) } });
    if (!existing) throw new NotFoundException(MSG.bank_transaction_not_found);
    return existing;
  }

  /**
   * A line the reconciliation relies on is not changed by hand: nothing dated on or before a bank's reconciled-through
   * date, or moved into it (reopen first), a line matched to a ledger line (unmatch first), or a line written by a
   * posting (it follows its entry). The bank rows stay share-locked, so a reconciliation close waits for this edit.
   */
  private async assertNotLocked(
    tx: Prisma.TransactionClient,
    companyId: string,
    row: { bankId: string; date: Date; matchedLineId: string | null; entryNo: string | null },
    target?: { bankId: string; date: Date },
  ) {
    const banks = await lockReconciledBanks(tx, companyId, { bankIds: [...new Set([row.bankId, target?.bankId ?? row.bankId])] });
    const closedFor = (bankId: string, date: Date) => banks.find((b) => b.id === bankId && onOrBeforeReconciled(b.reconciledUntil, date));
    const closed = closedFor(row.bankId, row.date) ?? (target ? closedFor(target.bankId, target.date) : undefined);
    if (closed) {
      throw new ConflictException(formatMessage(MSG.bank_transaction_reconciled, { bank: closed.name, until: closed.reconciledUntil!.toISOString().slice(0, 10) }));
    }
    if (row.matchedLineId) throw new ConflictException(MSG.bank_transaction_matched);
    if (row.entryNo) throw new ConflictException(formatMessage(MSG.bank_transaction_posted, { entry: row.entryNo }));
  }

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

  update(companyId: string, allowedBranchIds: string[] | 'all', id: string, dto: UpdateTransactionDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // ق-١٤٤٠: سطرُ فرعٍ آخر غيرُ موجودٍ للفاعل — 404 لا 403، قبل أيّ كتابة.
      const existing = await this.findVisible(tx, allowedBranchIds, id);

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
      // After the box check, so a bank the actor may not use is refused before its reconciliation is read.
      await this.assertNotLocked(tx, companyId, existing, { bankId: dto.bankId ?? existing.bankId, date: dto.date !== undefined ? new Date(dto.date) : existing.date });
      if (dto.date !== undefined) data.date = new Date(dto.date);
      if (dto.description !== undefined) data.description = dto.description;
      // العملةُ والسعرُ المرسَلان يُقاسان كمستندٍ جديد (توجيه ٢٧٤ · البند 1): لا سعرَ حرّاً لعملة الأساس، ولا ترثُ أجنبيةٌ
      // سعرَ غيرها. والأساسُ يُعاد حسابُه بالسعر الذي يُخزَّن، فلا يبقى أساسٌ بسعرٍ والسعرُ غيرُه.
      const priced = await resolveFollowingCurrency(tx, companyId, dto, { currency: existing.currency, exchangeRate: Number(existing.exchangeRate) });
      if (dto.amount !== undefined) data.amount = dto.amount;
      if (dto.amount !== undefined || dto.currency !== undefined || dto.exchangeRate !== undefined) {
        data.baseAmount = toBaseAmount(dto.amount ?? Number(existing.amount), priced.exchangeRate);
        data.currency = priced.currency;
        data.exchangeRate = priced.exchangeRate;
      }
      if (dto.source !== undefined) data.source = dto.source || null;

      return tx.bankTransaction.update({ where: { id }, data, include: TX_INCLUDE });
    });
  }

  async remove(companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // ق-١٤٤٠: سطرُ فرعٍ آخر غيرُ موجودٍ للفاعل — 404 لا 403، فلا يُحذف ما لا يراه.
      await this.assertNotLocked(tx, companyId, await this.findVisible(tx, allowedBranchIds, id));
      // ولا يُحرَّك الرصيدُ هنا كذلك (ق-٢٨٢): حذفُ سطرِ مطابقةٍ لا يمسّ الأستاذ.
      await tx.bankTransaction.delete({ where: { id } });
    });
  }
}
