import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards , Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SetArchivedDto } from '../common/dto/set-archived.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitsService } from './units.service';

@Controller('units')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('properties')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query('includeArchived') includeArchived?: string) {
    return this.unitsService.list(tenant.companyId, includeArchived === 'true');
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateUnitDto) {
    return this.unitsService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.unitsService.update(tenant.companyId, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.unitsService.setArchived(tenant.companyId, id, dto.archived);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.unitsService.remove(tenant.companyId, id);
  }
}
