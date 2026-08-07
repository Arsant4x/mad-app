import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CloseShiftDto, CreatePosSaleDto, OpenShiftDto } from './dto/pos.dto';
import { PosService } from './pos.service';

/**
 * شاشة الكاشير — actor: the cashier employee (or the owner), gated by the
 * `pos` screen the owner grants through permission templates. Ringing a sale
 * is `record`; closing a drawer is `review` (it approves the count).
 */
@Controller('pos')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('shifts')
  @RequiresAction('view')
  listShifts(@CurrentTenant() tenant: TenantContext) {
    return this.posService.listShifts(tenant.companyId);
  }

  @Get('shifts/current')
  @RequiresAction('view')
  currentShift(@CurrentTenant() tenant: TenantContext) {
    return this.posService.currentShift(tenant);
  }

  @Post('shifts')
  @RequiresAction('record')
  openShift(@CurrentTenant() tenant: TenantContext, @Body() dto: OpenShiftDto) {
    return this.posService.openShift(tenant, dto);
  }

  @Post('shifts/:id/close')
  @RequiresAction('review')
  closeShift(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.posService.closeShift(tenant, id, dto);
  }

  @Post('sales')
  @RequiresAction('record')
  createSale(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePosSaleDto) {
    return this.posService.createSale(tenant, dto);
  }
}
