import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { VatDeclarationQueryDto } from './dto/vat-declaration-query.dto';
import { VatFiledDto } from './dto/vat-filed.dto';
import { DeclareVatRatioDto, VatRatioQueryDto } from './dto/vat-ratio.dto';
import { DeclareVatCorrectionDto } from './dto/vat-correction.dto';
import { ObligationsService } from './obligations.service';

@Controller('obligations')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('obligations')
export class ObligationsController {
  constructor(private readonly obligationsService: ObligationsService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.obligationsService.list(tenant.companyId, query);
  }

  @Get('vat-declaration')
  @RequiresAction('view')
  vatDeclaration(@CurrentTenant() tenant: TenantContext, @Query() query: VatDeclarationQueryDto) {
    return this.obligationsService.vatDeclaration(tenant.companyId, query);
  }

  /** علَمُ «قُدِّم» (ق-٩١٩): يضعه التاجرُ بيده بعد التقديم — والنظامُ لا يعرف ما قُدِّم. */
  @Post('vat-declaration/filed')
  @RequiresAction('record')
  markFiled(@CurrentTenant() tenant: TenantContext, @Body() dto: VatFiledDto) {
    return this.obligationsService.markFiled(tenant.companyId, dto);
  }

  @Delete('vat-declaration/filed')
  @RequiresAction('record')
  unmarkFiled(@CurrentTenant() tenant: TenantContext, @Query() dto: VatFiledDto) {
    return this.obligationsService.unmarkFiled(tenant.companyId, dto);
  }

  /**
   * ⑥A1 (`ق-١٣٢٥`) — نسبةُ الخصم النسبيّ لسنةٍ تقويمية: المعلَنةُ والمقترَحةُ معاً (م٥١/٤–٦).
   */
  @Get('vat-ratio')
  @RequiresAction('view')
  vatRatio(@CurrentTenant() tenant: TenantContext, @Query() query: VatRatioQueryDto) {
    return this.obligationsService.vatRatio(tenant.companyId, query.year);
  }

  /** ⑥A1 — التاجرُ يُعلن النسبة، والنظامُ يحسب ويعرض ولا يكتب. */
  @Post('vat-ratio')
  @RequiresAction('record')
  declareVatRatio(@CurrentTenant() tenant: TenantContext, @Body() dto: DeclareVatRatioDto) {
    return this.obligationsService.declareVatRatio(tenant.companyId, dto);
  }

  /** ⑥A1 — إقرارُ التسوية السنوية (م٥١/٧): أثرٌ يُختم، والحسابُ يبقى مشتقّاً. */
  @Post('vat-ratio/settle')
  @RequiresAction('review')
  settleVatRatio(@CurrentTenant() tenant: TenantContext, @Body() dto: VatRatioQueryDto) {
    return this.obligationsService.settleVatRatio(tenant.companyId, dto.year);
  }

  /** ⑥A3 (`ق-١٣٢٥`) — تصحيحُ إقرارٍ سابق من خلال هذا الإقرار (م٦٣/٢–٣). */
  @Post('vat-declaration/corrections')
  @RequiresAction('record')
  declareCorrection(@CurrentTenant() tenant: TenantContext, @Body() dto: DeclareVatCorrectionDto) {
    return this.obligationsService.declareCorrection(tenant.companyId, dto);
  }

  @Delete('vat-declaration/corrections/:id')
  @RequiresAction('record')
  removeCorrection(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.obligationsService.removeCorrection(tenant.companyId, id);
  }

  @Patch(':id/toggle')
  @RequiresAction('review')
  toggle(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.obligationsService.toggle(tenant.companyId, id);
  }
}
