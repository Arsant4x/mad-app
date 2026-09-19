import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateSupplierNoteDto } from './dto/create-supplier-note.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchasesService } from './purchases.service';
import { PurchaseAttachmentsService } from './purchase-attachments.service';
import { SupplierNotesService } from './supplier-notes.service';
import { MAX_FILE_BYTES } from '../files/files.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('suppliers')
export class PurchasesController {
  constructor(
    private readonly purchasesService: PurchasesService,
    private readonly attachments: PurchaseAttachmentsService,
    private readonly supplierNotes: SupplierNotesService,
    private readonly receipts: GoodsReceiptsService,
  ) {}

  // ---- ٢٥ الاستلامُ المستقلّ (`ق-١١٣١`) — الفاعل: مالكُ المنشأة وموظّفوه على شاشة المشتريات ----

  /** حارسُ الرصيد: ما بقي في وسيط الاستلام من المستندات مطابَقاً بالدفتر. Static route — before `:id`. */
  @Get('receipts/reconciliation')
  @RequiresAction('view')
  receiptsReconciliation(@CurrentTenant() tenant: TenantContext) {
    return this.receipts.reconciliation(tenant.companyId);
  }

  @Get(':id/receipts')
  @RequiresAction('view')
  listReceipts(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.receipts.listForPurchase(tenant.companyId, tenant.allowedBranchIds, id);
  }

  /** استلامٌ مسجَّل — جزئيٌّ أو مكمِّل — بفعل «تسجيل» كسائر وقائع التشغيل. */
  @Post(':id/receipts')
  @RequiresAction('record')
  recordReceipt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CreateGoodsReceiptDto) {
    return this.receipts.record(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /** إلغاءُ استلامٍ — عكسٌ لا محو، ولا يُلغى ما استُهلك منه. */
  @Delete(':id/receipts/:receiptId')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  voidReceipt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('receiptId') receiptId: string) {
    return this.receipts.voidReceipt(tenant.companyId, tenant.allowedBranchIds, id, receiptId);
  }

  // ---- إشعاراتُ المورّد (`ق-١٠٠٦`) — مستندُه يُسجَّل على شرائه، وقيدُه قيدُنا ----

  @Post(':id/supplier-credit-note')
  @RequiresAction('add')
  supplierCreditNote(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CreateSupplierNoteDto) {
    return this.supplierNotes.issueCreditNote(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  @Post(':id/supplier-debit-note')
  @RequiresAction('add')
  supplierDebitNote(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CreateSupplierNoteDto) {
    return this.supplierNotes.issueDebitNote(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /** تقرير مصاريف التأسيس. Declared before the plain list so the router never
   * reads "incorporation-report" as anything else. */
  @Get('incorporation-report')
  @RequiresAction('view')
  incorporationReport(@CurrentTenant() tenant: TenantContext) {
    return this.purchasesService.incorporationReport(tenant.companyId);
  }

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.purchasesService.list(tenant.companyId, tenant.allowedBranchIds);
  }

  // ---- Attachments (مستند فاتورة المصروف: صورة/PDF) — مستند §5 ----
  // Static routes before :id-based ones so the router never reads
  // "attachments" as a purchase id.

  @Get('attachments/:attachmentId/download-url')
  @RequiresAction('view')
  attachmentDownloadUrl(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string) {
    return this.attachments.downloadUrl(tenant.companyId, attachmentId);
  }

  @Delete('attachments/:attachmentId')
  @RequiresAction('delete')
  @HttpCode(204)
  removeAttachment(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string) {
    return this.attachments.remove(tenant.companyId, attachmentId);
  }

  @Get(':purchaseId/attachments')
  @RequiresAction('view')
  listAttachments(@CurrentTenant() tenant: TenantContext, @Param('purchaseId') purchaseId: string) {
    return this.attachments.list(tenant.companyId, purchaseId);
  }

  @Post(':purchaseId/attachments')
  @RequiresAction('add')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  addAttachment(@CurrentTenant() tenant: TenantContext, @Param('purchaseId') purchaseId: string, @UploadedFile() file: Express.Multer.File) {
    return this.attachments.add(tenant.companyId, purchaseId, file);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchasesService.update(tenant.companyId, id, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.purchasesService.remove(tenant.companyId, id);
  }
}
