import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { MSG } from '../common/i18n/messages';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { FormSigningSettingsResponse, UpdateFormSigningSettingsDto } from './dto/form-signing-settings.dto';
import { FormSigningSettingsService } from './form-signing-settings.service';

/**
 * ⚖️ **إعدادُ توقيع النماذج** (توجيه ٢٨٧ ② و④): مدّةُ التوقيع لكلِّ نوع، وحدُّ نفاذ. **الكتابةُ لمالك المنشأة** («الضابطُ مالكُ المنشأة»،
 * المسح ٣٢)، **والقراءةُ لكلِّ فاعل** لأن الموظّفَ يرى المدّةَ قبل أن يرسل الرابط.
 */
@Controller('form-signing-settings')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('إعدادُ التوقيع يُقرأ لكلّ فاعل لأن الموظّفَ يرى مدّةَ التوقيع قبل إرسال الرابط — والكتابةُ لمالك المنشأة')
export class FormSigningSettingsController {
  constructor(private readonly service: FormSigningSettingsService) {}

  @Get()
  @ApiOkResponse({ type: FormSigningSettingsResponse })
  get(@CurrentTenant() tenant: TenantContext) {
    return this.service.get(tenant.companyId);
  }

  @Put()
  @OwnerOnly(MSG.form_signing_settings_owner_only)
  @ApiOkResponse({ type: FormSigningSettingsResponse })
  update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateFormSigningSettingsDto) {
    return this.service.update(tenant.companyId, tenant.actorType, dto);
  }
}
