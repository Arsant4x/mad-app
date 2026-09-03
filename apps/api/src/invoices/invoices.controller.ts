import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { AuditEntityFromResult } from '../audit/audit-entity-from-result.decorator';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
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

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(tenant.companyId, tenant.allowedBranchIds, dto);
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
