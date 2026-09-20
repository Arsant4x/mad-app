import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { ListRatesQueryDto } from './dto/list-rates-query.dto';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { UpsertExchangeRateDto } from './dto/upsert-exchange-rate.dto';

/** No @RequiresScreen: the currency list feeds pickers on the invoice and
 * purchase forms, so any tenant actor reads it. Writes are owner-only —
 * declared on each write (`@OwnerOnly`, enforced in the guard) and asserted
 * again in the service (`ق-١١٩٨`/①). */
@Controller('currencies')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('قائمةُ العملات وأسعارُها تغذّي منتقيات الفاتورة والشراء لكلّ فاعل — والكتابةُ للمالك وحدَه')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.currenciesService.list(tenant.companyId, query);
  }

  // Declared before ':id' so "rates" is never read as a currency id.
  @Get('rates')
  listRates(@CurrentTenant() tenant: TenantContext, @Query() query: ListRatesQueryDto) {
    return this.currenciesService.listRates(tenant.companyId, query.fromCode, query.toCode, query);
  }

  @Post('rates')
  @OwnerOnly()
  upsertRate(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertExchangeRateDto) {
    return this.currenciesService.upsertRate(tenant.companyId, tenant.actorType, dto);
  }

  @Post()
  @OwnerOnly()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCurrencyDto) {
    return this.currenciesService.create(tenant.companyId, tenant.actorType, dto);
  }

  @Patch(':id')
  @OwnerOnly()
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCurrencyDto) {
    return this.currenciesService.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.currenciesService.remove(tenant.companyId, tenant.actorType, id);
  }
}
