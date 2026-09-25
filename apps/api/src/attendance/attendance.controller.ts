import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RecordAttendanceDto, UpdateAttendanceDto } from './dto/attendance.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { AttendanceService } from './attendance.service';

/** Lives under the HR (employees) screen, like leaves — whoever manages staff
 * manages their attendance sheet. */
@Controller('attendance')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('employees')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListAttendanceQueryDto) {
    return this.attendanceService.list(tenant.companyId, query);
  }

  /** Recording presence is an operational posting — `record`, not `add`. */
  @Post()
  @RequiresAction('record')
  record(@CurrentTenant() tenant: TenantContext, @Body() dto: RecordAttendanceDto) {
    return this.attendanceService.record(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.update(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(204)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attendanceService.remove(tenant.companyId, tenant.allowedBranchIds, id);
  }
}
