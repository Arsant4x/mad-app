import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import {
  AssignMaintenanceDto,
  CancelMaintenanceDto,
  CloseMaintenanceDto,
  CompleteMaintenanceDto,
  CreateMaintenanceDto,
  StartMaintenanceDto,
  UpdateMaintenanceDto,
} from './dto/maintenance.dto';
import { ClaimWarrantyDto } from '../warranties/dto/warranty.dto';
import { MaintenanceService } from './maintenance.service';

/** Each step of the lifecycle is its own endpoint rather than a generic
 * status PATCH: they take different data (an assignee, a date, a cost), and a
 * free-form status field would let a caller jump the queue. */
@Controller('maintenance')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.maintenanceService.list(tenant.companyId);
  }

  @Get(':id')
  @RequiresAction('view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.maintenanceService.findOne(tenant.companyId, id);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateMaintenanceDto) {
    return this.maintenanceService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateMaintenanceDto) {
    return this.maintenanceService.update(tenant.companyId, id, dto);
  }

  @Post(':id/assign')
  assign(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: AssignMaintenanceDto) {
    return this.maintenanceService.assign(tenant.companyId, id, dto);
  }

  @Post(':id/start')
  start(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: StartMaintenanceDto) {
    return this.maintenanceService.start(tenant.companyId, id, dto);
  }

  /** Finishes the work and posts its cost. */
  @Post(':id/complete')
  @RequiresAction('record')
  complete(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CompleteMaintenanceDto) {
    return this.maintenanceService.complete(tenant.companyId, id, dto);
  }

  @Post(':id/close')
  @RequiresAction('review')
  close(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CloseMaintenanceDto) {
    return this.maintenanceService.close(tenant.companyId, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CancelMaintenanceDto) {
    return this.maintenanceService.cancel(tenant.companyId, id, dto);
  }

  /** Claims the job under a warranty — or clears the claim if cover was
   * refused. Send `warrantyId: null` to clear. */
  @Patch(':id/warranty')
  @RequiresAction('edit')
  claim(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: ClaimWarrantyDto) {
    return this.maintenanceService.claim(tenant.companyId, id, dto.warrantyId ?? null);
  }
}
