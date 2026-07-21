import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { DEBIT_NORMAL_TYPES } from '../journal/journal-posting.util';
import { ReportRangeDto } from './dto/report-range.dto';

interface Movement {
  debit: number;
  credit: number;
}

/** Accounts needed for the cash-flow report's operating-activities section;
 * matches the mockup's `cfAccountsNeeded` exactly. Missing ones are reported
 * back (not silently dropped) so the UI can flag them, same as the mockup's
 * "⚠ الحسابات التالية غير موجودة" hint. */
const CASH_FLOW_ACCOUNTS = [
  { code: '1200', name: 'الذمم المدينة' },
  { code: '2100', name: 'الذمم الدائنة' },
  { code: '1400', name: 'الأصول الثابتة' },
];

@Injectable()
export class ReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  incomeStatement(companyId: string, range: ReportRangeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const accounts = await tx.account.findMany({ orderBy: { code: 'asc' } });
      const movements = await this.movementsByAccount(tx, range);

      const revenue = accounts
        .filter((a) => a.type === 'revenue')
        .map((a) => ({ code: a.code, name: a.name, amount: this.periodAmount(movements, a.id, 'credit') }));
      const expenses = accounts
        .filter((a) => a.type === 'expense')
        .map((a) => ({ code: a.code, name: a.name, amount: this.periodAmount(movements, a.id, 'debit') }));

      const totalRevenue = revenue.reduce((s, a) => s + a.amount, 0);
      const totalExpenses = expenses.reduce((s, a) => s + a.amount, 0);

      return {
        from: range.from ?? null,
        to: range.to ?? null,
        revenue,
        totalRevenue,
        expenses,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        hasAnyPostedEntries: (await tx.journalEntry.count()) > 0,
      };
    });
  }

  balanceSheet(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const accounts = await tx.account.findMany({ orderBy: { code: 'asc' } });
      const pick = (type: string) => accounts.filter((a) => a.type === type).map((a) => ({ code: a.code, name: a.name, amount: Number(a.balance) }));

      const assets = pick('asset');
      const liabilities = pick('liability');
      const equity = pick('equity');
      const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
      const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);
      const totalEquity = equity.reduce((s, a) => s + a.amount, 0);

      return {
        assets,
        totalAssets,
        liabilities,
        equity,
        totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      };
    });
  }

  cashFlow(companyId: string, range: ReportRangeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const accounts = await tx.account.findMany({ orderBy: { code: 'asc' } });
      const movements = await this.movementsByAccount(tx, range);

      const revenue = accounts.filter((a) => a.type === 'revenue');
      const expense = accounts.filter((a) => a.type === 'expense');
      const totalRevenue = revenue.reduce((s, a) => s + this.periodAmount(movements, a.id, 'credit'), 0);
      const totalExpenses = expense.reduce((s, a) => s + this.periodAmount(movements, a.id, 'debit'), 0);
      const netProfit = totalRevenue - totalExpenses;

      const byCode = new Map(accounts.map((a) => [a.code, a]));
      const missing = CASH_FLOW_ACCOUNTS.filter((c) => !byCode.has(c.code)).map((c) => c.name);
      const changeFor = (code: string) => {
        const account = byCode.get(code);
        if (!account) return 0;
        const m = movements.get(account.id) ?? { debit: 0, credit: 0 };
        return DEBIT_NORMAL_TYPES.has(account.type) ? m.debit - m.credit : m.credit - m.debit;
      };

      const receivablesChange = changeFor('1200');
      const payablesChange = changeFor('2100');
      const fixedAssetChange = changeFor('1400');
      const operatingCashFlow = netProfit - receivablesChange + payablesChange;

      return {
        netProfit,
        receivablesChange,
        payablesChange,
        operatingCashFlow,
        fixedAssetChange,
        netCashChange: operatingCashFlow - fixedAssetChange,
        missingAccounts: missing,
      };
    });
  }

  private async movementsByAccount(tx: Prisma.TransactionClient, range: ReportRangeDto): Promise<Map<string, Movement>> {
    const date: Prisma.DateTimeFilter = {};
    if (range.from) date.gte = new Date(range.from);
    if (range.to) date.lte = new Date(range.to);

    const lines = await tx.journalLine.findMany({
      where: Object.keys(date).length ? { journalEntry: { date } } : undefined,
      select: { accountId: true, debit: true, credit: true },
    });

    const map = new Map<string, Movement>();
    for (const line of lines) {
      const cur = map.get(line.accountId) ?? { debit: 0, credit: 0 };
      cur.debit += Number(line.debit);
      cur.credit += Number(line.credit);
      map.set(line.accountId, cur);
    }
    return map;
  }

  private periodAmount(movements: Map<string, Movement>, accountId: string, normalSide: 'debit' | 'credit'): number {
    const m = movements.get(accountId) ?? { debit: 0, credit: 0 };
    return normalSide === 'credit' ? m.credit - m.debit : m.debit - m.credit;
  }
}
