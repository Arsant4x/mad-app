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
import { CompanyWideFigures } from '../common/tenant/company-wide-figures.decorator';

/**
 * ⚖️ **الإقرارُ إقرارُ المنشأة كلِّها** (توجيه ٢٧٥ · `ق-١٥٨١`): قراءتُه وكتابتُه («قُدِّم» · النسبة · الإقفال · التصحيح) لمن يرى
 * الفروعَ كلَّها. فمن لا يقرأ أرقامَه لا يُقفله ولا يعلن نسبتَه. والتزاماتُ التقويم (`list` · `toggle`) ليست أرقاماً فتبقى.
 */
const VAT_RETURN = 'إقرارُ ضريبة القيمة المضافة للمنشأة كلِّها برقمها الضريبيّ الواحد: لا إقرارَ لفرع';

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
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('view')
  vatDeclaration(@CurrentTenant() tenant: TenantContext, @Query() query: VatDeclarationQueryDto) {
    return this.obligationsService.vatDeclaration(tenant.companyId, query);
  }

  /** علَمُ «قُدِّم» (ق-٩١٩): يضعه التاجرُ بيده بعد التقديم — والنظامُ لا يعرف ما قُدِّم. */
  @Post('vat-declaration/filed')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('record')
  markFiled(@CurrentTenant() tenant: TenantContext, @Body() dto: VatFiledDto) {
    return this.obligationsService.markFiled(tenant.companyId, dto);
  }

  @Delete('vat-declaration/filed')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('record')
  unmarkFiled(@CurrentTenant() tenant: TenantContext, @Query() dto: VatFiledDto) {
    return this.obligationsService.unmarkFiled(tenant.companyId, dto);
  }

  /**
   * ⑥A1 (`ق-١٣٢٥`) — نسبةُ الخصم النسبيّ لسنةٍ تقويمية: المعلَنةُ والمقترَحةُ معاً (م٥١/٤–٦).
   */
  @Get('vat-ratio')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('view')
  vatRatio(@CurrentTenant() tenant: TenantContext, @Query() query: VatRatioQueryDto) {
    return this.obligationsService.vatRatio(tenant.companyId, query.year);
  }

  /** ⑥A1 — التاجرُ يُعلن النسبة، والنظامُ يحسب ويعرض ولا يكتب. */
  @Post('vat-ratio')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('record')
  declareVatRatio(@CurrentTenant() tenant: TenantContext, @Body() dto: DeclareVatRatioDto) {
    return this.obligationsService.declareVatRatio(tenant.companyId, dto);
  }

  /** ⑥A1 — معاينةُ التسوية السنوية (م٥١/٧): تُحسب ولا تُكتب. */
  @Get('vat-ratio/settlement')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('view')
  vatSettlementPreview(@CurrentTenant() tenant: TenantContext, @Query() query: VatRatioQueryDto) {
    return this.obligationsService.vatSettlementPreview(tenant.companyId, query.year);
  }

  /** ⚖️ `ق-١٣٦٠` — التسويةُ السنوية حدثٌ بتاريخه بعد انقضاء السنة وإقفال فتراتها (م٥١/٧) — يُرحّل المشتركَ بنسبة السنة الفعلية. */
  @Post('vat-ratio/settle')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('review')
  settleVatRatio(@CurrentTenant() tenant: TenantContext, @Body() dto: VatRatioQueryDto) {
    return this.obligationsService.settleVatRatio(tenant.companyId, dto.year);
  }

  /** ⚖️ `ق-١٣٦٠` — أحداثُ إقفال الإقرار لسنة (إقفالٌ · تسويةٌ · عكس). */
  @Get('vat-declaration/closings')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('view')
  listVatClosings(@CurrentTenant() tenant: TenantContext, @Query() query: VatRatioQueryDto) {
    return this.obligationsService.listVatClosings(tenant.companyId, query.year);
  }

  /** ⚖️ `ق-١٣٦٠` — «إقفالُ الإقرار» حدثٌ مستقلٌّ بتاريخه — لا علَمُ «قُدِّم». */
  @Post('vat-declaration/closings')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('review')
  closeVatReturn(@CurrentTenant() tenant: TenantContext, @Body() dto: VatDeclarationQueryDto) {
    return this.obligationsService.closeVatReturn(tenant.companyId, dto);
  }

  /** ⚖️ `ق-١٣٦٠` — «ولا يُرفع إلا بحدثٍ عاكسٍ بتاريخه». */
  @Post('vat-declaration/closings/:id/reverse')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('review')
  reverseVatClosing(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.obligationsService.reverseVatClosing(tenant.companyId, id);
  }

  /** ⑥A3 (`ق-١٣٢٥`) — تصحيحُ إقرارٍ سابق من خلال هذا الإقرار (م٦٣/٢–٣). */
  @Post('vat-declaration/corrections')
  @CompanyWideFigures(VAT_RETURN)
  @RequiresAction('record')
  declareCorrection(@CurrentTenant() tenant: TenantContext, @Body() dto: DeclareVatCorrectionDto) {
    return this.obligationsService.declareCorrection(tenant.companyId, dto);
  }

  @Delete('vat-declaration/corrections/:id')
  @CompanyWideFigures(VAT_RETURN)
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
