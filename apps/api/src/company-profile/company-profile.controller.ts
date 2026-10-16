import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { MSG } from '../common/i18n/messages';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CompanyProfileService } from './company-profile.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

/** الملفُّ يُقرأ لكلّ فاعل (الشريطُ الجانبيّ يعرضه للجميع)، والتعديلُ للمالك وحدَه —
 * معلَناً في الحارس (`@OwnerOnly`) ومؤكَّداً في الخدمة (`ق-١١٩٨`/①). */
@Controller('company-profile')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('ملفُّ المنشأة يُقرأ لكلّ فاعل: الاسمُ القانوني والرقمُ الضريبي يظهران على ما يُصدره — والتعديلُ للمالك وحدَه')
export class CompanyProfileController {
  constructor(private readonly companyProfileService: CompanyProfileService) {}

  @Get()
  get(@CurrentTenant() tenant: TenantContext) {
    return this.companyProfileService.get(tenant.companyId);
  }

  /** A change of the e-mail checks the current password, so saves are limited to ten a minute for one account. */
  @Patch()
  @OwnerOnly(MSG.company_profile_owner_only)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateCompanyProfileDto) {
    return this.companyProfileService.update(tenant.companyId, tenant.actorType, dto);
  }
}
