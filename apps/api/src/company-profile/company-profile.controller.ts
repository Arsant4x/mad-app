import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CompanyProfileService } from './company-profile.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

@Controller('company-profile')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CompanyProfileController {
  constructor(private readonly companyProfileService: CompanyProfileService) {}

  @Get()
  get(@CurrentTenant() tenant: TenantContext) {
    return this.companyProfileService.get(tenant.companyId);
  }

  @Patch()
  update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateCompanyProfileDto) {
    return this.companyProfileService.update(tenant.companyId, tenant.actorType, dto);
  }
}
