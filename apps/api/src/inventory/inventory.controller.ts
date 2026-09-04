import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateWriteOffDto } from './dto/create-write-off.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { RejectWriteOffDto } from './dto/reject-write-off.dto';
import { InventoryService } from './inventory.service';
import { WriteOffsService } from './write-offs.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly writeOffs: WriteOffsService,
  ) {}

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

  // ── واقعات الشطب (`SPEC 30.5` · `30.7`) ────────────────────────────────
  //
  // ⚠️ **القسمة هنا لا في الخدمة**: التسجيل بـ`record` والحسم بـ`review`.
  // فمن يستقبل البضاعة يسجّل ما رآه، **ولا يقرّر إعدامها**. ووضعُ الفصل عند
  // الباب يجعله **قابلاً للقراءة في سطرٍ واحد** لمن يراجع الصلاحيات.

  @Get('write-offs')
  @RequiresAction('view')
  listWriteOffs(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string) {
    return this.writeOffs.list(tenant.companyId, tenant.allowedBranchIds, status);
  }

  @Post('write-offs')
  @RequiresAction('record')
  recordWriteOff(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateWriteOffDto) {
    return this.writeOffs.create(tenant.companyId, tenant.allowedBranchIds, tenant.profileId, dto);
  }

  @Post('write-offs/:id/approve')
  @RequiresAction('review')
  approveWriteOff(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.writeOffs.approve(tenant.companyId, tenant.allowedBranchIds, tenant.profileId, id);
  }

  @Post('write-offs/:id/reject')
  @RequiresAction('review')
  rejectWriteOff(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: RejectWriteOffDto) {
    return this.writeOffs.reject(tenant.companyId, tenant.allowedBranchIds, tenant.profileId, id, dto);
  }
}
