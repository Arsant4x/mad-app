import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
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
    return this.inventoryService.listMovements(tenant.companyId);
  }

  @Post('movements')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateStockMovementDto) {
    return this.inventoryService.create(tenant.companyId, dto);
  }

  @Delete('movements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.inventoryService.remove(tenant.companyId, id);
  }
}
