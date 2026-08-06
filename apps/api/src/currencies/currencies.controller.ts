import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { UpsertExchangeRateDto } from './dto/upsert-exchange-rate.dto';

/** No @RequiresScreen: the currency list feeds pickers on the invoice and
 * purchase forms, so any tenant actor reads it. Writes are owner-only. */
@Controller('currencies')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.currenciesService.list(tenant.companyId);
  }

  // Declared before ':id' so "rates" is never read as a currency id.
  @Get('rates')
  listRates(@CurrentTenant() tenant: TenantContext, @Query('fromCode') fromCode?: string, @Query('toCode') toCode?: string) {
    return this.currenciesService.listRates(tenant.companyId, fromCode, toCode);
  }

  @Post('rates')
  upsertRate(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertExchangeRateDto) {
    return this.currenciesService.upsertRate(tenant.companyId, tenant.actorType, dto);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCurrencyDto) {
    return this.currenciesService.create(tenant.companyId, tenant.actorType, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCurrencyDto) {
    return this.currenciesService.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.currenciesService.remove(tenant.companyId, tenant.actorType, id);
  }
}
