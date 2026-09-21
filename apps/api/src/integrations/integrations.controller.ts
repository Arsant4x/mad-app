import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { IntegrationKind } from '@prisma/client';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { IntegrationsService } from './integrations.service';
import { MSG } from '../common/i18n/messages';

class CreateIntegrationDto {
  @IsIn(['PAYMENT_GATEWAY', 'BNPL', 'ECOMMERCE'])
  kind!: IntegrationKind;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  label?: string;

  /** {apiKey: '...', merchantId: '...'} — تُشفَّر فور الوصول ولا تُقرأ ثانيةً. */
  @IsObject()
  credentials!: Record<string, string>;
}

class SetEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

/**
 * ربط المزوّدين — قرار المالك في إعدادات منشأته (قاعدة الفاعل §3.5):
 * مفاتيح التاجر ملكُ التاجر، فلا يديرها موظف ولا تسكن لوحة المطوّر.
 */
@Controller('integrations')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('settings')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  /** حارس المالك: الموظفون — حتى مَن يرى الإعدادات — لا يلمسون المفاتيح. */
  private assertOwner(tenant: TenantContext): void {
    if (tenant.actorType !== 'COMPANY') throw new ForbiddenException(MSG.integration_owner_only);
  }

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    this.assertOwner(tenant);
    return this.integrationsService.list(tenant.companyId, query);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateIntegrationDto) {
    this.assertOwner(tenant);
    return this.integrationsService.create(tenant.companyId, dto);
  }

  @Patch(':id/enabled')
  setEnabled(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetEnabledDto) {
    this.assertOwner(tenant);
    return this.integrationsService.setEnabled(tenant.companyId, id, dto.enabled);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    this.assertOwner(tenant);
    return this.integrationsService.remove(tenant.companyId, id);
  }
}
