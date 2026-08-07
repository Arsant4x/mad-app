import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateWarrantyDto, UpdateWarrantyDto } from './dto/warranty.dto';
import { WarrantiesService } from './warranties.service';

/** Gated by the maintenance screen: whoever handles repairs is exactly who
 * needs to know what is still under cover. */
@Controller('warranties')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('maintenance')
export class WarrantiesController {
  constructor(private readonly warrantiesService: WarrantiesService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query('propertyId') propertyId?: string) {
    return this.warrantiesService.list(tenant.companyId, propertyId);
  }

  /**
   * What covers a location on a given date — the question worth asking before
   * a contractor is called out.
   */
  @Get('cover')
  @RequiresAction('view')
  cover(
    @CurrentTenant() tenant: TenantContext,
    @Query('propertyId') propertyId: string,
    @Query('unitId') unitId?: string,
    @Query('date') date?: string,
  ) {
    return this.warrantiesService.coverFor(tenant.companyId, propertyId, unitId, date ? new Date(date) : new Date());
  }

  @Get(':id')
  @RequiresAction('view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.warrantiesService.findOne(tenant.companyId, id);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateWarrantyDto) {
    return this.warrantiesService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateWarrantyDto) {
    return this.warrantiesService.update(tenant.companyId, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.warrantiesService.remove(tenant.companyId, id);
  }
}
