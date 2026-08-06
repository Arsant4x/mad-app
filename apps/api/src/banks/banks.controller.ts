import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { BanksService } from './banks.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';

@Controller('banks')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.banksService.list(tenant.companyId, tenant.allowedBranchIds);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateBankDto) {
    return this.banksService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateBankDto) {
    return this.banksService.update(tenant.companyId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.banksService.remove(tenant.companyId, id);
  }
}
