import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ApiCreatedResponse } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { BranchResponse } from './dto/branch-responses.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

/** No @RequiresScreen: the branch list feeds the branch picker on other
 * screens, so any tenant actor needs to read it. Who may *change* branches is
 * declared on each write (`@OwnerOnly`, enforced in the guard) and asserted
 * again in the service (`ق-١١٩٨`/①). */
@Controller('branches')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('قائمةُ الفروع تغذّي منتقي الفرع في كلّ شاشة، مصفّاةً بفروع القارئ — والكتابةُ للمالك وحدَه')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.branchesService.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  @Post()
  @OwnerOnly()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(tenant.companyId, tenant.actorType, dto);
  }

  @Patch(':id')
  @OwnerOnly()
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.branchesService.remove(tenant.companyId, tenant.actorType, id);
  }

  /** ⚖️ `ق-١٤٥٣` — الإغلاق: لا مستندَ جديدٌ فيه، ويبقى في التقارير والتاريخ. */
  @Post(':id/close')
  @OwnerOnly()
  @ApiCreatedResponse({ type: BranchResponse })
  close(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.branchesService.close(tenant.companyId, tenant.actorType, id);
  }

  /** ⚖️ `ق-١٤٥٣` — إعادةُ الفتح بيد المالك. */
  @Post(':id/reopen')
  @OwnerOnly()
  @ApiCreatedResponse({ type: BranchResponse })
  reopen(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.branchesService.reopen(tenant.companyId, tenant.actorType, id);
  }
}
