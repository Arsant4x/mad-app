import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';
import { FiscalService } from './fiscal.service';

@Controller('fiscal-years')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.fiscalService.list(tenant.companyId);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateFiscalYearDto) {
    return this.fiscalService.create(tenant.companyId, dto);
  }

  /** Separate close/reopen verbs rather than one toggle: the caller should
   * never have to know the current state to express the intent, and a
   * double-submitted request stays idempotent. */
  @Patch('periods/:id/close')
  closePeriod(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.fiscalService.setPeriodStatus(tenant.companyId, id, true);
  }

  @Patch('periods/:id/reopen')
  reopenPeriod(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.fiscalService.setPeriodStatus(tenant.companyId, id, false);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.fiscalService.remove(tenant.companyId, id);
  }
}
