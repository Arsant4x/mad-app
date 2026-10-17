import { ApiNoContentResponse } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { IdempotencyExempt } from '../common/idempotency/idempotency';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';
import { ReopenPeriodDto } from './dto/reopen-period.dto';
import { SetFiscalStartMonthDto } from './dto/set-fiscal-start-month.dto';
import { FiscalService } from './fiscal.service';

@Controller('fiscal-years')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.fiscalService.list(tenant.companyId, query);
  }

  @Post()
  @RequiresAction('add')
  @IdempotencyExempt('fiscal years cannot overlap; a repeat is refused as overlapping the year it created')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateFiscalYearDto) {
    return this.fiscalService.create(tenant.companyId, dto);
  }

  /**
   * ⚖️ **شهرُ بداية السنة المالية** (توجيه ٢٧٥ · `ق-١٥٨٤`): لصاحب المنشأة، قبل أوّل ترحيلٍ وحدَه (`409` بعده)، ويُعيد
   * بناءَ التقويم من الشهر الجديد. ولا جسمَ للردّ: الصفحةُ تعيد قراءةَ السنوات.
   */
  @Patch('start-month')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async setStartMonth(@CurrentTenant() tenant: TenantContext, @Body() dto: SetFiscalStartMonthDto): Promise<void> {
    await this.fiscalService.setStartMonth(tenant.companyId, dto.month);
  }

  /** Separate close/reopen verbs rather than one toggle: the caller should
   * never have to know the current state to express the intent, and a
   * double-submitted request stays idempotent. */
  @Patch('periods/:id/close')
  @RequiresAction('review')
  closePeriod(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.fiscalService.setPeriodStatus(tenant.companyId, id, true);
  }

  /** ⚖️ بسببٍ مكتوبٍ يُسجَّل على الفترة مع لحظته ومن فتحها (`ق-١٥٨٣`). */
  @Patch('periods/:id/reopen')
  @RequiresAction('review')
  reopenPeriod(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: ReopenPeriodDto) {
    return this.fiscalService.setPeriodStatus(tenant.companyId, id, false, { reason: dto.reason, actorId: tenant.profileId });
  }

  /**
   * **إقفالُ السنة بقيدٍ واحد** (`ق-١٢٨٣` · د/③) — فعلُ `review` كإغلاق الفترة:
   * قرارٌ محاسبيٌّ لا إدخالُ بيانات، **وبيد صاحب الصلاحية لا آلياً**.
   */
  @Post(':id/close')
  @RequiresAction('review')
  @IdempotencyExempt('a fiscal year is closed once; a repeat is refused because it is already closed')
  closeYear(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.fiscalService.closeYear(tenant.companyId, id);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.fiscalService.remove(tenant.companyId, id);
  }
}
