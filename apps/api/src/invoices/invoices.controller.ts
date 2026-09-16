import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload, TenantContext } from '../auth/types';
import { AuditEntityFromResult } from '../audit/audit-entity-from-result.decorator';
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
  list(@CurrentTenant() tenant: TenantContext) {
    return this.invoicesService.list(tenant.companyId, tenant.allowedBranchIds);
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
    return this.invoicesService.update(tenant.companyId, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.invoicesService.remove(tenant.companyId, id);
  }
}
