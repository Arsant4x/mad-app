import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards , Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SetArchivedDto } from '../common/dto/set-archived.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query('includeArchived') includeArchived?: string) {
    return this.employeesService.list(tenant.companyId, tenant.allowedBranchIds, includeArchived === 'true');
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(tenant.companyId, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.employeesService.setArchived(tenant.companyId, id, dto.archived);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.employeesService.remove(tenant.companyId, id);
  }
}
