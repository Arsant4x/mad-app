import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { IdempotencyExempt } from '../common/idempotency/idempotency';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CompanyWideFigures } from '../common/tenant/company-wide-figures.decorator';
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
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.accountsService.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  /** مجموعُ الأرصدة لكل نوع — في الخادم لا في الشاشة (`ق-١٢٤٣`). */
  @Get('summary')
  @RequiresAction('view')
  @CompanyWideFigures('مجموعُ أرصدة الدليل كلِّه لكل نوع: أرصدةُ المنشأة كلِّها لا أرصدةُ فرع')
  summary(@CurrentTenant() tenant: TenantContext) {
    return this.accountsService.summary(tenant.companyId);
  }

  @Post()
  @RequiresAction('add')
  @IdempotencyExempt('an account code is unique in the chart; a repeat is refused naming the code')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(tenant.companyId, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.accountsService.remove(tenant.companyId, id);
  }
}
