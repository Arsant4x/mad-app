import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

/** No @RequiresScreen: the activity list feeds pickers on other screens, so any
 * tenant actor reads it. Writes are owner-only, enforced in the service. */
@Controller('activities')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.activitiesService.list(tenant.companyId);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(tenant.companyId, tenant.actorType, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activitiesService.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.activitiesService.remove(tenant.companyId, tenant.actorType, id);
  }
}
