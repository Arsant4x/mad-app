import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchasesService } from './purchases.service';
import { PurchaseAttachmentsService } from './purchase-attachments.service';
import { MAX_FILE_BYTES } from '../files/files.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('suppliers')
export class PurchasesController {
  constructor(
    private readonly purchasesService: PurchasesService,
    private readonly attachments: PurchaseAttachmentsService,
  ) {}

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
