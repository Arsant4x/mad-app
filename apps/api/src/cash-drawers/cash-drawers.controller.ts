import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { MSG } from '../common/i18n/messages';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CashDrawersService } from './cash-drawers.service';
import { CreateCashDrawerDto } from './dto/create-cash-drawer.dto';
import { UpdateCashDrawerDto } from './dto/update-cash-drawer.dto';
import { TransferCashDrawerDto } from './dto/transfer-cash-drawer.dto';

/** القائمةُ تُقرأ لكل فاعلٍ داخل المستأجر (تغذّي مُنتقي الدرج عند فتح المناوبة)،
 * **والتغييرُ لمالك المنشأة** — معلَنٌ في الحارس (`@OwnerOnly`) ومؤكَّدٌ في الخدمة
 * كالفروع (`ق-١١٩٨`/①). */
@Controller('cash-drawers')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('قائمةُ الأدراج تغذّي منتقي الدرج عند فتح المناوبة لكلّ فاعل، مصفّاةً بفروعه — والتغييرُ للمالك وحدَه')
export class CashDrawersController {
  constructor(private readonly cashDrawers: CashDrawersService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.cashDrawers.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  /** سقفُ نطاق رموز الأدراج (`ق-٢٩٥`) — مسارٌ ثابتٌ قبل `:id`. */
  @Get('code-band')
  codeBand(@CurrentTenant() tenant: TenantContext) {
    return this.cashDrawers.codeBand(tenant.companyId);
  }

  @Post()
  @OwnerOnly(MSG.cash_drawer_forbidden)
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCashDrawerDto) {
    return this.cashDrawers.create(tenant.companyId, tenant.actorType, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  @OwnerOnly(MSG.cash_drawer_forbidden)
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCashDrawerDto) {
    return this.cashDrawers.update(tenant.companyId, tenant.actorType, id, dto);
  }

  /** نقلُ الدرج إلى فرعٍ آخر — إغلاقٌ وفتحٌ بعدّ النقد ونقلِ رصيده بقيدين (`ق-١٤١٣`). */
  @Post(':id/transfer')
  @OwnerOnly(MSG.cash_drawer_forbidden)
  transfer(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: TransferCashDrawerDto) {
    return this.cashDrawers.transfer(tenant.companyId, tenant.actorType, tenant.allowedBranchIds, id, dto);
  }

  @Delete(':id')
  @OwnerOnly(MSG.cash_drawer_forbidden)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.cashDrawers.remove(tenant.companyId, tenant.actorType, id);
  }
}
