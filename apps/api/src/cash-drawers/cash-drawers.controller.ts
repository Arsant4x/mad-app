import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CashDrawersService } from './cash-drawers.service';
import { CreateCashDrawerDto } from './dto/create-cash-drawer.dto';
import { UpdateCashDrawerDto } from './dto/update-cash-drawer.dto';

/** القائمةُ تُقرأ لكل فاعلٍ داخل المستأجر (تغذّي مُنتقي الدرج عند فتح المناوبة)،
 * **والتغييرُ لمالك المنشأة** — يُفرض في الخدمة كالفروع. */
@Controller('cash-drawers')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CashDrawersController {
  constructor(private readonly cashDrawers: CashDrawersService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.cashDrawers.list(tenant.companyId);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCashDrawerDto) {
    return this.cashDrawers.create(tenant.companyId, tenant.actorType, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCashDrawerDto) {
    return this.cashDrawers.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.cashDrawers.remove(tenant.companyId, tenant.actorType, id);
  }
}
