import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuditCreatedIdAt } from '../audit/audit-entity-from-result.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateQuoteDto, UpdateQuoteDto } from './dto/quote.dto';
import { QuotesService } from './quotes.service';

/** شاشة عروض الأسعار — يمنحها المالك عبر نماذج الصلاحيات كسائر الشاشات. */
@Controller('quotes')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.quotesService.list(tenant.companyId);
  }

  @Get(':id')
  @RequiresAction('view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.quotesService.findOne(tenant.companyId, id);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateQuoteDto) {
    return this.quotesService.update(tenant.companyId, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.quotesService.remove(tenant.companyId, id);
  }
}

/**
 * التحويل وحده خلف **شاشة الفواتير بفعل إنشاء** (قاعدة الموجز 7): من يحوّل
 * يُنشئ فاتورةً فعلاً، فصلاحية شاشة العروض وحدها لا تكفيه — متحكم مستقل لأن
 * @RequiresScreen يُعلَن على الصنف.
 */
@Controller('quotes')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('invoice')
export class QuoteConversionController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post(':id/convert')
  @RequiresAction('add')
  @AuditCreatedIdAt('invoice.id')
  convert(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.quotesService.convert(tenant.companyId, tenant.allowedBranchIds, id);
  }
}
