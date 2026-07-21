import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CompanyUsersService } from './company-users.service';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { UpdateCompanyUserDto } from './dto/update-company-user.dto';

@Controller('company-users')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CompanyUsersController {
  constructor(private readonly companyUsersService: CompanyUsersService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.companyUsersService.list(tenant.companyId, tenant.actorType);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCompanyUserDto) {
    return this.companyUsersService.create(tenant.companyId, tenant.actorType, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCompanyUserDto) {
    return this.companyUsersService.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.companyUsersService.remove(tenant.companyId, tenant.actorType, id);
  }
}
