import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { VatDeclarationQueryDto } from './dto/vat-declaration-query.dto';
import { ObligationsService } from './obligations.service';

@Controller('obligations')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('obligations')
export class ObligationsController {
  constructor(private readonly obligationsService: ObligationsService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.obligationsService.list(tenant.companyId);
  }

  @Get('vat-declaration')
  vatDeclaration(@CurrentTenant() tenant: TenantContext, @Query() query: VatDeclarationQueryDto) {
    return this.obligationsService.vatDeclaration(tenant.companyId, query);
  }

  @Patch(':id/toggle')
  toggle(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.obligationsService.toggle(tenant.companyId, id);
  }
}
