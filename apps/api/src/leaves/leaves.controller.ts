import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
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
  listTypes(@CurrentTenant() tenant: TenantContext) {
    return this.leavesService.listTypes(tenant.companyId);
  }

  @Post('types')
  createType(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateLeaveTypeDto) {
    return this.leavesService.createType(tenant.companyId, dto);
  }

  @Patch('types/:id')
  updateType(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leavesService.updateType(tenant.companyId, id, dto);
  }

  @Delete('types/:id')
  @HttpCode(204)
  removeType(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.leavesService.removeType(tenant.companyId, id);
  }

  // ---- Requests ----
  @Get('requests')
  listRequests(@CurrentTenant() tenant: TenantContext, @Query('employeeId') employeeId?: string, @Query('status') status?: string) {
    return this.leavesService.listRequests(tenant.companyId, employeeId, status);
  }

  @Post('requests')
  createRequest(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateLeaveRequestDto) {
    return this.leavesService.createRequest(tenant.companyId, dto);
  }

  @Post('requests/:id/approve')
  approve(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: DecideLeaveRequestDto) {
    return this.leavesService.decide(tenant.companyId, id, 'APPROVED', dto.note);
  }

  @Post('requests/:id/reject')
  reject(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: DecideLeaveRequestDto) {
    return this.leavesService.decide(tenant.companyId, id, 'REJECTED', dto.note);
  }

  @Delete('requests/:id')
  @HttpCode(204)
  removeRequest(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.leavesService.remove(tenant.companyId, id);
  }

  // ---- Balance ----
  @Get('balance')
  balance(@CurrentTenant() tenant: TenantContext, @Query('employeeId') employeeId: string, @Query('year') year?: string) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.leavesService.balance(tenant.companyId, employeeId, y);
  }
}
