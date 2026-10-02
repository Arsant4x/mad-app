import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload, TenantContext } from '../auth/types';
import { AuditEntityFromResult } from '../audit/audit-entity-from-result.decorator';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { IssueReplacementDto } from './dto/issue-replacement.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('invoice')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.invoicesService.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  /**
   * ⚖️ **تسليمُ الفاتورة القياسية** (`ق-١٥٠٦`/١ و٤): نسختُها المجازة من الهيئة ملفَّ XML باسمه النظاميّ — والتنزيلُ
   * من الشاشة قناتُها الآن، والبريدُ حين يعمل. **وقبل الإجازة لا شيء** (`409` مسمّى): لا تُسلَّم نسختُنا مكانَها.
   * و`no-store`: مستندٌ ضريبيٌّ لطرفٍ ثالث لا يبقى في ذاكرةٍ وسيطة.
   */
  @Get(':id/cleared-xml')
  @RequiresAction('view')
  @ApiProduces('application/xml')
  @ApiOkResponse({ description: 'النسخةُ المجازة من الهيئة — مستندُ UBL كما أعادته، باسم الملف النظاميّ في Content-Disposition', schema: { type: 'string' } })
  async clearedXml(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { fileName, xml } = await this.invoicesService.clearedXml(tenant.companyId, tenant.allowedBranchIds, id);
    const body = Buffer.from(xml, 'utf8');
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(body, { type: 'application/xml; charset=utf-8', length: body.length, disposition: `attachment; filename="${fileName}"` });
  }

  /** ④A1: مستنداتُ الدفعة المقدَّمة (386) غيرُ المطبَّقة لعميلٍ — ما تعرضه شاشةُ الفاتورة لتطبيقه عند إصدار التوريد. */
  @Get('open-prepayments/:customerId')
  @RequiresAction('view')
  openPrepayments(@CurrentTenant() tenant: TenantContext, @Param('customerId') customerId: string) {
    return this.invoicesService.openPrepayments(tenant.companyId, tenant.allowedBranchIds, customerId);
  }

  /**
   * ⚖️ **الفاتورةُ المباشرة تفتح ذمّةً — فتُصرَّح `ON_ACCOUNT`** (`ق-٣٣٨`).
   *
   * والاسمُ يُمرَّر لأن التجاوز **يُكتب حدثاً باسم فاعله**، **واسمُه يُخزَّن
   * وقتَ الفعل لا يُحلّ لاحقاً** — كما في بقية سجل التدقيق.
   */
  @Post()
  @RequiresAction('add')
  async create(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    const credit = await this.invoicesService.creditContextFor(tenant, user.username, dto, 'ON_ACCOUNT');
    return this.invoicesService.create(tenant.companyId, tenant.allowedBranchIds, dto, credit);
  }

  /** Issues a ZATCA 381 credit note against this invoice — gated by 'add'
   * (it creates a new document) rather than 'edit' (the original is never
   * modified). */
  @Post(':id/credit-note')
  @RequiresAction('add')
  @AuditEntityFromResult()
  issueCreditNote(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CreateCreditNoteDto) {
    return this.invoicesService.issueCreditNote(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /** Issues a ZATCA 383 debit note — additional billing against this
   * invoice. Same 'add' gating rationale as the credit note. */
  @Post(':id/debit-note')
  @RequiresAction('add')
  @AuditEntityFromResult()
  issueDebitNote(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CreateDebitNoteDto) {
    return this.invoicesService.issueDebitNote(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /**
   * ⚖️ **بدلٌ عن مردودة** (`ق-٩٥٨`): مستندٌ جديدٌ بعدّادٍ وتجزئةٍ جديدَين يحلّ محلَّ فاتورةٍ
   * ردّتها الهيئة، والمردودةُ تُغلق ولا تُمسّ. بوّابتُه `add` كالإشعارَين (يُنشئ مستنداً)،
   * والفاعلُ يُمرَّر لأن نقلَ المقبوض يُكتب حدثاً باسمه (`ق-٩٦٦`).
   */
  @Post(':id/replacement')
  @RequiresAction('add')
  @AuditEntityFromResult()
  issueReplacement(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: IssueReplacementDto) {
    return this.invoicesService.issueReplacement(tenant, user.username, id, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoicesService.update(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.invoicesService.remove(tenant.companyId, tenant.allowedBranchIds, id);
  }
}
