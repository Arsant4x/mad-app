import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { DEBIT_NORMAL_TYPES } from '../journal/journal-posting.util';
import { ReportRangeDto, TrialBalanceDto } from './dto/report-range.dto';

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

/** Dates are compared day-to-day, so the time part is stripped: an installment
 * due today must not count as late because the clock says 14:00. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

interface InstallmentForCollection {
  status: string;
  dueDate: Date;
  amount: Prisma.Decimal;
  payments: { date: Date }[];
}

/**
 * On-time collection: of the rent that has actually fallen due, how much was
 * paid by its due date.
 *
 * Two deliberate exclusions. **Not-yet-due installments** are left out — a
 * landlord who has just issued next year's schedule is not at 8% collection.
 * **Cancelled ones** too: they were never owed.
 *
 * "On time" is judged by the *earliest* payment against the installment, since
 * a tenant who paid on the due date and topped up later still paid on time.
 */
function collectionRate(installments: InstallmentForCollection[], today: Date) {
  const due = installments.filter((i) => i.status !== 'CANCELLED' && startOfDay(i.dueDate) <= today);

  let dueAmount = 0;
  let paidAmount = 0;
  let onTimeAmount = 0;
  let lateCount = 0;

  for (const i of due) {
    const amount = Number(i.amount);
    dueAmount += amount;
    if (i.status !== 'PAID') {
      lateCount += 1;
      continue;
    }

    paidAmount += amount;
    const firstPayment = i.payments.reduce<Date | null>((min, p) => (min === null || p.date < min ? p.date : min), null);
    if (firstPayment && startOfDay(firstPayment) <= startOfDay(i.dueDate)) onTimeAmount += amount;
  }

  const pct = (part: number) => (dueAmount === 0 ? 0 : Math.round((part / dueAmount) * 1000) / 10);

  return {
    dueAmount: Math.round(dueAmount * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
    onTimeAmount: Math.round(onTimeAmount * 100) / 100,
    collectedRate: pct(paidAmount),
    onTimeRate: pct(onTimeAmount),
    /** Installments due and still unpaid — the follow-up list's length. */
    overdueCount: lateCount,
  };
}

/** Contracts ending within 30/60/90 days — the renewal pipeline. Buckets are
 * cumulative windows, so a lease ending in 20 days appears in all three; that
 * is what "expiring within 90 days" means to the person reading it. */
async function expiringContracts(tx: Prisma.TransactionClient, today: Date) {
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 90);

  const contracts = await tx.contract.findMany({
    where: { status: { notIn: ['CANCELLED', 'DRAFT'] }, end: { gte: today, lte: horizon } },
    orderBy: { end: 'asc' },
    select: {
      id: true,
      no: true,
      tenant: true,
      end: true,
      value: true,
      // A lease that already has a renewal is not part of the pipeline.
      renewedTo: { select: { id: true } },
      unit: { select: { unitNo: true, property: { select: { name: true } } } },
    },
  });

  const daysUntil = (d: Date) => Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  const pending = contracts.filter((c) => !c.renewedTo);

  return {
    within30: pending.filter((c) => daysUntil(c.end) <= 30).length,
    within60: pending.filter((c) => daysUntil(c.end) <= 60).length,
    within90: pending.length,
    /** Already renewed — shown so the number that *needs* action is not
     * mistaken for the number expiring. */
    alreadyRenewed: contracts.length - pending.length,
    contracts: pending.map((c) => ({
      id: c.id,
      no: c.no,
      tenant: c.tenant,
      end: c.end,
      value: c.value,
      daysLeft: daysUntil(c.end),
      unitNo: c.unit.unitNo,
      propertyName: c.unit.property.name,
    })),
  };
}

@Injectable()
export class ReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Revenue/expense per branch, plus a consolidated total — the owner's view
   * across the whole company (CLAUDE.md 6.8's "تقرير لكل فرع + مجمَّع للمالك").
   *
   * Built from the posted ledger rather than from invoices/purchases directly,
   * so it reflects the same numbers the financial statements do — which is
   * exactly why the auto-posted entry inherits its document's branch.
   *
   * Amounts are the **base-currency** figures: a branch trading in a second
   * currency must still roll up into one comparable total.
   */
  branchSummary(companyId: string, allowedBranchIds: string[] | 'all', range: ReportRangeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const [branches, accounts] = await Promise.all([
        tx.branch.findMany({
          where: allowedBranchIds === 'all' ? {} : { id: { in: allowedBranchIds } },
          orderBy: { name: 'asc' },
        }),
        tx.account.findMany({ select: { id: true, type: true } }),
      ]);
      const accountType = new Map(accounts.map((a) => [a.id, a.type]));

      const date = this.dateFilter(range);
      const lines = await tx.journalLine.findMany({
        where: date ? { journalEntry: { date } } : undefined,
        select: { accountId: true, debit: true, credit: true, journalEntry: { select: { branchId: true } } },
      });

      const empty = () => ({ revenue: 0, expenses: 0 });
      const byBranch = new Map<string, { revenue: number; expenses: number }>();
      const unassigned = empty();
      const total = empty();

      const visible = new Set(branches.map((b) => b.id));
      for (const b of branches) byBranch.set(b.id, empty());

      for (const line of lines) {
        const type = accountType.get(line.accountId);
        if (type !== 'revenue' && type !== 'expense') continue;

        const branchId = line.journalEntry.branchId;
        // A restricted employee must not see other branches' figures leak into
        // the consolidated total either — skip what they can't see.
        if (branchId && allowedBranchIds !== 'all' && !visible.has(branchId)) continue;

        // Revenue is credit-normal, expenses debit-normal (see DEBIT_NORMAL_TYPES).
        const amount = type === 'revenue' ? Number(line.credit) - Number(line.debit) : Number(line.debit) - Number(line.credit);
        const bucket = branchId ? byBranch.get(branchId) : unassigned;
        if (!bucket) continue;

        if (type === 'revenue') {
          bucket.revenue += amount;
          total.revenue += amount;
        } else {
          bucket.expenses += amount;
          total.expenses += amount;
        }
      }

      const round = (n: number) => Math.round(n * 100) / 100;
      const shape = (name: string, id: string | null, v: { revenue: number; expenses: number }) => ({
        branchId: id,
        branchName: name,
        revenue: round(v.revenue),
        expenses: round(v.expenses),
        netIncome: round(v.revenue - v.expenses),
      });

      return {
        branches: branches.map((b) => shape(b.name, b.id, byBranch.get(b.id)!)),
        // Kept as its own row rather than folded into a branch: company-wide
        // documents (and everything predating branches) genuinely belong to no
        // branch, and hiding them would make the rows not add up to the total.
        unassigned: shape('غير مسنَد لفرع', null, unassigned),
        consolidated: shape('الإجمالي المجمَّع', null, total),
      };
    });
  }

  /**
   * The three numbers a landlord actually runs the portfolio on: how full it
   * is, whether the rent arrives on time, and what is about to expire.
   *
   * Derived entirely from existing data — no new tables, and no stored
   * aggregates that could drift out of step with the rows they summarize.
   */
  propertyKpis(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const today = startOfDay(new Date());

      const [properties, units, activeContracts, activeReservations, installments] = await Promise.all([
        tx.property.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.unit.findMany({ select: { id: true, propertyId: true, underMaintenance: true } }),
        // "Occupied" means a live contract covering *today* — exactly the rule
        // UnitsService uses, so the map and this report can never disagree.
        tx.contract.findMany({
          where: { start: { lte: today }, end: { gte: today }, status: { not: 'CANCELLED' } },
          select: { unitId: true },
        }),
        tx.reservation.findMany({ where: { status: 'ACTIVE' }, select: { unitId: true } }),
        tx.installment.findMany({ select: { status: true, dueDate: true, amount: true, payments: { select: { date: true } } } }),
      ]);

      const rentedUnits = new Set(activeContracts.map((c) => c.unitId));
      const reservedUnits = new Set(activeReservations.map((r) => r.unitId));

      const occupancy = properties.map((p) => {
        const own = units.filter((u) => u.propertyId === p.id);
        const maintenance = own.filter((u) => u.underMaintenance).length;
        const rented = own.filter((u) => !u.underMaintenance && rentedUnits.has(u.id)).length;
        const reserved = own.filter((u) => !u.underMaintenance && !rentedUnits.has(u.id) && reservedUnits.has(u.id)).length;
        const vacant = own.length - maintenance - rented - reserved;

        return {
          propertyId: p.id,
          propertyName: p.name,
          total: own.length,
          rented,
          reserved,
          vacant,
          maintenance,
          // Against total units, not against lettable ones: a building half
          // under maintenance is genuinely half empty, and hiding that in the
          // denominator would flatter the number.
          occupancyRate: own.length === 0 ? 0 : Math.round((rented / own.length) * 1000) / 10,
        };
      });

      const totalUnits = units.length;
      const totalRented = units.filter((u) => !u.underMaintenance && rentedUnits.has(u.id)).length;

      return {
        occupancy,
        portfolio: {
          totalProperties: properties.length,
          totalUnits,
          rented: totalRented,
          occupancyRate: totalUnits === 0 ? 0 : Math.round((totalRented / totalUnits) * 1000) / 10,
        },
        collection: collectionRate(installments, today),
        expiring: await expiringContracts(tx, today),
      };
    });
  }

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

  /** Shared by every report so they all interpret the same range identically —
   * an empty range means "everything", not "nothing". */
  private dateFilter(range: ReportRangeDto): Prisma.DateTimeFilter | undefined {
    const date: Prisma.DateTimeFilter = {};
    if (range.from) date.gte = new Date(range.from);
    if (range.to) date.lte = new Date(range.to);
    return Object.keys(date).length ? date : undefined;
  }

  /**
   * ميزان المراجعة (احتياجات 10.4): لكل حساب تحرّك في الفترة — مجموع مدينه
   * ودائنه ورصيده على طرفه الطبيعي، والإجماليان متساويان حتماً (قيد مزدوج).
   * يقرأ من القيود الحقيقية لا من حالة موازية (قاعدة 11)، وبمرشّح فرع
   * اختياري (10.5) — غيابه = المجمَّع.
   */
  trialBalance(companyId: string, filter: TrialBalanceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const date = this.dateFilter(filter);
      const lines = await tx.journalLine.findMany({
        where: {
          journalEntry: {
            ...(date ? { date } : {}),
            ...(filter.branchId ? { branchId: filter.branchId } : {}),
          },
        },
        select: { accountId: true, debit: true, credit: true },
      });

      const byAccount = new Map<string, { debit: number; credit: number }>();
      for (const l of lines) {
        const cur = byAccount.get(l.accountId) ?? { debit: 0, credit: 0 };
        cur.debit += Number(l.debit);
        cur.credit += Number(l.credit);
        byAccount.set(l.accountId, cur);
      }

      const accounts = await tx.account.findMany({ where: { id: { in: [...byAccount.keys()] } }, orderBy: { code: 'asc' } });
      const rows = accounts.map((a) => {
        const m = byAccount.get(a.id)!;
        const net = m.debit - m.credit;
        return {
          code: a.code,
          name: a.name,
          debitTotal: Number(m.debit.toFixed(2)),
          creditTotal: Number(m.credit.toFixed(2)),
          balanceDebit: net > 0 ? Number(net.toFixed(2)) : 0,
          balanceCredit: net < 0 ? Number((-net).toFixed(2)) : 0,
        };
      });

      const totalDebit = Number(rows.reduce((s2, r) => s2 + r.debitTotal, 0).toFixed(2));
      const totalCredit = Number(rows.reduce((s2, r) => s2 + r.creditTotal, 0).toFixed(2));
      return {
        from: filter.from ?? null,
        to: filter.to ?? null,
        branchId: filter.branchId ?? null,
        rows,
        totalDebit,
        totalCredit,
        totalBalanceDebit: Number(rows.reduce((s2, r) => s2 + r.balanceDebit, 0).toFixed(2)),
        totalBalanceCredit: Number(rows.reduce((s2, r) => s2 + r.balanceCredit, 0).toFixed(2)),
        /** عدم توازنه = عطب في القيود يستحق إنذاراً لا إخفاءً. */
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      };
    });
  }

  private async movementsByAccount(tx: Prisma.TransactionClient, range: ReportRangeDto): Promise<Map<string, Movement>> {
    const date = this.dateFilter(range);

    const lines = await tx.journalLine.findMany({
      where: date ? { journalEntry: { date } } : undefined,
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
