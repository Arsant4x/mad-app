import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuditCreatedIdAt } from '../audit/audit-entity-from-result.decorator';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { IdempotencyExempt, IdempotencyKey, keyedRequest } from '../common/idempotency/idempotency';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload, TenantContext } from '../auth/types';
import { ConvertQuoteDto } from './dto/convert-quote.dto';
import { InvoicesService } from '../invoices/invoices.service';
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
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.quotesService.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  @Get(':id')
  @RequiresAction('view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.quotesService.findOne(tenant.companyId, tenant.allowedBranchIds, id);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateQuoteDto, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.quotesService.create(tenant.companyId, tenant.allowedBranchIds, dto, keyedRequest(idempotencyKey, 'quotes.create', tenant, dto));
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateQuoteDto) {
    return this.quotesService.update(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.quotesService.remove(tenant.companyId, tenant.allowedBranchIds, id);
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
  constructor(
    private readonly quotesService: QuotesService,
    private readonly invoicesService: InvoicesService,
  ) {}

  @Post(':id/convert')
  @RequiresAction('add')
  @AuditCreatedIdAt('invoice.id')
  @IdempotencyExempt('a quote converts once; a repeat is refused naming the invoice it became')
  async convert(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ConvertQuoteDto,
  ) {
    // ⚖️ **`ON_ACCOUNT` كالفاتورة المباشرة** — **والتصريحُ من نفس الدالّة**،
    //    فلا تفترق القناتان في المنع ولا في التجاوز (`ق-٣٣٨`).
    const credit = await this.invoicesService.creditContextFor(tenant, user.username, dto, 'ON_ACCOUNT');
    return this.quotesService.convert(tenant.companyId, tenant.allowedBranchIds, id, credit);
  }
}
