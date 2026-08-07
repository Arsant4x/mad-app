import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ReportRangeDto, TrialBalanceDto } from './dto/report-range.dto';
import { buildCsv } from '../common/csv.util';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
  balanceSheet(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.balanceSheet(tenant.companyId);
  }

  @Get('cash-flow')
  @RequiresAction('view')
  cashFlow(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.cashFlow(tenant.companyId, range);
  }

  /** ميزان المراجعة (10.4) — فترة + فرع اختياري. */
  @Get('trial-balance')
  @RequiresAction('view')
  trialBalance(@CurrentTenant() tenant: TenantContext, @Query() filter: TrialBalanceDto) {
    return this.reportsService.trialBalance(tenant.companyId, filter);
  }

  /** تصدير 10.12 — CSV بـBOM ليفتح عربياً سليماً في Excel. */
  @Get('trial-balance/export')
  @RequiresAction('view')
  async trialBalanceCsv(@CurrentTenant() tenant: TenantContext, @Query() filter: TrialBalanceDto, @Res() res: Response) {
    const report = await this.reportsService.trialBalance(tenant.companyId, filter);
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
