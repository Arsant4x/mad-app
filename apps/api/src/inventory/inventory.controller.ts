import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock-levels')
  @RequiresAction('view')
  stockLevels(@CurrentTenant() tenant: TenantContext) {
    return this.inventoryService.stockLevels(tenant.companyId);
  }

  @Get('movements')
  @RequiresAction('view')
  listMovements(@CurrentTenant() tenant: TenantContext, @Query() query: ListMovementsQueryDto) {
    return this.inventoryService.listMovements(tenant.companyId, tenant.allowedBranchIds, query);
  }

  /** Batches expiring within `withinDays` (default 90), already-expired first. */
  @Get('expiring')
  @RequiresAction('view')
  expiring(@CurrentTenant() tenant: TenantContext, @Query('withinDays') withinDays?: string) {
    const days = withinDays ? Math.max(0, parseInt(withinDays, 10) || 0) : 90;
    return this.inventoryService.expiringStock(tenant.companyId, tenant.allowedBranchIds, days);
  }

  @Post('movements')
  @RequiresAction('record')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateStockMovementDto) {
    return this.inventoryService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Delete('movements/:id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.inventoryService.remove(tenant.companyId, id);
  }
}
