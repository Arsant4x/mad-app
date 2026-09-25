import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards , Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SetArchivedDto } from '../common/dto/set-archived.dto';
import { ArchivablePagedQueryDto } from '../common/dto/archivable-paged-query.dto';
import { NoAudit } from '../audit/no-audit.decorator';
import { CreateEmployeeDto, FindByNationalIdDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { EmployeesService } from './employees.service';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { MSG } from '../common/i18n/messages';

@Controller('employees')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ArchivablePagedQueryDto) {
    return this.employeesService.list(tenant.companyId, tenant.allowedBranchIds, query.includeArchived === 'true', query);
  }

  /**
   * ⚖️ `ق-١٣٤٥` البحثُ برقم الهويّة ببصمته — الرقمُ في الجسم لا في المسار ولا في الاستعلام (فلا يُكتب في سجلّات الوصول)،
   * **وقراءةٌ لا تغيير** فلا يُسجَّل في أثر التدقيق كأنه تعديل.
   */
  @Post('find-by-national-id')
  @HttpCode(HttpStatus.OK)
  @RequiresAction('view')
  @NoAudit()
  findByNationalId(@CurrentTenant() tenant: TenantContext, @Body() dto: FindByNationalIdDto) {
    return this.employeesService.findByNationalId(tenant.companyId, tenant.allowedBranchIds, dto.nationalId);
  }

  /** ⚖️ `ق-١٣٤٥` التفصيل — الحقولُ الحسّاسة مفكوكةً لمن يملك الاطّلاع، في فروعه. والقائمةُ لا تحملها. */
  @Get(':id')
  @RequiresAction('view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.employeesService.findOne(tenant.companyId, tenant.allowedBranchIds, id);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.employeesService.setArchived(tenant.companyId, tenant.allowedBranchIds, id, dto.archived);
  }

  /** ⚖️ نقلُ الموظّف إلى فرعٍ آخر للقادم (`ق-١٤١٥`) — والفرعُ السابق شرطٌ في الجسم وأثرٌ في سجلّ التدقيق. */
  @Post(':id/transfer')
  @RequiresAction('edit')
  @OwnerOnly(MSG.employee_transfer_forbidden)
  transfer(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: TransferEmployeeDto) {
    return this.employeesService.transfer(tenant.companyId, tenant.actorType, tenant.allowedBranchIds, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.employeesService.remove(tenant.companyId, tenant.allowedBranchIds, id);
  }
}
