import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { TenantContext } from '../auth/types';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.accountsService.list(tenant.companyId);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(tenant.companyId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.accountsService.remove(tenant.companyId, id);
  }
}
