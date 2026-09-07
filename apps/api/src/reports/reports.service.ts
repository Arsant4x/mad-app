import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { roundTo, round2 } from '../common/money/rounding';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { writeOffReason } from '../common/writeoff-reasons';
import { deadlineView } from '../invoices/note-deadline.util';
import { DEBIT_NORMAL_TYPES } from '../journal/journal-posting.util';
import { AgingDto, ReportRangeDto, TrialBalanceDto } from './dto/report-range.dto';

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
 *
 * Aggregated in SQL, not by loading rows: at portfolio scale (tens of
 * thousands of installments) fetching every installment with its payments
 * relation took ~10s and blew the 5s tenant-transaction timeout — the same
 * failure mode as the contracts-list fix. RLS still applies (raw SQL is
 * exactly what layer 2 exists for), and `companyId` is bound explicitly as
 * layer 1. `todayIso` is a `YYYY-MM-DD` string so the comparison stays a pure
 * calendar-date one, matching the old startOfDay() semantics.
 */
async function collectionRate(tx: Prisma.TransactionClient, companyId: string, today: Date) {
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [agg] = await tx.$queryRaw<{ dueAmount: number; paidAmount: number; onTimeAmount: number; overdueCount: number }[]>`
    SELECT
      COALESCE(SUM(i.amount), 0)::float8                                  AS "dueAmount",
      COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'PAID'), 0)::float8 AS "paidAmount",
      COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'PAID' AND fp."firstDate" <= i."dueDate"), 0)::float8
                                                                          AS "onTimeAmount",
      (COUNT(*) FILTER (WHERE i.status <> 'PAID'))::int                   AS "overdueCount"
    FROM "contract_installments" i
    LEFT JOIN (
      SELECT p."installmentId", MIN(p.date) AS "firstDate"
      FROM "rent_payments" p
      WHERE p."companyId" = ${companyId} AND p."installmentId" IS NOT NULL
      GROUP BY p."installmentId"
    ) fp ON fp."installmentId" = i.id
    WHERE i."companyId" = ${companyId}
      AND i.status <> 'CANCELLED'
      AND i."dueDate" <= ${todayIso}::date
  `;

  const pct = (part: number) => (agg.dueAmount === 0 ? 0 : Math.round((part / agg.dueAmount) * 1000) / 10);

  return {
    dueAmount: round2(agg.dueAmount),
    paidAmount: round2(agg.paidAmount),
    onTimeAmount: round2(agg.onTimeAmount),
    collectedRate: pct(agg.paidAmount),
    onTimeRate: pct(agg.onTimeAmount),
    /** Installments due and still unpaid — the follow-up list's length. */
    overdueCount: agg.overdueCount,
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

/** حساب ذمم العملاء — مرجع مطابقة تقرير الأعمار. */
const RECEIVABLES_ACCOUNT = '1200';

@Injectable()
export class ReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * **تقريرُ الفرق** (`ق-٢٨٥/٣`) — «الرصيدُ الدفتريّ مقابل ما كان يُعرض،
   * **فينتقل التاجرُ بلا صدمة**».
   *
   * الحركةُ البنكية اليدوية **لم تعد تحرّك شيئاً** (`ق-٢٨١` · `ق-٢٨٥`)، وما
   * حرّكته **قبل ذلك باقٍ في العمود** — فرقمٌ في شاشة البنوك قد يفارق الأستاذ
   * بلا أن يعرف التاجرُ لماذا. **وهذا التقرير يُظهر الفرقَ ويسمّي سببَه.**
   *
   * ⚠️ **والسطرُ اليدويُّ يُعرَف بغياب `entryNo` لا بقيمة `source`**: `source`
   * حقلٌ **يكتبه المستخدم** (`CreateTransactionDto`)، فمن كتب فيه
   * `customer-payment` بيده كان سيسقط من العدّ صامتاً. **و`entryNo` يُكتب من
   * مسار الترحيل وحده** — فغيابُه يعني حرفياً «سطرٌ لا يعرفه الأستاذ»، وهو
   * **الدعوى نفسها** التي يقيسها التقرير.
   *
   * ⚠️ **وإعلانُ `ق-٢٨٣` يخرج من هنا**: «ما قبل تاريخ التحويل يشمل نقدَ
   * البنوك». **والتاريخُ مشتقٌّ لا مكتوب**: أوّلُ قيدٍ رُحِّل إلى حسابِ بنك
   * (`1100+`) هو اليومُ الذي انفصل فيه نقدُ البنوك عن `1000` **في بيانات هذه
   * المنشأة وحدها**. ولا شاشةَ باسم «تقرير الصندوق» في النظام اليوم، **وهذا
   * هو التقريرُ الذي يؤدّي غرضَها** — فالإعلانُ فيه لا في وثيقةٍ جانبية
   * (`ق-٢٧٥`).
   */
  bankDifference(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const banks = await tx.bank.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
      const accounts = await tx.account.findMany({
        where: { id: { in: banks.map((b) => b.accountId).filter(Boolean) as string[] } },
        select: { id: true, code: true, name: true, balance: true },
      });
      const accountById = new Map(accounts.map((a) => [a.id, a]));

      // أسطرٌ لا يعرفها الأستاذ — تُجمع بالبنك، ومجموعها هو تفسيرُ الفرق.
      const unposted = await tx.bankTransaction.groupBy({
        by: ['bankId'],
        where: { entryNo: null },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const unpostedByBank = new Map(unposted.map((u) => [u.bankId, u]));

      const rows = banks.map((bank) => {
        const account = accountById.get(bank.accountId);
        const ledger = round2(Number(account?.balance ?? 0));
        const shown = round2(Number(bank.balance));
        const u = unpostedByBank.get(bank.id);
        return {
          bankId: bank.id,
          bankName: bank.name,
          accountCode: account?.code ?? null,
          ledgerBalance: ledger,
          shownBalance: shown,
          difference: round2(shown - ledger),
          unpostedCount: u?._count._all ?? 0,
          unpostedSum: round2(Number(u?._sum.amount ?? 0)),
        };
      });

      // ⚠️ **الإعلانُ يقرأ البنوكَ كلَّها لا المعروضةَ منها**: بنكٌ حُذف
      // بقيت قيودُه في الأستاذ، **واليومُ الذي انفصل فيه نقدُ البنوك واقعةٌ
      // لا تُمحى بحذف صفّ**. والصفوفُ أعلاه تعرض القائمَ وحده — سؤالان
      // مختلفان على مجموعتين مختلفتين، عمداً.
      const everBankAccountIds = (await tx.bank.findMany({ select: { accountId: true } }))
        .map((b) => b.accountId)
        .filter(Boolean) as string[];
      const firstBankEntry = everBankAccountIds.length
        ? await tx.journalEntry.findFirst({
            where: { lines: { some: { accountId: { in: everBankAccountIds } } } },
            orderBy: { date: 'asc' },
            select: { date: true },
          })
        : null;

      return {
        rows,
        totals: {
          ledgerBalance: round2(rows.reduce((s, r) => s + r.ledgerBalance, 0)),
          shownBalance: round2(rows.reduce((s, r) => s + r.shownBalance, 0)),
          difference: round2(rows.reduce((s, r) => s + r.difference, 0)),
          unpostedCount: rows.reduce((s, r) => s + r.unpostedCount, 0),
        },
        /** `null` حين لا قيدَ على بنكٍ بعد — **فلا يُعلَن تاريخٌ لم يقع**. */
        bankCashSeparatedOn: firstBankEntry ? firstBankEntry.date.toISOString().slice(0, 10) : null,
      };
    });
  }

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

      const shape = (name: string, id: string | null, v: { revenue: number; expenses: number }) => ({
        branchId: id,
        branchName: name,
        revenue: roundTo(v.revenue, 'LINE_AMOUNT'),
        expenses: roundTo(v.expenses, 'LINE_AMOUNT'),
        netIncome: roundTo(v.revenue - v.expenses, 'LINE_AMOUNT'),
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

      const [properties, units, activeContracts, activeReservations, collection] = await Promise.all([
        tx.property.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.unit.findMany({ select: { id: true, propertyId: true, underMaintenance: true } }),
        // "Occupied" means a live contract covering *today* — exactly the rule
        // UnitsService uses, so the map and this report can never disagree.
        tx.contract.findMany({
          where: { start: { lte: today }, end: { gte: today }, status: { not: 'CANCELLED' } },
          select: { unitId: true },
        }),
        tx.reservation.findMany({ where: { status: 'ACTIVE' }, select: { unitId: true } }),
        collectionRate(tx, companyId, today),
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
        collection,
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
  /**
   * أعمار ذمم العملاء (4.6) — «مَن يدين لنا، بكم، ومنذ متى».
   *
   * **يقرأ من الحقيقة لا من حالة موازية (قاعدة 11):** متبقي كل فاتورة =
   * إجماليها − ما خُصِّص لها من سندات القبض − إشعاراتها الدائنة + إشعاراتها
   * المدينة. لا حقل «مدفوع» ولا حالة الفاتورة تدخل الحساب إطلاقاً.
   *
   * **العملات:** كل شيء بالعملة الأساسية **بسعر الفاتورة** — وهو السعر
   * الوحيد المتسق مع الدفتر: قيد الفاتورة رحّل baseTotal على 1200، وقيد
   * التحصيل خفّضه بمبلغ التخصيص × سعر الفاتورة، وفرق الصرف ذهب إلى 5600
   * لا إلى الذمم. فالمطابقة تصحّ رياضياً لا بالمصادفة.
   *
   * **الأرصدة غير المنسوبة:** دفعة على الحساب أو إشعار دائن بلا فاتورة
   * يخفّضان 1200 دون أن ينتميا لعمرٍ ما — فيظهران في عمود مستقل يُطرح من
   * إجمالي العميل، لا يُحشران في شريحة كذباً.
   */
  receivablesAging(companyId: string, filter: AgingDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // تاريخ التقرير: كأي تقرير يقبل فترة — الافتراض اليوم.
      const asOf = filter.asOf ? new Date(filter.asOf) : new Date();
      asOf.setHours(23, 59, 59, 999);

      const branchWhere = filter.branchId ? { branchId: filter.branchId } : {};
      const customerWhere = filter.customerId ? { customerId: filter.customerId } : {};

      // كل مستندات الذمم حتى تاريخ التقرير: الفواتير وإشعاراتها معاً —
      // فالإشعار يعدّل ذمّة فاتورته لا ذمّةً مستقلة.
      const documents = await tx.invoice.findMany({
        where: { issueDate: { lte: asOf }, ...branchWhere, ...customerWhere },
        select: {
          id: true,
          no: true,
          docType: true,
          relatedInvoiceId: true,
          customerId: true,
          customer: { select: { id: true, name: true } },
          issueDate: true,
          dueDate: true,
          total: true,
          baseTotal: true,
          exchangeRate: true,
          currency: true,
        },
      });

      const invoices = documents.filter((d) => d.docType === 'INVOICE');
      const notes = documents.filter((d) => d.docType !== 'INVOICE');

      // تخصيصات السندات حتى التاريخ — بمبلغ المستند، يُترجم بسعر فاتورته.
      const allocations = await tx.paymentAllocation.groupBy({
        by: ['invoiceId'],
        where: { payment: { date: { lte: asOf } } },
        _sum: { amount: true },
      });
      const allocByInvoice = new Map(allocations.map((a) => [a.invoiceId, Number(a._sum.amount ?? 0)]));

      // إشعارات منسوبة لفواتيرها، وأخرى بلا فاتورة (تُطرح من رصيد عميلها).
      const noteAdjustment = new Map<string, number>();
      const unappliedByCustomer = new Map<string, number>();
      for (const n of notes) {
        const base = Number(n.baseTotal);
        const signed = n.docType === 'CREDIT_NOTE' ? -base : base;
        if (n.relatedInvoiceId) noteAdjustment.set(n.relatedInvoiceId, (noteAdjustment.get(n.relatedInvoiceId) ?? 0) + signed);
        else unappliedByCustomer.set(n.customerId, (unappliedByCustomer.get(n.customerId) ?? 0) + signed);
      }

      // دفعات لم تُخصَّص: خفّضت 1200 بلا فاتورة تنتمي إليها.
      const payments = await tx.payment.findMany({
        where: { date: { lte: asOf }, ...branchWhere, ...customerWhere },
        select: { customerId: true, amount: true, exchangeRate: true, allocations: { select: { amount: true } } },
      });
      for (const p of payments) {
        const allocated = p.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
        const onAccount = Number(p.amount) - allocated;
        if (Math.abs(onAccount) > 0.005) {
          unappliedByCustomer.set(p.customerId, (unappliedByCustomer.get(p.customerId) ?? 0) - onAccount * Number(p.exchangeRate));
        }
      }

      const buckets = () => ({ current: 0, d1: 0, d31: 0, d61: 0, d90: 0 });
      const rows = new Map<string, { customerId: string; customerName: string; current: number; d1: number; d31: number; d61: number; d90: number; unapplied: number; total: number }>();
      const rowFor = (customerId: string, customerName: string) => {
        let r = rows.get(customerId);
        if (!r) {
          r = { customerId, customerName, ...buckets(), unapplied: 0, total: 0 };
          rows.set(customerId, r);
        }
        return r;
      };

      for (const inv of invoices) {
        const rate = Number(inv.exchangeRate);
        const allocatedBase = (allocByInvoice.get(inv.id) ?? 0) * rate;
        const remaining = round2(Number(inv.baseTotal) - allocatedBase + (noteAdjustment.get(inv.id) ?? 0));
        // المسدَّدة كاملاً تُستبعد؛ والجزئية تدخل بمتبقيها وحده.
        if (Math.abs(remaining) < 0.005) continue;

        const r = rowFor(inv.customerId, inv.customer.name);
        // العمر من الاستحقاق إلى تاريخ التقرير — لا من اليوم دائماً.
        const days = Math.floor((asOf.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
        if (days <= 0) r.current += remaining;
        else if (days <= 30) r.d1 += remaining;
        else if (days <= 60) r.d31 += remaining;
        else if (days <= 90) r.d61 += remaining;
        else r.d90 += remaining;
      }

      for (const [customerId, amount] of unappliedByCustomer) {
        if (Math.abs(amount) < 0.005) continue;
        const customer = documents.find((d) => d.customerId === customerId)?.customer ?? (await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } }));
        if (!customer) continue;
        rowFor(customerId, customer.name).unapplied += amount;
      }

      const result = [...rows.values()].map((r) => ({
        ...r,
        current: round2(r.current),
        d1: round2(r.d1),
        d31: round2(r.d31),
        d61: round2(r.d61),
        d90: round2(r.d90),
        unapplied: round2(r.unapplied),
        total: round2(r.current + r.d1 + r.d31 + r.d61 + r.d90 + r.unapplied),
      }));
      result.sort((a, b) => b.total - a.total);

      const sum = (pick: (r: (typeof result)[number]) => number) => round2(result.reduce((t, r) => t + pick(r), 0));
      const totals = {
        current: sum((r) => r.current),
        d1: sum((r) => r.d1),
        d31: sum((r) => r.d31),
        d61: sum((r) => r.d61),
        d90: sum((r) => r.d90),
        unapplied: sum((r) => r.unapplied),
        total: sum((r) => r.total),
      };

      // المطابقة عند الطلب فقط: مسحُ دفتر اليومية أثقل من التقرير نفسه،
      // فلا يُدفع ثمنه في كل تحميل (زر «طابق مع ميزان المراجعة»).
      const reconciliation = filter.reconcile ? await this.reconcileAgainstReceivables(tx, asOf, filter.branchId, totals.total) : null;

      return { asOf: asOf.toISOString().slice(0, 10), branchId: filter.branchId ?? null, customerId: filter.customerId ?? null, rows: result, totals, reconciliation };
    });
  }

  /**
   * يقارن مجموع التقرير برصيد حساب الذمم 1200 حتى تاريخ التقرير.
   *
   * الفرق ليس خطأً يُخفى ولا يُجبَر: مصدره الطبيعي **قيدٌ يدوي على الذمم**
   * لا يقابله مستند. عرضه صراحةً يجعل المحاسب يعرف مصدره بدل أن يظن
   * التقرير خاطئاً.
   */
  private async reconcileAgainstReceivables(tx: Prisma.TransactionClient, asOf: Date, branchId: string | undefined, reportTotal: number) {
    const account = await tx.account.findFirst({ where: { code: RECEIVABLES_ACCOUNT }, select: { id: true } });
    if (!account) return { ledgerBalance: 0, reportTotal, difference: round2(reportTotal * -1), accountMissing: true };

    const agg = await tx.journalLine.aggregate({
      where: { accountId: account.id, journalEntry: { date: { lte: asOf }, ...(branchId ? { branchId } : {}) } },
      _sum: { debit: true, credit: true },
    });
    const ledgerBalance = round2(Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
    return {
      ledgerBalance,
      reportTotal,
      /** موجب = الدفتر أكبر من التقرير (قيود يدوية على الذمم). */
      difference: round2(ledgerBalance - reportTotal),
      accountMissing: false,
    };
  }
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
          debitTotal: round2(m.debit),
          creditTotal: round2(m.credit),
          balanceDebit: net > 0 ? round2(net) : 0,
          balanceCredit: net < 0 ? round2(-net) : 0,
        };
      });

      const totalDebit = round2(rows.reduce((s2, r) => s2 + r.debitTotal, 0));
      const totalCredit = round2(rows.reduce((s2, r) => s2 + r.creditTotal, 0));
      return {
        from: filter.from ?? null,
        to: filter.to ?? null,
        branchId: filter.branchId ?? null,
        rows,
        totalDebit,
        totalCredit,
        totalBalanceDebit: round2(rows.reduce((s2, r) => s2 + r.balanceDebit, 0)),
        totalBalanceCredit: round2(rows.reduce((s2, r) => s2 + r.balanceCredit, 0)),
        /** عدم توازنه = عطب في القيود يستحق إنذاراً لا إخفاءً. */
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      };
    });
  }

  /**
   * تقرير المرتجعات (`SPEC 30.9`، موجة أ 2026-09-03): **كم أُرجع · وكم عاد إلى الرفّ وبأي تكلفة ·
   * وكم رُدّ نقداً · ومن سجّله.**
   *
   * كل رقمٍ مشتقّ: الإشعارات الدائنة في المدى، وحركاتُ `IN/SALE` المربوطة بسطورها (ما عاد فعلاً)،
   * وسنداتُ `REFUND` المربوطة بها، والفاعلُ من سجل التدقيق لا من حقلٍ على المستند. **عمودُ التلف
   * محفوظٌ بحالة السطر** (`DAMAGED`/`REPAIRABLE`) ولا مصروفَ له بعد — معلَّقٌ على بحث الضريبة.
   */
  /**
   * مهل الإشعارات (`م٥٤`) — **ما لا يُرى لا يُصدَر** (قرار المالك 2026-09-04).
   *
   * المهلة **تنبيهٌ لا حجز**: الإشعار مستندٌ يوجبه النظام، فحجبُه بعد انقضائها
   * يزيد المخالفة لا يمنعها. فيُعرَض المتأخّر بوسمه، والمقترب قبل انقضائه.
   *
   * ⚠️ **وحدُّ هذا التقرير معلَن**: يقيس الإشعارات **الصادرة** — أي «هل صدر هذا
   * في موعده». والنصف الآخر — **واقعةُ إعادةٍ قُبلت ولم يصدر لها إشعارٌ بعد** —
   * لا يُقاس اليوم لأن الواقعة **لا تُسجَّل كياناً مستقلاً**؛ وبناؤه مسارٌ جديد
   * يُنشئ مستنداً، وهو **موقوفٌ على حسم `ق-٣٩`** (ناقل الأحداث).
   */
  noteDeadlines(companyId: string, range: ReportRangeDto, branchId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const date = this.dateFilter(range);
      const notes = await tx.invoice.findMany({
        where: {
          docType: { in: ['CREDIT_NOTE', 'DEBIT_NOTE'] },
          ...(date ? { issueDate: date } : {}),
          ...(branchId ? { branchId } : {}),
        },
        select: {
          id: true,
          no: true,
          docType: true,
          issueDate: true,
          adjustmentEventDate: true,
          adjustmentReason: true,
          total: true,
          customer: { select: { name: true } },
          relatedInvoice: { select: { no: true } },
        },
        orderBy: { issueDate: 'asc' },
      });

      const rows = notes.map((n) => {
        // فارغٌ ⇒ الواقعة يوم الإصدار: إشعارٌ كُتب قبل وجود الحقل، ولا يُخمَّن له
        // تاريخٌ رجعيّ — فيقرأ «في الموعد» لأنه لا دليل على غيره، **وهذا معلَن**.
        const eventDate = n.adjustmentEventDate ?? n.issueDate;
        const view = deadlineView(eventDate, n.issueDate);
        return {
          id: n.id,
          no: n.no,
          docType: n.docType,
          customer: n.customer?.name ?? null,
          relatedInvoiceNo: n.relatedInvoice?.no ?? null,
          reason: n.adjustmentReason,
          total: Number(n.total),
          eventDate: view.eventDate,
          eventDateKnown: n.adjustmentEventDate !== null,
          issueDate: n.issueDate,
          deadline: view.deadline,
          daysLeft: view.daysLeft,
          status: view.status,
        };
      });

      return {
        rows,
        totals: {
          count: rows.length,
          late: rows.filter((r) => r.status === 'LATE').length,
          dueSoon: rows.filter((r) => r.status === 'DUE_SOON').length,
          eventDateUnknown: rows.filter((r) => !r.eventDateKnown).length,
        },
      };
    });
  }

  returns(companyId: string, range: ReportRangeDto, branchId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const date = this.dateFilter(range);
      const notes = await tx.invoice.findMany({
        where: { docType: 'CREDIT_NOTE', ...(date ? { issueDate: date } : {}), ...(branchId ? { branchId } : {}) },
        include: {
          customer: { select: { name: true } },
          relatedInvoice: { select: { no: true } },
          lines: { select: { id: true, description: true, quantity: true, unitPrice: true, returnsLineId: true, returnCondition: true } },
        },
        orderBy: { issueDate: 'asc' },
      });
      const noteIds = notes.map((n) => n.id);
      const lineIds = notes.flatMap((n) => n.lines.map((l) => l.id));

      const restockMoves = lineIds.length
        ? await tx.stockMovement.findMany({ where: { type: 'IN', origin: 'SALE', invoiceLineId: { in: lineIds } }, select: { invoiceLineId: true, qty: true, consumptions: { select: { qty: true, unitCost: true } } } })
        : [];
      const restockedByLine = new Map<string, { qty: number; cost: number }>();
      for (const m of restockMoves) {
        const cur = restockedByLine.get(m.invoiceLineId!) ?? { qty: 0, cost: 0 };
        cur.qty = roundTo(cur.qty + Number(m.qty), 'DERIVED_QUANTITY');
        restockedByLine.set(m.invoiceLineId!, cur);
      }
      // تكلفة ما عاد: قيدُ عكس التكلفة على الإشعار (مذكّرته تسمّيه) — من الدفتر لا من تقدير.
      const reversalEntries = noteIds.length
        ? await tx.journalEntry.findMany({ where: { memo: { in: notes.map((n) => `عكس تكلفة مبيعات — مرتجع ${n.no}`) } }, select: { memo: true, lines: { select: { debit: true } } } })
        : [];
      const reversedCostByNo = new Map(reversalEntries.map((e) => [e.memo, round2(e.lines.reduce((s, l) => s + Number(l.debit), 0))]));

      const refunds = noteIds.length
        ? await tx.payment.groupBy({ by: ['refundsInvoiceId'], where: { kind: 'REFUND', refundsInvoiceId: { in: noteIds } }, _sum: { amount: true } })
        : [];
      const refundedByNote = new Map(refunds.map((r) => [r.refundsInvoiceId!, round2(-Number(r._sum.amount ?? 0))]));

      const actors = noteIds.length
        ? await tx.auditLog.findMany({ where: { entity: 'invoices', entityId: { in: noteIds } }, select: { entityId: true, actorName: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
        : [];
      const actorByNote = new Map<string, string>();
      for (const a of actors) if (a.entityId && !actorByNote.has(a.entityId)) actorByNote.set(a.entityId, a.actorName);

      const rows = notes.map((n) => {
        const lines = n.lines.map((l) => {
          const back = restockedByLine.get(l.id);
          return {
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            condition: l.returnCondition ?? (l.returnsLineId ? 'GOOD' : null),
            linkedToSale: l.returnsLineId !== null,
            restockedQty: back?.qty ?? 0,
          };
        });
        return {
          id: n.id,
          no: n.no,
          date: n.issueDate,
          customerName: n.customer.name,
          invoiceNo: n.relatedInvoice?.no ?? null,
          reason: n.adjustmentReason,
          total: Number(n.total),
          restockedQty: roundTo(lines.reduce((s, l) => s + l.restockedQty, 0), 'DERIVED_QUANTITY'),
          restockedCost: reversedCostByNo.get(`عكس تكلفة مبيعات — مرتجع ${n.no}`) ?? 0,
          damagedLines: lines.filter((l) => l.condition === 'DAMAGED').length,
          repairableLines: lines.filter((l) => l.condition === 'REPAIRABLE').length,
          refunded: refundedByNote.get(n.id) ?? 0,
          recordedBy: actorByNote.get(n.id) ?? null,
          lines,
        };
      });

      /**
       * ⭐ **واقعات الشطب — بمصروفها لا بحالتها** (`SPEC 30.9`).
       *
       * كان عمود التلف يُعدّ **أسطراً موسومة** لأن الشطب لم يكن كياناً بعد.
       * والآن له تكلفةٌ من الطبقات وقيدٌ في الدفتر، **فيُقرأ المبلغ لا العدّ**.
       *
       * ⚠️ **وعمود «سجّل = اعتمد» صريحٌ لا مستنتَج** (`ق-١٤٣`): الاعتماد الذاتي
       * مسموحٌ افتراضياً — **فوجب أن يراه المالك بلا أن يقارن حقلين في كل صفّ**.
       */
      const writeOffRows = await tx.inventoryWriteOff.findMany({
        where: { ...(date ? { occurredAt: date } : {}), ...(branchId ? { branchId } : {}) },
        include: { product: { select: { name: true } }, warehouse: { select: { name: true } } },
        orderBy: [{ occurredAt: 'asc' }, { no: 'asc' }],
      });
      const actorNames = await this.actorNames(tx, companyId, writeOffRows.flatMap((w) => [w.recordedById, w.reviewedById]));

      const writeOffs = writeOffRows.map((w) => ({
        id: w.id,
        no: w.no,
        date: w.occurredAt,
        product: w.product.name,
        warehouse: w.warehouse.name,
        qty: Number(w.qty),
        reasonCode: w.reasonCode,
        reason: writeOffReason(w.reasonCode)?.label ?? w.reasonCode,
        status: w.status,
        cost: w.baseCost === null ? null : Number(w.baseCost),
        recordedBy: actorNames.get(w.recordedById) ?? null,
        reviewedBy: w.reviewedById ? (actorNames.get(w.reviewedById) ?? null) : null,
        /** 🔴 **سجّل = اعتمد** — والمعتمَدة وحدها تحمله؛ المنتظِرة لم تُحسم بعد. */
        selfApproved: w.status === 'APPROVED' && w.reviewedById !== null && w.reviewedById === w.recordedById,
      }));
      const approved = writeOffs.filter((w) => w.status === 'APPROVED');

      return {
        from: range.from ?? null,
        to: range.to ?? null,
        branchId: branchId ?? null,
        rows,
        writeOffs,
        totals: {
          count: rows.length,
          total: round2(rows.reduce((s, r) => s + r.total, 0)),
          restockedQty: roundTo(rows.reduce((s, r) => s + r.restockedQty, 0), 'DERIVED_QUANTITY'),
          restockedCost: round2(rows.reduce((s, r) => s + r.restockedCost, 0)),
          refunded: round2(rows.reduce((s, r) => s + r.refunded, 0)),
          damagedLines: rows.reduce((s, r) => s + r.damagedLines, 0),
          /** كم أتلفنا فعلاً — **مبلغاً من الدفتر**، وهو سؤال `SPEC 30.9`. */
          writtenOffCount: approved.length,
          writtenOffQty: roundTo(approved.reduce((s, w) => s + w.qty, 0), 'DERIVED_QUANTITY'),
          writtenOffCost: round2(approved.reduce((s, w) => s + (w.cost ?? 0), 0)),
          pendingWriteOffs: writeOffs.filter((w) => w.status === 'PENDING_REVIEW').length,
          /** 🔴 كم واقعةً اعتمدها من سجّلها — **رقمٌ يُقرأ لا يُستنتج**. */
          selfApprovedWriteOffs: writeOffs.filter((w) => w.selfApproved).length,
        },
      };
    });
  }

  /**
   * أسماء الفاعلين من معرّفاتهم — **والمالك معرّفه هو معرّف المنشأة**.
   *
   * (`profileId` للمالك = `company.id`، وللموظّف = `companyUser.id`. وخلطُهما
   * كان سيُظهر «غير معروف» للمالك في كل صفّ — وهو أكثر من يعتمد.)
   */
  private async actorNames(tx: Prisma.TransactionClient, companyId: string, ids: (string | null)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    const out = new Map<string, string>();
    if (!wanted.length) return out;

    const users = await tx.companyUser.findMany({ where: { companyId, id: { in: wanted } }, select: { id: true, name: true } });
    for (const u of users) out.set(u.id, u.name);

    if (wanted.includes(companyId)) {
      const company = await tx.company.findUnique({ where: { id: companyId }, select: { orgName: true } });
      out.set(companyId, company?.orgName ?? 'مالك المنشأة');
    }
    return out;
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
