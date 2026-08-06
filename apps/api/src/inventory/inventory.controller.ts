import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock-levels')
  stockLevels(@CurrentTenant() tenant: TenantContext) {
    return this.inventoryService.stockLevels(tenant.companyId);
  }

  @Get('movements')
  listMovements(@CurrentTenant() tenant: TenantContext) {
    return this.inventoryService.listMovements(tenant.companyId, tenant.allowedBranchIds);
  }

  /** Batches expiring within `withinDays` (default 90), already-expired first. */
  @Get('expiring')
  expiring(@CurrentTenant() tenant: TenantContext, @Query('withinDays') withinDays?: string) {
    const days = withinDays ? Math.max(0, parseInt(withinDays, 10) || 0) : 90;
    return this.inventoryService.expiringStock(tenant.companyId, tenant.allowedBranchIds, days);
  }

  @Post('movements')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateStockMovementDto) {
    return this.inventoryService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Delete('movements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.inventoryService.remove(tenant.companyId, id);
  }
}
