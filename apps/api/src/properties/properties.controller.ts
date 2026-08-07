import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards , Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SetArchivedDto } from '../common/dto/set-archived.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertiesService } from './properties.service';

@Controller('properties')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query('includeArchived') includeArchived?: string) {
    return this.propertiesService.list(tenant.companyId, includeArchived === 'true');
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePropertyDto) {
    return this.propertiesService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    return this.propertiesService.update(tenant.companyId, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.propertiesService.setArchived(tenant.companyId, id, dto.archived);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.propertiesService.remove(tenant.companyId, id);
  }
}
