import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { FormTemplateResponse, FormTemplateRowResponse } from './dto/form-responses.dto';
import { CopyFormTemplateDto, UpdateFormTemplateDto } from './dto/form-template.dto';
import { FormTemplatesService } from './form-templates.service';

/**
 * ⚖️ **قوالبُ المنشأة — نسخُ التاجر من القوالب العامّة** (توجيه ٢٧٨ · `ق-١٦٣٤` · قرارُ الخطّة ٤٣: «المنصّةُ تملك القوالب،
 * والتاجرُ يعدّل نسختَه»).
 *
 * **الفاعلُ مالكُ المنشأة في شاشاتها** (النموذجُ المرئيّ المُقرّ، «قوالبُ المنشأة وإعدادُ التوقيع»)، ⚖️ **ومن يمنحه المالكُ شاشةَ
 * «النماذج»** في قالب صلاحياته (`ق-١٦٤١`/٢): الكتابةُ على شاشة `forms` بأفعالها — النسخُ وإصدارٌ جديد «إضافة»، والتحريرُ
 * «تعديل»، والنشرُ «مراجعة»، وحذفُ المسوّدة «حذف» — والمالكُ يملكها كلَّها. **والقراءةُ لكلِّ فاعل**: الموظّفُ يعبّئ النموذجَ على
 * إصدارٍ منشور (الموجة ١ج)، فوسمُ الصنف `@TenantWide` للقراءة ووسمُ الدالّة يغلبه في الكتابة.
 */
@Controller('form-templates')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('قوالبُ المنشأة وكتالوجُ القوالب العامّة تُقرأ لكلّ فاعل لأن الموظّفَ يعبّئ النموذجَ على إصدارٍ منشور — والكتابةُ على شاشة «النماذج»')
export class FormTemplatesController {
  constructor(private readonly service: FormTemplatesService) {}

  @Get()
  @ApiOkResponse({ type: FormTemplateRowResponse, isArray: true })
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list({ companyId: tenant.companyId });
  }

  // قبل ':id' فلا تُقرأ «catalog» معرّفاً.
  @Get('catalog')
  @ApiOkResponse({ type: FormTemplateRowResponse, isArray: true })
  catalog(@CurrentTenant() tenant: TenantContext) {
    return this.service.catalog(tenant.companyId);
  }

  @Get(':id')
  @ApiOkResponse({ type: FormTemplateResponse })
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.get({ companyId: tenant.companyId }, id);
  }

  @Post('copy')
  @RequiresScreen('forms')
  @RequiresAction('add')
  @ApiCreatedResponse({ type: FormTemplateResponse })
  copy(@CurrentTenant() tenant: TenantContext, @Body() dto: CopyFormTemplateDto) {
    return this.service.copy(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresScreen('forms')
  @RequiresAction('edit')
  @ApiOkResponse({ type: FormTemplateResponse })
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateFormTemplateDto) {
    return this.service.update({ companyId: tenant.companyId }, id, dto);
  }

  @Post(':id/publish')
  @RequiresScreen('forms')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: FormTemplateResponse })
  publish(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.publish({ companyId: tenant.companyId }, id);
  }

  @Post(':id/versions')
  @RequiresScreen('forms')
  @RequiresAction('add')
  @ApiCreatedResponse({ type: FormTemplateResponse })
  newVersion(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.newVersion({ companyId: tenant.companyId }, id);
  }

  @Delete(':id')
  @RequiresScreen('forms')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.remove({ companyId: tenant.companyId }, id);
  }
}
