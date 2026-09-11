import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateLeaveRequestDto, CreateLeaveTypeDto, DecideLeaveRequestDto, UpdateLeaveTypeDto } from './dto/leave.dto';
import { LeavesService } from './leaves.service';

/** Leave management lives under the HR (employees) screen — whoever manages
 * staff manages their leave. */
@Controller('leaves')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('employees')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  // ---- Types ----
  @Get('types')
  @RequiresAction('view')
  listTypes(@CurrentTenant() tenant: TenantContext) {
    return this.leavesService.listTypes(tenant.companyId);
  }

  @Post('types')
  @RequiresAction('add')
  createType(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateLeaveTypeDto) {
    return this.leavesService.createType(tenant.companyId, dto);
  }

  @Patch('types/:id')
  @RequiresAction('edit')
  updateType(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leavesService.updateType(tenant.companyId, id, dto);
  }

  @Delete('types/:id')
  @RequiresAction('delete')
  @HttpCode(204)
  removeType(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.leavesService.removeType(tenant.companyId, id);
  }

  // ---- Requests ----
  @Get('requests')
  @RequiresAction('view')
  listRequests(@CurrentTenant() tenant: TenantContext, @Query('employeeId') employeeId?: string, @Query('status') status?: string) {
    return this.leavesService.listRequests(tenant.companyId, employeeId, status);
  }

  // ⭐ **الفاعلُ يُمرَّر عند التقديم وعند القرار** (`ق-٦٢١`): الطرفان اللذان
  //    يُقارَنان، **واسمُه يُخزَّن وقتَ الفعل لا يُحلّ لاحقاً** — كما في الشطب.
  @Post('requests')
  @RequiresAction('add')
  createRequest(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateLeaveRequestDto) {
    return this.leavesService.createRequest(tenant.companyId, { id: tenant.profileId, actorType: tenant.actorType, name: user.username }, dto);
  }

  @Post('requests/:id/approve')
  @RequiresAction('review')
  approve(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DecideLeaveRequestDto) {
    return this.leavesService.decide(tenant.companyId, { id: tenant.profileId, actorType: tenant.actorType, name: user.username }, id, 'APPROVED', dto.note);
  }

  @Post('requests/:id/reject')
  @RequiresAction('review')
  reject(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DecideLeaveRequestDto) {
    return this.leavesService.decide(tenant.companyId, { id: tenant.profileId, actorType: tenant.actorType, name: user.username }, id, 'REJECTED', dto.note);
  }

  @Delete('requests/:id')
  @RequiresAction('delete')
  @HttpCode(204)
  removeRequest(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.leavesService.remove(tenant.companyId, id);
  }

  // ---- Balance ----
  @Get('balance')
  @RequiresAction('view')
  balance(@CurrentTenant() tenant: TenantContext, @Query('employeeId') employeeId: string, @Query('year') year?: string) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.leavesService.balance(tenant.companyId, employeeId, y);
  }
}
