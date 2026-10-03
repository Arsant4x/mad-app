import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { MSG } from '../common/i18n/messages';
import { assertBranchAllowed, branchFilter, ownBranchesFilter, requestedBranchFilter } from '../branches/branch-scope.util';
import { roundTo, round2 } from '../common/money/rounding';
import { money, moneyText, percent, qty } from '../common/money/text';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { dayEndOf, dayStartOf } from '../common/wall-clock.util';
import { writeOffReason } from '../common/writeoff-reasons';
import { LINE_ORDER } from '../common/document-lines.util';
import { deadlineView } from '../invoices/note-deadline.util';
import { DEFERRED_REVENUE_ACCOUNT_CODE } from '../journal/deferred-revenue-account.util';
import { DEBIT_NORMAL_TYPES } from '../journal/journal-posting.util';
import { AgingDto, LedgerDto, ReportRangeDto, StatementDto, TrialBalanceDto } from './dto/report-range.dto';
import { readLedger, sideOfAccountType } from './ledger.util';
import { customerExposure, RentReceivableRow } from './receivables-exposure.util';
import { DashboardCard } from './dashboard-cards';

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
  /** ضريبةُ المخرجات المستحقّة — التزامٌ لم يُسدَّد بعد (`ق-٩٢٥/③`). */
  { code: '2200', name: 'ضريبة القيمة المضافة المستحقة' },
];

/**
 * الإيرادُ المؤجَّل — التزامٌ ينشأ عند الاستحقاق ويُقبض قبل أن يُعترَف به: **كان ناقصاً من التدفّق
 * منذ بُني** (`ق-٩٢٣` — ثقبٌ قائم لا أثرٌ للاستحقاق). يُنشأ عند أوّل حاجة (`ق-٤٧١`) فغيابُه ليس
 * نقصاً في الدليل يُعلَن، بل صفرٌ صادق. ورمزُه من ملفّه وحده (`ق-٤٦٩`).
 */
const DEFERRED_REVENUE_CASH_FLOW_CODE = DEFERRED_REVENUE_ACCOUNT_CODE;

/**
 * 🔴 **القوائمُ المالية للمنشأة لمن يرى فروعَها كلَّها** (`ق-١٤٥٢` — بنصّ المالك: «**المركزُ المالي … ثغرةُ صلاحية**»).
 *
 * المعلَنُ على قائمة الدخل: «**ولا تُشتقّ قائمةُ دخلٍ من نصف دفتر**» — فالقوائمُ الثلاث (الدخلُ · المركزُ المالي · التدفّقُ النقديّ)
 * قوائمُ المنشأة الواحدة ولا تُرشَّح بفرع. **فكان مقيَّدٌ بفرعٍ يقرأ أرصدةَ الفروع كلِّها منها** (قِيس `200` للثلاث). والحكمُ من
 * المعلَن نفسِه: **لا تُعطى لمن لا يرى الفروعَ كلَّها**، والرفضُ يدلّ على ملخّص الفرع المقصور على فروعه (`branchSummary`).
 */
function assertWholeCompanyReader(allowedBranchIds: string[] | 'all'): void {
  if (allowedBranchIds !== 'all') throw new ForbiddenException(MSG.report_company_statement_whole_company);
}

/** Dates are compared day-to-day, so the time part is stripped: an installment
 * due today must not count as late because the clock says 14:00.
 * يومُ الآن بإزاحةٍ معلَنة لا بمنطقة العملية (`ق-١١٩٠`) — كان `new Date(y, m, d)` محلّياً. */
const startOfDay = (d: Date): Date => dayStartOf(d);

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
  // `today` بدايةُ يومٍ معلَن (`dayStartOf`) — فيومُه يُقرأ كما يُقرأ `@db.Date`: UTC حصراً (`ق-١١٩٠`).
  const todayIso = today.toISOString().slice(0, 10);

  const [agg] = await tx.$queryRaw<{ dueAmount: number; paidAmount: number; onTimeAmount: number; overdueCount: number }[]>`
    -- نسبةُ التحصيل تقرأ **المقبوضَ** لا حالةَ القسط (ق-١٠٤٠/٢): كانت تجمع مبلغَ كلِّ قسطٍ مختومٍ PAID
    -- كاملاً — فقسطٌ قُبض عُشرُه عُدّ محصَّلاً كلُّه. صار المقبوضُ على كلِّ قسطٍ (الصافي + الخصم)
    -- مسقوفاً بمبلغه، والمقبوضُ في وقته ما وقع بتاريخٍ لا يتجاوز الاستحقاق، والمتأخّرُ ما لم يُسدَّد
    -- كاملاً بعد حلوله — والجزئيُّ منها.
    SELECT
      COALESCE(SUM(i.amount), 0)::float8                                                   AS "dueAmount",
      COALESCE(SUM(LEAST(COALESCE(pp.settled, 0), i.amount)), 0)::float8                    AS "paidAmount",
      COALESCE(SUM(LEAST(COALESCE(pp."settledOnTime", 0), i.amount)), 0)::float8            AS "onTimeAmount",
      (COUNT(*) FILTER (WHERE i.status IN ('DUE', 'LATE', 'PARTIAL')))::int                 AS "overdueCount"
    FROM "contract_installments" i
    LEFT JOIN (
      SELECT p."installmentId",
             SUM(p."netAmount" + p.discount)                                                    AS settled,
             SUM(p."netAmount" + p.discount) FILTER (WHERE p.date <= ci."dueDate")               AS "settledOnTime"
      FROM "rent_payments" p
      JOIN "contract_installments" ci ON ci.id = p."installmentId"
      WHERE p."companyId" = ${companyId} AND p."installmentId" IS NOT NULL
      GROUP BY p."installmentId"
    ) pp ON pp."installmentId" = i.id
    WHERE i."companyId" = ${companyId}
      AND i.status <> 'CANCELLED'
      AND i."dueDate" <= ${todayIso}::date
  `;

  const pct = (part: number) => (agg.dueAmount === 0 ? 0 : Math.round((part / agg.dueAmount) * 1000) / 10);

  // ② المبالغُ نصّاً بخانتين والنِّسَبُ نصّاً بخانتين (`ق-١٢٣٥`) — والعدُّ رقمٌ كما هو.
  return {
    dueAmount: money(agg.dueAmount),
    paidAmount: money(agg.paidAmount),
    onTimeAmount: money(agg.onTimeAmount),
    collectedRate: percent(pct(agg.paidAmount)),
    onTimeRate: percent(pct(agg.onTimeAmount)),
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

/** حساب ذمم العملاء — مرجع مطابقة تقرير الأعمار، وحسابُ كشف حساب العميل. */
const RECEIVABLES_ACCOUNT = '1200';
/** حساب ذمم المورّدين — حسابُ كشف حساب المورّد (`postPartySettlementEntry` يرحّل عليه). */
const PAYABLES_ACCOUNT = '2100';

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
  /**
   * **الإيرادُ المؤجَّل — وما لم يمرّ به** (`ق-٤٦٨` · `ق-٤٧٣`).
   *
   * قسمان لا واحد:
   *
   *   ① **الالتزامُ القائم** بعقده وفترته — **فرصيدُ `2400` رقمٌ واحدٌ لا
   *      يقول ممّن تكوّن**، ومن يُسأل عن التزامه يحتاج تفصيله.
   *   ② **ودفعاتٌ بلا قسطٍ مرتبط** — **لا فترةَ خدمةٍ تُعرف لها، فاعتُرف بها
   *      إيراداً فوراً**. ⚠️ **وهذا شرطُ المالك**: «**فمن يقرأ إيرادَه يعرف كم
   *      منه لم يمرّ بالالتزام**» — **فحدٌّ يُعلَن في وثيقةٍ لا يُقرأ**.
   */
  /**
   * ⚠️ **الترشيحُ في القاعدة لا في العميل** (`ق-٧٠٦`): كان التقريرُ يحمّل **كلَّ** قسطٍ له فترةُ
   * خدمةٍ بعلاقاته الثلاث ليُرشَّح في JS إلى ما مؤجَّلُه موجب — **`22,872` قسطاً لتُخرج `4`**،
   * وزمنُ القاعدة `90–170 ms` من `2.3–7.4 s`: `≥ 94٪` في محرّك Prisma يبني الكائناتِ داخل نافذة
   * المعاملة (`ق-٧٠٤`)، **فيسقط بـ`500` عند مهلتها** — والمعاملةُ حاملةُ سياق العزل فلا تُزال ولا
   * تُطال (`ق-٧٠٥`). فالمحصَّلُ يُجمع والفرقُ يُرشَّح في `SQL` (كـ`collectionRate` أعلاه)، **ولا يصل
   * إلى العميل إلا ما سيُعرض**. عزلُ الصفوف يسري على الخام (الطبقةُ الثانية)، و`companyId` مقيَّدٌ
   * صراحةً (الطبقةُ الأولى).
   *
   * **والناتجُ يطابق ما كان رقماً رقماً** (شرطُ المالك): المبالغُ `DECIMAL(18,2)` فمجموعُها ودرجةُ
   * تقريبه هما ما كانا، ويُعاد الحسابُ نفسُه في JS على الصفوف العائدة (`round2` على المحصَّل ثم على
   * الفرق) — والترشيحُ في `HAVING` مُقدِّمةٌ لا بديل. ويحرسه `deferred-revenue.live.spec.ts`: يقارن
   * الناتجَ بالشكل القديم على أكبر منشأةٍ في القاعدة (`22,872` قسطاً على التطوير) ويثبت النسبةَ بالعكس.
   */
  deferredRevenue(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.$queryRaw<
        {
          contractNo: string;
          tenant: string;
          unitNo: string | null;
          serviceStart: Date;
          serviceEnd: Date;
          accrualBasis: 'ACCRUAL' | 'LEGACY_COLLECTED';
          collected: number;
          accrued: number;
          baseRecognized: number;
        }[]
      >`
        SELECT
          c.no                                            AS "contractNo",
          c.tenant                                        AS "tenant",
          u."unitNo"                                      AS "unitNo",
          i."serviceStart"                                AS "serviceStart",
          i."serviceEnd"                                  AS "serviceEnd",
          i."accrualBasis"                                AS "accrualBasis",
          COALESCE(SUM(p."baseNetAmount"), 0)::float8     AS "collected",
          i."baseAccruedNet"::float8                      AS "accrued",
          i."baseRecognized"::float8                      AS "baseRecognized"
        FROM "contract_installments" i
        JOIN "contracts" c ON c.id = i."contractId"
        LEFT JOIN "units" u ON u.id = c."unitId"
        LEFT JOIN "rent_payments" p ON p."installmentId" = i.id AND p."companyId" = ${companyId}
        WHERE i."companyId" = ${companyId}
          AND i."serviceStart" IS NOT NULL
          AND i."serviceEnd" IS NOT NULL
        GROUP BY i.id, c.id, u.id
        HAVING (CASE WHEN i."accrualBasis" = 'ACCRUAL' THEN i."baseAccruedNet" ELSE COALESCE(SUM(p."baseNetAmount"), 0) END) - i."baseRecognized" > 0
        ORDER BY i."dueDate" ASC, i.id ASC
      `;

      // الأساسُ (ق-٩٢٧/٢): المستحقُّ صافياً لقسطٍ على أساس الاستحقاق — فالالتزامُ ينشأ عند نقطة
      // الضريبة لا عند القبض (ق-٩١٧) — والمقبوضُ لما سبق البناء. والترشيحُ في القاعدة كما كان.
      const outstanding = rows
        .map((r) => {
          const collected = round2(r.collected);
          const accrued = round2(r.accrued);
          const basis = r.accrualBasis === 'ACCRUAL' ? accrued : collected;
          return {
            contractNo: r.contractNo,
            tenant: r.tenant,
            unitNo: r.unitNo ?? null,
            serviceStart: r.serviceStart,
            serviceEnd: r.serviceEnd,
            accrualBasis: r.accrualBasis,
            collected,
            accrued,
            recognized: round2(r.baseRecognized),
            // ما لم يخرج من الالتزام بعد — إيراداً كان أو ردّاً أو دخلاً آخر.
            deferred: round2(basis - r.baseRecognized),
          };
        })
        .filter((r) => r.deferred > 0);

      // ⚖️ ق-١٦٢٤: ما زاد على أقساط العقد كلِّها بعد الحكم رصيدٌ للمستأجر في `2450` لا إيراد، فلا يُسرد هنا مع ما اعتُرف به فوراً.
      const unlinkedRows = await tx.rentPayment.findMany({
        where: { installmentId: null, accruals: { none: { kind: 'TENANT_CREDIT' } } },
        select: {
          date: true,
          baseNetAmount: true,
          contract: { select: { no: true, tenant: true } },
        },
        orderBy: { date: 'desc' },
      });

      const unlinked = unlinkedRows.map((p) => ({
        date: p.date,
        contractNo: p.contract.no,
        tenant: p.contract.tenant,
        baseNetAmount: round2(Number(p.baseNetAmount)),
      }));

      // ② على الحدّ نصّاً بخانتين (`ق-١٢٣٥`) — والحسابُ والترشيحُ أعلاه رقم.
      return {
        outstanding: outstanding.map((r) => ({
          ...r,
          collected: money(r.collected),
          accrued: money(r.accrued),
          recognized: money(r.recognized),
          deferred: money(r.deferred),
        })),
        totalDeferred: money(outstanding.reduce((sum, r) => sum + r.deferred, 0)),
        unlinked: unlinked.map((p) => ({ ...p, baseNetAmount: money(p.baseNetAmount) })),
        totalUnlinked: money(unlinked.reduce((sum, r) => sum + r.baseNetAmount, 0)),
        /** ⚠️ **حدٌّ معلَن**: هذه اعتُرف بها إيراداً فوراً — **لا فترةَ خدمةٍ تُعرف لها**. */
        unlinkedNote: 'دفعات غير مرتبطة بأقساط: لا تُعرف لها فترة خدمة، فاعتُرف بها إيراداً فوراً ولم تمرّ بالإيراد المؤجَّل',
      };
    });
  }

  /**
   * ⚠️ **الصفوفُ مقصورةٌ على فروع القارئ** (`ق-٥١٧`): قائمةُ البنوك تحجب بنوكَ
   * الفروع الأخرى بأرصدتها — **وكان هذا التقريرُ يعرضها كلَّها بابًا جانبياً**.
   * وتاريخُ انفصال نقد البنوك (أدناه) يبقى على البنوك كلِّها عمداً — **فهو
   * واقعةٌ للمنشأة لا رصيدٌ يُقرأ**.
   */
  bankDifference(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const banks = await tx.bank.findMany({ where: { deletedAt: null, ...branchFilter(allowedBranchIds) }, orderBy: { name: 'asc' } });
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

      // ② الأرصدةُ والفرقُ نصّاً بخانتين على الحدّ (`ق-١٢٣٥`) — والعدُّ رقم.
      return {
        rows: rows.map((r) => ({
          ...r,
          ledgerBalance: money(r.ledgerBalance),
          shownBalance: money(r.shownBalance),
          difference: money(r.difference),
          unpostedSum: money(r.unpostedSum),
        })),
        totals: {
          ledgerBalance: money(rows.reduce((s, r) => s + r.ledgerBalance, 0)),
          shownBalance: money(rows.reduce((s, r) => s + r.shownBalance, 0)),
          difference: money(rows.reduce((s, r) => s + r.difference, 0)),
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
      // تُرشَّح عند القراءة لا بعدها (`ق-٥١٧`): كانت الأسطرُ تُقرأ كلُّها ثم
      // تُسقَط في الحلقة — والنتيجةُ واحدة، لكن المرشِّحَ في الاستعلام هو ما
      // يقرؤه الحارس، والصفوفُ المقروءةُ أقلّ.
      const lines = await tx.journalLine.findMany({
        where: { journalEntry: { ...branchFilter(allowedBranchIds), ...(date ? { date } : {}) } },
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

      // ② نصّاً بخانتين على الحدّ (`ق-١٢٣٥`) — `money()` يدوّر بسياسة المبلغ نفسِها (خانتان).
      const shape = (name: string, id: string | null, v: { revenue: number; expenses: number }) => ({
        branchId: id,
        branchName: name,
        revenue: money(v.revenue),
        expenses: money(v.expenses),
        netIncome: money(v.revenue - v.expenses),
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
          // denominator would flatter the number. ② نسبةٌ نصّاً بخانتين (`ق-١٢٣٥`).
          occupancyRate: percent(own.length === 0 ? 0 : Math.round((rented / own.length) * 1000) / 10),
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
          occupancyRate: percent(totalUnits === 0 ? 0 : Math.round((totalRented / totalUnits) * 1000) / 10),
        },
        collection,
        expiring: await expiringContracts(tx, today),
      };
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: قائمةُ الدخل قائمةُ المنشأة الواحدة من دفترٍ
   * واحد — **ولا تُشتقّ قائمةُ دخلٍ من نصف دفتر**؛ والفرعُ له تقريرُه المقصورُ
   * على فروع القارئ (`branchSummary`). و«هل ثمّة قيدٌ مرحَّل» سؤالٌ عن الدفتر كلِّه.
   */
  incomeStatement(companyId: string, allowedBranchIds: string[] | 'all', range: ReportRangeDto) {
    assertWholeCompanyReader(allowedBranchIds);
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

      // ② على الحدّ نصّاً بخانتين (`ق-١٢٣٥`) — والمجاميعُ تُجمع رقماً ثم تُدوَّر مرّةً في `money()`.
      const line = (a: { code: string; name: string; amount: number }) => ({ code: a.code, name: a.name, amount: money(a.amount) });
      return {
        from: range.from ?? null,
        to: range.to ?? null,
        revenue: revenue.map(line),
        totalRevenue: money(totalRevenue),
        expenses: expenses.map(line),
        totalExpenses: money(totalExpenses),
        netProfit: money(totalRevenue - totalExpenses),
        hasAnyPostedEntries: (await tx.journalEntry.count()) > 0,
      };
    });
  }

  /**
   * المركزُ المالي **بتاريخٍ ومن السطور** (`ق-١٢٧٩` · د/⑩A1 — `domain-scan/10` A1).
   *
   * **ما كان**: يقرأ `account.balance` — رقمٌ تراكميٌّ منذ التأسيس **بلا تاريخ**، فلا وجودَ لميزانيةٍ
   * «كما في ٣١ ديسمبر»؛ **ويهمل الإيراداتِ والمصروفات** فلا يتوازن أبداً بعد أوّل بيع (`balanced: false`
   * دائماً — والفجوةُ = صافي الربح حرفياً).
   *
   * **وما صار**: الأرصدةُ من `journal_lines` حتى `asOf` (الافتراضُ اليوم)، **وصافي نتيجة الفترة**
   * سطرٌ في حقوق الملكية — لأن الإيرادَ والمصروفَ حقوقُ ملكيةٍ لم تُقفل بعد. **وهو سطرٌ مؤقّت**:
   * حين تُبنى قيودُ الإقفال السنويّ يصير الترحيلُ إلى الأرباح المبقاة هو ما يحمله، ويُقاس حينها.
   *
   * ⚠️ **والتوازنُ يصير خاصيةً لا أملاً**: مجموعُ المدين = مجموعُ الدائن في القيد المزدوج، فما لم
   * يكن ثمّة سطرٌ بلا حساب، الفرقُ صفرٌ حتماً. فبقاءُ `balanced` **حارسٌ على الدفتر** لا تحذيرٌ
   * للتاجر: اختلالُه يعني سطراً على حسابٍ محذوف أو نوعاً خارج الخمسة.
   */
  balanceSheet(companyId: string, allowedBranchIds: string[] | 'all', range?: ReportRangeDto) {
    assertWholeCompanyReader(allowedBranchIds);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const accounts = await tx.account.findMany({ orderBy: { code: 'asc' } });
      // الأرصدةُ حتى التاريخ — لا فترةَ لها بداية: المركزُ المالي **رصيدٌ لا حركة**.
      const asOf = range?.to ? new Date(range.to) : null;
      const movements = await this.movementsByAccount(tx, { to: range?.to });
      const balanceOf = (a: { id: string; type: string }) => {
        const m = movements.get(a.id) ?? { debit: 0, credit: 0 };
        return DEBIT_NORMAL_TYPES.has(a.type) ? m.debit - m.credit : m.credit - m.debit;
      };
      const pick = (type: string) => accounts.filter((a) => a.type === type).map((a) => ({ code: a.code, name: a.name, amount: balanceOf(a) }));

      const assets = pick('asset');
      const liabilities = pick('liability');
      const equity = pick('equity');
      // نتيجةُ الفترة: إيرادٌ − مصروف حتى التاريخ نفسِه — حقوقُ ملكيةٍ لم تُقفل بعد.
      const periodResult = accounts.filter((a) => a.type === 'revenue').reduce((s, a) => s + balanceOf(a), 0)
        - accounts.filter((a) => a.type === 'expense').reduce((s, a) => s + balanceOf(a), 0);
      if (Math.abs(periodResult) >= 0.005) equity.push({ code: '—', name: 'نتيجة الفترة (قبل الإقفال)', amount: periodResult });
      const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
      const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);
      const totalEquity = equity.reduce((s, a) => s + a.amount, 0);

      // ② على الحدّ نصّاً بخانتين (`ق-١٢٣٥`) — والتوازنُ يُحكم على الرقم قبل التحويل.
      const line = (a: { code: string; name: string; amount: number }) => ({ code: a.code, name: a.name, amount: money(a.amount) });
      return {
        asOf: asOf ? asOf.toISOString().slice(0, 10) : null,
        assets: assets.map(line),
        totalAssets: money(totalAssets),
        liabilities: liabilities.map(line),
        equity: equity.map(line),
        totalLiabilitiesAndEquity: money(totalLiabilities + totalEquity),
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      };
    });
  }

  cashFlow(companyId: string, allowedBranchIds: string[] | 'all', range: ReportRangeDto) {
    assertWholeCompanyReader(allowedBranchIds);
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
      // الطريقةُ غيرُ المباشرة بالتزامَين (ق-٩٢٥/③): ما قُبض ولم يُعترَف به (`Δ2400`) وما استُحقّ من
      // ضريبةٍ ولم يُسدَّد (`Δ2200`) نقدٌ في اليد لم يمرّ بالربح — يُضاف كما يُضاف `Δ2100`.
      const deferredRevenueChange = changeFor(DEFERRED_REVENUE_CASH_FLOW_CODE);
      const outputVatChange = changeFor('2200');
      const operatingCashFlow = round2(netProfit - receivablesChange + payablesChange + deferredRevenueChange + outputVatChange);

      // ② على الحدّ نصّاً بخانتين (`ق-١٢٣٥`).
      return {
        netProfit: money(netProfit),
        receivablesChange: money(receivablesChange),
        payablesChange: money(payablesChange),
        deferredRevenueChange: money(deferredRevenueChange),
        outputVatChange: money(outputVatChange),
        operatingCashFlow: money(operatingCashFlow),
        fixedAssetChange: money(fixedAssetChange),
        netCashChange: money(operatingCashFlow - fixedAssetChange),
        missingAccounts: missing,
      };
    });
  }

  /**
   * **لوحةُ التحكّم — الشاشةُ تقرأ ولا تحسب** (`ق-١٢٤٣`، الحزمةُ الثانية من المراجعة الخارجية).
   *
   * كانت الشاشةُ تجمع بنفسها من قائمتَي الفواتير والمشتريات: **الإيرادُ شاملَ الضريبة** (إجماليُّ
   * الفاتورة لا صافيها)، **والذممُ تحسب المسدَّدَ جزئياً كاملاً** (فاتورةٌ غيرُ `PAID` بكامل إجماليها)،
   * والمصروفُ إجماليُّ الشراء بضريبته. فصار كلُّ رقمٍ من مصدره الذي تقرأ منه التقارير:
   * الإيرادُ والمصروفُ من الدفتر (حساباتُ الإيراد والمصروف في الفترة — كقائمة الدخل، والضريبةُ على
   * `2200` لا فيهما)، والذممُ من التخصيصات (`customerExposure` — مصدرُ الأعمار وحدِّ الائتمان)،
   * والسلسلةُ الشهرية من الدفتر نفسِه. وكلُّها نصٌّ بخانتين على الحدّ (`ق-١٢٣٥`).
   *
   * الفترةُ كما تفهمها بقيّةُ التقارير (`dateFilter`)؛ والسلسلةُ تنتهي بشهر `to` (أو اليوم) وتمتدّ
   * على أشهر الفترة (`1..24`) أو ستّةٍ حين لا بداية — كما كانت الشاشةُ ترسمها.
   *
   * ⚖️ **تحترم صلاحياتِ القارئ وشاشاتِه وفروعَه معاً** (توجيه ٢٧٥ · `ق-١٥٨٠`، بحكم صاحب المشروع، وهو يبدّل رفضَ توجيه ٢٧٤
   * للمقيَّد): البطاقةُ لا تُحسب ولا تُرسل إلا لمن يملك شاشتَها (`cards` من `DASHBOARD_CARD_SCREEN`، يحسبها المتحكّم)، وأرقامُ
   * المقيَّد **من فروعه وحدَها** (`ownBranchesFilter`): سطورُ قيودٍ فرعُها من فروعه، وفواتيرُ فروعه. فلا يدخلها ما بلا فرع
   * (رقمُ المنشأة، `ق-١٥٨١`) ولا الإيجارُ (العقودُ بلا فرع، `ق-٩٢٥/④`). والمالكُ ومن يرى الفروعَ كلَّها يقرأ الدفترَ كلَّه كما
   * كان. و`scope` يقول للشاشة أيَّهما قرأت.
   */
  dashboard(companyId: string, allowedBranchIds: string[] | 'all', range: ReportRangeDto, cards: ReadonlySet<DashboardCard>) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const ledger = cards.has('revenue') || cards.has('expenses') || cards.has('netProfit') || cards.has('monthly');
      const ownBranches = ownBranchesFilter(allowedBranchIds);
      const accounts = ledger ? await tx.account.findMany({ select: { id: true, type: true } }) : [];
      const movements = ledger ? await this.movementsByAccount(tx, range, ownBranches) : new Map<string, Movement>();
      const revenueIds = accounts.filter((a) => a.type === 'revenue').map((a) => a.id);
      const expenseIds = accounts.filter((a) => a.type === 'expense').map((a) => a.id);
      const totalRevenue = revenueIds.reduce((s, id) => s + this.periodAmount(movements, id, 'credit'), 0);
      const totalExpenses = expenseIds.reduce((s, id) => s + this.periodAmount(movements, id, 'debit'), 0);

      // السلسلةُ الشهرية: إيرادُ كلِّ شهرٍ من الدفتر — حاصلُ الدائن − المدين على حسابات الإيراد.
      const toDate = range.to ? new Date(range.to) : new Date();
      let monthsBack = 6;
      if (range.from) {
        const fromDate = new Date(range.from);
        monthsBack = Math.max(1, Math.min(24, (toDate.getUTCFullYear() - fromDate.getUTCFullYear()) * 12 + (toDate.getUTCMonth() - fromDate.getUTCMonth()) + 1));
      }
      const firstMonth = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() - (monthsBack - 1), 1));
      const seriesEnd = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      const lines = cards.has('monthly') && revenueIds.length
        ? await tx.journalLine.findMany({
            where: { accountId: { in: revenueIds }, journalEntry: { ...ownBranches, date: { gte: firstMonth, lte: seriesEnd } } },
            select: { debit: true, credit: true, journalEntry: { select: { date: true } } },
          })
        : [];
      const byMonth = new Map<string, number>();
      for (const l of lines) {
        const d = l.journalEntry.date;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + Number(l.credit) - Number(l.debit));
      }
      const monthly: { month: string; revenue: string }[] = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() - i, 1));
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        monthly.push({ month: key, revenue: money(byMonth.get(key) ?? 0) });
      }

      // الذممُ: تعرّضُ العملاء اليوم من التخصيصات — الفواتيرُ بمتبقّيها وأقساطُ الإيجار المستحقّة (`ق-٩٢٥/④`).
      // وللمقيَّد فواتيرُ فروعه وحدَها (`ownBranchesOnly`)؛ والإيجارُ بلا فرعٍ فلا يدخل رقمَه (`rentReceivables`).
      const exposure = cards.has('receivables') ? await customerExposure(tx, { asOf: dayEndOf(new Date()), allowedBranchIds, ownBranchesOnly: true }) : [];
      const receivables = exposure.reduce((s, r) => s + r.total, 0);

      // البطاقةُ التي لا يملك القارئُ شاشتَها لا تُرسل أصلاً — لا صفراً يُقرأ رقماً (`ق-١٥٨٠`).
      return {
        from: range.from ?? null,
        to: range.to ?? null,
        scope: allowedBranchIds === 'all' ? ('company' as const) : ('ownBranches' as const),
        ...(cards.has('revenue') ? { revenue: money(totalRevenue) } : {}),
        ...(cards.has('expenses') ? { expenses: money(totalExpenses) } : {}),
        ...(cards.has('netProfit') ? { netProfit: money(totalRevenue - totalExpenses) } : {}),
        ...(cards.has('receivables') ? { receivables: money(receivables) } : {}),
        ...(cards.has('monthly') ? { monthly } : {}),
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
  receivablesAging(companyId: string, allowedBranchIds: string[] | 'all', filter: AgingDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // تاريخ التقرير: كأي تقرير يقبل فترة — الافتراض اليوم. **وآخرُ لحظةٍ في يومٍ معلَن** لا
      // `setHours(23, 59, 59, 999)` بمنطقة العملية (`ق-١١٩٠`) — فالأعمارُ رقمٌ يقرؤه التاجر.
      const asOf = dayEndOf(filter.asOf ? new Date(filter.asOf) : new Date());

      // ⚠️ **المصدرُ الواحد لِـ«كم يدين لنا»** (`ق-٣٤١`): كان هذا التقريرُ يحسب
      //    المتبقّي بنفسه، **وحدُّ الائتمان كان سيصير رابعاً** — **وتاجرٌ يقرأ
      //    في الأعمار رقماً وفي رسالة المنع آخرَ يفقد الثقة في الاثنين**.
      //    **فاستُخرج الحسابُ إلى `receivables-exposure.util`، ويقرأ الاثنان منه.**
      // ⭐ صفَّان لا صفّ (ق-٩٢٥/④): الفواتيرُ وأقساطُ الإيجار المستحقّةُ غيرُ المقبوضة — كلاهما ذمّةٌ على
      // `1200`؛ والمطابقةُ على الاثنين، وإلا سمّى التقريرُ الحقيقةَ «فرقاً غير منسوب».
      const rent: RentReceivableRow[] = [];
      const result = await customerExposure(tx, { asOf, allowedBranchIds, branchId: filter.branchId, customerId: filter.customerId }, rent);
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
        /** منها ذممُ إيجارٍ (أقساطٌ استُحقّت ولم تُقبض) — مضمَّنةٌ في الشرائح والإجمالي أعلاه. */
        rent: round2(rent.reduce((t, r) => t + r.remaining, 0)),
      };

      // المطابقة عند الطلب فقط: مسحُ دفتر اليومية أثقل من التقرير نفسه،
      // فلا يُدفع ثمنه في كل تحميل (زر «طابق مع ميزان المراجعة»).
      const reconciliation = filter.reconcile ? await this.reconcileAgainstReceivables(tx, asOf, allowedBranchIds, filter.branchId, totals.total) : null;

      // ② على الحدّ نصّاً بخانتين (`ق-١٢٣٥`) — والشرائحُ والمطابقةُ تُحسب رقماً أعلاه (وحدُّ الائتمان يقرأ الرقمَ من المصدر نفسِه).
      const buckets = (r: { current: number; d1: number; d31: number; d61: number; d90: number; unapplied: number; total: number }) => ({
        current: money(r.current),
        d1: money(r.d1),
        d31: money(r.d31),
        d61: money(r.d61),
        d90: money(r.d90),
        unapplied: money(r.unapplied),
        total: money(r.total),
      });
      return {
        asOf: asOf.toISOString().slice(0, 10),
        branchId: filter.branchId ?? null,
        customerId: filter.customerId ?? null,
        rows: result.map((r) => ({ ...r, ...buckets(r) })),
        /** الصفُّ الثاني: قسطٌ قسطاً، بعمره من استحقاقه. */
        rentRows: rent.map((r) => ({ ...r, accrued: money(r.accrued), paid: money(r.paid), remaining: money(r.remaining) })),
        rentNote:
          allowedBranchIds === 'all' && !filter.branchId
            ? 'أقساطُ إيجارٍ استُحقّت ذمّةً على المستأجر ولم تُقبض — تدخل شرائح عميلها وإجماليَّه ومطابقةَ 1200'
            : 'ذممُ الإيجار على مستوى المنشأة لا الفرع — تظهر في التقرير المجمَّع وحده',
        totals: { ...buckets(totals), rent: money(totals.rent) },
        reconciliation: reconciliation
          ? {
              ...reconciliation,
              ledgerBalance: money(reconciliation.ledgerBalance),
              reportTotal: money(reconciliation.reportTotal),
              difference: money(reconciliation.difference),
            }
          : null,
      };
    });
  }

  /**
   * يقارن مجموع التقرير برصيد حساب الذمم 1200 حتى تاريخ التقرير.
   *
   * الفرق ليس خطأً يُخفى ولا يُجبَر: مصدره الطبيعي **قيدٌ يدوي على الذمم**
   * لا يقابله مستند. عرضه صراحةً يجعل المحاسب يعرف مصدره بدل أن يظن
   * التقرير خاطئاً.
   */
  private async reconcileAgainstReceivables(tx: Prisma.TransactionClient, asOf: Date, allowedBranchIds: string[] | 'all', branchId: string | undefined, reportTotal: number) {
    const account = await tx.account.findFirst({ where: { code: RECEIVABLES_ACCOUNT }, select: { id: true } });
    if (!account) return { ledgerBalance: 0, reportTotal, difference: round2(reportTotal * -1), accountMissing: true };

    // على نطاق التقرير نفسِه — وإلا قورن مجموعُ فروعٍ برصيد المنشأة فظهر فرقٌ كاذب.
    const agg = await tx.journalLine.aggregate({
      where: { accountId: account.id, journalEntry: { date: { lte: asOf }, ...requestedBranchFilter(allowedBranchIds, branchId) } },
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
  /**
   * **على مستوى المنشأة بحقّها**: ميزانُ المراجعة قائمةٌ من الدفتر كلِّه —
   * **وتوازنُه لا يُقاس على نصف دفتر**، فالقيدُ الواحد قد يمسّ فرعَين وما لا فرعَ
   * له. والفرعُ إن طُلب باسمه (`?branchId=`) **يُقاس على فروع القارئ قبل أن
   * يُرشَّح** — فلا يصير الميزانُ باباً جانبياً إلى فرعٍ محجوب (`ق-٥١٧`).
   *
   * 🔴 **وبلا فرعٍ مسمّى فهو ميزانُ المنشأة كلِّها**، فلا يُعطى إلا لمن يرى فروعَها كلَّها (`ق-١٤٥٢`): كان المقيَّدُ
   * يقرأ أرصدةَ الفروع كلِّها حين لا يسمّي فرعاً (توجيه ٢٧٤، نظيرُ لوحة التحكّم). ولا يُرشَّح بفروعه صامتاً، فميزانٌ
   * من نصف دفتر لا يُقرأ ميزاناً؛ والفرعُ المسمّى يبقى طريقَه.
   */
  trialBalance(companyId: string, allowedBranchIds: string[] | 'all', filter: TrialBalanceDto) {
    if (filter.branchId) assertBranchAllowed(allowedBranchIds, filter.branchId);
    else assertWholeCompanyReader(allowedBranchIds);
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
      // ② على الحدّ نصّاً بخانتين (`ق-١٢٣٥`) — والتوازنُ يُحكم على الرقم.
      return {
        from: filter.from ?? null,
        to: filter.to ?? null,
        branchId: filter.branchId ?? null,
        rows: rows.map((r) => ({
          ...r,
          debitTotal: money(r.debitTotal),
          creditTotal: money(r.creditTotal),
          balanceDebit: money(r.balanceDebit),
          balanceCredit: money(r.balanceCredit),
        })),
        totalDebit: money(totalDebit),
        totalCredit: money(totalCredit),
        totalBalanceDebit: money(rows.reduce((s2, r) => s2 + r.balanceDebit, 0)),
        totalBalanceCredit: money(rows.reduce((s2, r) => s2 + r.balanceCredit, 0)),
        /** عدم توازنه = عطب في القيود يستحق إنذاراً لا إخفاءً. */
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      };
    });
  }

  /**
   * **الأستاذُ العام** (`ق-١٢٦١` ج — `SPEC 10.16`): دفترُ حسابٍ واحد — أو بُعدٍ — على مدىً وفرع، برصيدٍ
   * افتتاحيٍّ قبل المدى ورصيدٍ جارٍ على كلِّ سطر ومصدرِ كلِّ قيد. المحرّكُ في `ledger.util.ts`؛ هنا التحقّقُ
   * من المرشِّح والفرع وقراءةُ الحساب ليُعرف طرفُه الطبيعيّ.
   */
  ledger(companyId: string, allowedBranchIds: string[] | 'all', filter: LedgerDto) {
    if (filter.branchId) assertBranchAllowed(allowedBranchIds, filter.branchId);
    if (!filter.accountId && !filter.propertyId && !filter.unitId) throw new BadRequestException(MSG.ledger_filter_required);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const account = filter.accountId
        ? await tx.account.findFirst({ where: { id: filter.accountId }, select: { id: true, code: true, name: true, type: true } })
        : null;
      if (filter.accountId && !account) throw new NotFoundException(MSG.account_not_found);
      // بُعدٌ بلا حساب: الرصيدُ على الطرف المدين (عقارٌ/وحدة تُقرأ إيراداً وذمّةً معاً — والقارئ يعرف طرفَه من الحساب على كل سطر).
      const side = account ? sideOfAccountType(account.type) : 'debit';
      const result = await readLedger(
        tx,
        {
          allowedBranchIds,
          accountId: filter.accountId,
          propertyId: filter.propertyId,
          unitId: filter.unitId,
          branchId: filter.branchId,
          from: filter.from ? new Date(filter.from) : undefined,
          to: filter.to ? new Date(filter.to) : undefined,
        },
        side,
      );
      return { account, from: filter.from ?? null, to: filter.to ?? null, branchId: filter.branchId ?? null, propertyId: filter.propertyId ?? null, unitId: filter.unitId ?? null, ...result };
    });
  }

  /**
   * **كشفُ حساب طرف** (`SPEC 4.2`): حركةُ **حساب ذمّة الطرف** (`1200` للعميل · `2100` للمورّد) التي تحمل بُعدَه —
   * برصيدٍ جارٍ على طرفه الطبيعيّ (العميلُ مدين · المورّدُ دائن) ومصدرِ كلِّ قيد. **لا كلُّ سطرٍ يحمل البُعد**:
   * قيدُ الفاتورة يختم العميلَ على سطور الإيراد والضريبة والذمّة معاً (`resolveDimensions`)، وكشفُ الحساب
   * بتعريفه المحاسبيّ حركةُ الذمّة وحدَها — وبها يطابق الأعمارَ وحدَّ الائتمان بالبناء.
   * ⚠️ **حدٌّ معلَن:** سطورُ الذمّة السابقة لموجة البُعد (`ق-٨٧٣`، بقي منها `44` بلا عميل على التطوير) لا
   * تظهر في الكشف لأنها بلا طرف — والأعمارُ تراها من التخصيصات؛ فرقُهما، إن كان، هو تلك السطور.
   */
  statement(companyId: string, allowedBranchIds: string[] | 'all', filter: StatementDto) {
    if (filter.branchId) assertBranchAllowed(allowedBranchIds, filter.branchId);
    if ((filter.customerId ? 1 : 0) + (filter.supplierId ? 1 : 0) !== 1) throw new BadRequestException(MSG.statement_party_required);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const party = filter.customerId
        ? await tx.customer.findFirst({ where: { id: filter.customerId }, select: { id: true, name: true } })
        : await tx.supplier.findFirst({ where: { id: filter.supplierId }, select: { id: true, name: true } });
      if (!party) throw new NotFoundException(filter.customerId ? MSG.customer_not_found : MSG.supplier_not_found);
      const control = await tx.account.findFirst({ where: { code: filter.customerId ? RECEIVABLES_ACCOUNT : PAYABLES_ACCOUNT }, select: { id: true, code: true, name: true, type: true } });
      if (!control) throw new NotFoundException(MSG.account_not_found);
      const side = filter.customerId ? 'debit' : 'credit';
      const result = await readLedger(
        tx,
        {
          allowedBranchIds,
          accountId: control.id,
          customerId: filter.customerId,
          supplierId: filter.supplierId,
          branchId: filter.branchId,
          from: filter.from ? new Date(filter.from) : undefined,
          to: filter.to ? new Date(filter.to) : undefined,
        },
        side,
      );
      return {
        party: { kind: filter.customerId ? 'customer' : 'supplier', id: party.id, name: party.name },
        account: control,
        from: filter.from ?? null,
        to: filter.to ?? null,
        branchId: filter.branchId ?? null,
        ...result,
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
  noteDeadlines(companyId: string, allowedBranchIds: string[] | 'all', range: ReportRangeDto, branchId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const date = this.dateFilter(range);
      const notes = await tx.invoice.findMany({
        where: {
          docType: { in: ['CREDIT_NOTE', 'DEBIT_NOTE'] },
          ...(date ? { issueDate: date } : {}),
          // الإشعاراتُ مستنداتٌ تحجبها قائمةُ الفواتير بالفرع — فلا يعرضها التقريرُ من بابٍ جانبيّ (`ق-٥١٧`).
          ...requestedBranchFilter(allowedBranchIds, branchId),
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
          // ② نصّاً بخانتين (`ق-١٢٣٥`).
          total: money(n.total),
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

  returns(companyId: string, allowedBranchIds: string[] | 'all', range: ReportRangeDto, branchId?: string) {
    // فرعٌ مطلوبٌ يُقاس على فروع القارئ، وبلا طلبٍ تُرشَّح بها — كالقائمة (`ق-٥١٧`).
    const scope = requestedBranchFilter(allowedBranchIds, branchId);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const date = this.dateFilter(range);
      const notes = await tx.invoice.findMany({
        where: { docType: 'CREDIT_NOTE', ...(date ? { issueDate: date } : {}), ...scope },
        include: {
          customer: { select: { name: true } },
          relatedInvoice: { select: { no: true } },
          lines: { ...LINE_ORDER, select: { id: true, description: true, quantity: true, unitPrice: true, returnsLineId: true, returnCondition: true } },
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
        where: { ...(date ? { occurredAt: date } : {}), ...scope },
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

      // ② على الحدّ: المبالغُ نصّاً بخانتين والكمّياتُ بثلاث (`ق-١٢٣٥`) — والعدُّ رقمٌ، وتكلفةُ الشطب المنتظِر `null` كما هي.
      return {
        from: range.from ?? null,
        to: range.to ?? null,
        branchId: branchId ?? null,
        rows: rows.map((r) => ({
          ...r,
          total: money(r.total),
          restockedQty: qty(r.restockedQty),
          restockedCost: money(r.restockedCost),
          refunded: money(r.refunded),
          lines: r.lines.map((l) => ({ ...l, quantity: qty(l.quantity), unitPrice: money(l.unitPrice), restockedQty: qty(l.restockedQty) })),
        })),
        writeOffs: writeOffs.map((w) => ({ ...w, qty: qty(w.qty), cost: moneyText(w.cost) })),
        totals: {
          count: rows.length,
          total: money(rows.reduce((s, r) => s + r.total, 0)),
          restockedQty: qty(rows.reduce((s, r) => s + r.restockedQty, 0)),
          restockedCost: money(rows.reduce((s, r) => s + r.restockedCost, 0)),
          refunded: money(rows.reduce((s, r) => s + r.refunded, 0)),
          damagedLines: rows.reduce((s, r) => s + r.damagedLines, 0),
          /** كم أتلفنا فعلاً — **مبلغاً من الدفتر**، وهو سؤال `SPEC 30.9`. */
          writtenOffCount: approved.length,
          writtenOffQty: qty(approved.reduce((s, w) => s + w.qty, 0)),
          writtenOffCost: money(approved.reduce((s, w) => s + (w.cost ?? 0), 0)),
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

  /**
   * **على مستوى المنشأة بحقّها**: حركةُ كلّ حسابٍ في الفترة تُغذّي القوائمَ
   * المالية (الدخل · المركز · التدفّق) — **وهي قوائمُ منشأةٍ لا فرع**: مركزٌ ماليٌّ
   * لنصف الفروع لا يتوازن، لأن حقوقَ الملكية والالتزاماتِ للمنشأة كلِّها.
   */
  /** `entryScope` يُضيّق القيودَ (فروعُ القارئ وحدَها في لوحة التحكم — `ق-١٥٨٠`)؛ وبلاه الدفترُ كلُّه كما تقرؤه القوائم. */
  private async movementsByAccount(tx: Prisma.TransactionClient, range: ReportRangeDto, entryScope: Prisma.JournalEntryWhereInput = {}): Promise<Map<string, Movement>> {
    const date = this.dateFilter(range);
    const entry: Prisma.JournalEntryWhereInput = { ...entryScope, ...(date ? { date } : {}) };

    const lines = await tx.journalLine.findMany({
      where: Object.keys(entry).length ? { journalEntry: entry } : undefined,
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
