import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('suppliers')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  /** تقرير مصاريف التأسيس. Declared before the plain list so the router never
   * reads "incorporation-report" as anything else. */
  @Get('incorporation-report')
  @RequiresAction('view')
  incorporationReport(@CurrentTenant() tenant: TenantContext) {
    return this.purchasesService.incorporationReport(tenant.companyId);
  }

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.purchasesService.list(tenant.companyId, tenant.allowedBranchIds);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchasesService.update(tenant.companyId, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.purchasesService.remove(tenant.companyId, id);
  }
}
