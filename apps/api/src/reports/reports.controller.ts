import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AgingDto, LedgerDto, ReportRangeDto, StatementDto, TrialBalanceDto } from './dto/report-range.dto';
import { buildCsv } from '../common/csv.util';
import type { LedgerRow } from './ledger.util';
import { ReportsService } from './reports.service';

/** أعمدةُ الأستاذ وكشف الحساب في التصدير — واحدةٌ للاثنين لأن المحرّكَ واحد. */
const LEDGER_CSV_COLUMNS = [
  { label: 'التاريخ', value: (r: LedgerRow) => r.date },
  { label: 'رقم القيد', value: (r: LedgerRow) => r.entryNo },
  { label: 'البيان', value: (r: LedgerRow) => r.memo },
  { label: 'رمز الحساب', value: (r: LedgerRow) => r.accountCode },
  { label: 'اسم الحساب', value: (r: LedgerRow) => r.accountName },
  { label: 'مدين', value: (r: LedgerRow) => r.debit },
  { label: 'دائن', value: (r: LedgerRow) => r.credit },
  { label: 'الرصيد', value: (r: LedgerRow) => r.balance },
  { label: 'المصدر', value: (r: LedgerRow) => r.source.type },
  { label: 'رقم المستند', value: (r: LedgerRow) => r.source.no },
];

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** لوحةُ التحكّم — أرقامُها من الدفتر والتخصيصات لا من جمع الشاشة (`ق-١٢٤٣`)؛ وشاشتُها شاشةُ التقارير: هي قائمةُ دخلٍ مختصرة. */
  @Get('dashboard')
  @RequiresAction('view')
  dashboard(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.dashboard(tenant.companyId, tenant.allowedBranchIds, range);
  }

  /** Occupancy, on-time collection and the renewal pipeline — all derived, none stored. */
  @Get('property-kpis')
  @RequiresAction('view')
  propertyKpis(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.propertyKpis(tenant.companyId);
  }

  @Get('income-statement')
  @RequiresAction('view')
  incomeStatement(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.incomeStatement(tenant.companyId, range);
  }

  @Get('balance-sheet')
  @RequiresAction('view')
  balanceSheet(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.balanceSheet(tenant.companyId, range);
  }

  @Get('cash-flow')
  @RequiresAction('view')
  cashFlow(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.cashFlow(tenant.companyId, range);
  }

  /**
   * الإيرادُ المؤجَّل (`ق-٤٦٨`): **الالتزامُ القائم بعقده وفترته** — ومعه
   * **الدفعاتُ التي لم تمرّ به** (`ق-٤٧٣`)، فمن يقرأ إيرادَه يعرف كم منه
   * اعتُرف به فوراً بلا فترةِ خدمةٍ تُعرف.
   */
  @Get('deferred-revenue')
  @RequiresAction('view')
  deferredRevenue(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.deferredRevenue(tenant.companyId);
  }

  /** تقريرُ الفرق (ق-٢٨٥/٣): الرصيدُ الدفتريّ مقابل ما كان يُعرض — وإعلانُ ق-٢٨٣ معه. */
  @Get('bank-difference')
  @RequiresAction('view')
  bankDifference(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.bankDifference(tenant.companyId, tenant.allowedBranchIds);
  }

  /** المرتجعات (30.9): كم أُرجع · كم عاد إلى الرفّ وبأي تكلفة · كم رُدّ نقداً · ومن سجّله. */
  @Get('returns')
  @RequiresAction('view')
  returns(@CurrentTenant() tenant: TenantContext, @Query() query: TrialBalanceDto) {
    return this.reportsService.returns(tenant.companyId, tenant.allowedBranchIds, query, query.branchId);
  }

  /** مهل الإشعارات (م٥٤): المتأخّر بوسمه، والمقترب قبل انقضائه. */
  @Get('note-deadlines')
  @RequiresAction('view')
  noteDeadlines(@CurrentTenant() tenant: TenantContext, @Query() query: TrialBalanceDto) {
    return this.reportsService.noteDeadlines(tenant.companyId, tenant.allowedBranchIds, query, query.branchId);
  }

  /** ميزان المراجعة (10.4) — فترة + فرع اختياري. */
  /** أعمار ذمم العملاء (4.6) — شرائح التأخر إلى تاريخ التقرير. */
  @Get('receivables-aging')
  @RequiresAction('view')
  receivablesAging(@CurrentTenant() tenant: TenantContext, @Query() filter: AgingDto) {
    return this.reportsService.receivablesAging(tenant.companyId, tenant.allowedBranchIds, { ...filter, reconcile: filter.reconcile } as never);
  }

  /** تصدير 10.12 — CSV بـBOM ليفتح عربياً سليماً في Excel. */
  @Get('receivables-aging/export')
  @RequiresAction('view')
  async receivablesAgingCsv(@CurrentTenant() tenant: TenantContext, @Query() filter: AgingDto, @Res() res: Response) {
    const report = await this.reportsService.receivablesAging(tenant.companyId, tenant.allowedBranchIds, filter as never);
    const csv = buildCsv(
      [
        { label: 'العميل', value: (r: (typeof report.rows)[number]) => r.customerName },
        { label: 'جارٍ', value: (r: (typeof report.rows)[number]) => r.current },
        { label: '1-30', value: (r: (typeof report.rows)[number]) => r.d1 },
        { label: '31-60', value: (r: (typeof report.rows)[number]) => r.d31 },
        { label: '61-90', value: (r: (typeof report.rows)[number]) => r.d61 },
        { label: 'أكثر من 90', value: (r: (typeof report.rows)[number]) => r.d90 },
        { label: 'غير منسوب', value: (r: (typeof report.rows)[number]) => r.unapplied },
        { label: 'الإجمالي', value: (r: (typeof report.rows)[number]) => r.total },
      ],
      report.rows,
    );
    res
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="receivables-aging-${report.asOf}.csv"`)
      .send(csv);
  }
  @Get('trial-balance')
  @RequiresAction('view')
  trialBalance(@CurrentTenant() tenant: TenantContext, @Query() filter: TrialBalanceDto) {
    return this.reportsService.trialBalance(tenant.companyId, tenant.allowedBranchIds, filter);
  }

  /** الأستاذُ العام (`SPEC 10.16` · `ق-١٢٦١` ج): حسابٌ أو بُعدٌ، على مدىً وفرع — برصيدٍ افتتاحيٍّ وجارٍ ومصدرٍ لكلِّ قيد. */
  @Get('ledger')
  @RequiresAction('view')
  ledger(@CurrentTenant() tenant: TenantContext, @Query() filter: LedgerDto) {
    return this.reportsService.ledger(tenant.companyId, tenant.allowedBranchIds, filter);
  }

  @Get('ledger/export')
  @RequiresAction('view')
  async ledgerCsv(@CurrentTenant() tenant: TenantContext, @Query() filter: LedgerDto, @Res() res: Response) {
    const report = await this.reportsService.ledger(tenant.companyId, tenant.allowedBranchIds, filter);
    const csv = buildCsv(LEDGER_CSV_COLUMNS, report.rows);
    res
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="ledger-${report.account?.code ?? 'dimension'}-${filter.from ?? 'all'}-${filter.to ?? 'all'}.csv"`)
      .send(csv);
  }

  /** كشفُ حساب عميلٍ أو مورّد (`SPEC 4.2`): سطورُ الدفتر التي تحمل بُعدَ الطرف، برصيدٍ جارٍ على طرفه الطبيعيّ. */
  @Get('statement')
  @RequiresAction('view')
  statement(@CurrentTenant() tenant: TenantContext, @Query() filter: StatementDto) {
    return this.reportsService.statement(tenant.companyId, tenant.allowedBranchIds, filter);
  }

  @Get('statement/export')
  @RequiresAction('view')
  async statementCsv(@CurrentTenant() tenant: TenantContext, @Query() filter: StatementDto, @Res() res: Response) {
    const report = await this.reportsService.statement(tenant.companyId, tenant.allowedBranchIds, filter);
    const csv = buildCsv(LEDGER_CSV_COLUMNS, report.rows);
    res
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="statement-${report.party.kind}-${report.party.id}-${filter.from ?? 'all'}-${filter.to ?? 'all'}.csv"`)
      .send(csv);
  }

  /** تصدير 10.12 — CSV بـBOM ليفتح عربياً سليماً في Excel. */
  @Get('trial-balance/export')
  @RequiresAction('view')
  async trialBalanceCsv(@CurrentTenant() tenant: TenantContext, @Query() filter: TrialBalanceDto, @Res() res: Response) {
    const report = await this.reportsService.trialBalance(tenant.companyId, tenant.allowedBranchIds, filter);
    const csv = buildCsv(
      [
        { label: 'رمز الحساب', value: (r: (typeof report.rows)[number]) => r.code },
        { label: 'اسم الحساب', value: (r: (typeof report.rows)[number]) => r.name },
        { label: 'مدين', value: (r: (typeof report.rows)[number]) => r.debitTotal },
        { label: 'دائن', value: (r: (typeof report.rows)[number]) => r.creditTotal },
        { label: 'رصيد مدين', value: (r: (typeof report.rows)[number]) => r.balanceDebit },
        { label: 'رصيد دائن', value: (r: (typeof report.rows)[number]) => r.balanceCredit },
      ],
      report.rows,
    );
    res
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="trial-balance-${filter.from ?? 'all'}-${filter.to ?? 'all'}.csv"`)
      .send(csv);
  }

  /** Per-branch revenue/expense plus the consolidated total. Scoped to the
   * caller's branches, so an employee sees their own figures and the owner
   * sees the whole company. */
  @Get('branch-summary')
  @RequiresAction('view')
  branchSummary(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.branchSummary(tenant.companyId, tenant.allowedBranchIds, range);
  }
}
