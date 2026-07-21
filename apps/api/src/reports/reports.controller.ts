import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ReportRangeDto } from './dto/report-range.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('income-statement')
  incomeStatement(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.incomeStatement(tenant.companyId, range);
  }

  @Get('balance-sheet')
  balanceSheet(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.balanceSheet(tenant.companyId);
  }

  @Get('cash-flow')
  cashFlow(@CurrentTenant() tenant: TenantContext, @Query() range: ReportRangeDto) {
    return this.reportsService.cashFlow(tenant.companyId, range);
  }
}
