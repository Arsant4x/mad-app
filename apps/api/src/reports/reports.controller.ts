import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ReportRangeDto } from './dto/report-range.dto';
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

  /** Per-branch revenue/expense plus the consolidated total. Scoped to the
   * caller's branches, so an employee sees their own figures and the owner
   * sees the whole company. */
  @Get('branch-summary')
  @RequiresAction('view')
  branchSummary(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.branchSummary(tenant.companyId, tenant.allowedBranchIds, range);
  }
}
