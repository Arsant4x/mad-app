import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MAX_FILE_BYTES } from '../files/files.service';
import { ContractAttachmentsService } from './contract-attachments.service';
import { ClaimAttachmentsService } from './claim-attachments.service';
import { HandoverPhotosService } from './handover-photos.service';
import { ContractsService } from './contracts.service';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { CreateClaimDto, PayClaimDto, WaiveClaimDto } from './dto/claim.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { ListContractsQueryDto } from './dto/list-contracts-query.dto';
import { CreateHandoverDto, SignHandoverDto, UpdateHandoverDto } from './dto/handover.dto';
import { RecordKeyMoneyDto } from './dto/key-money.dto';
import { RecordDepositDto, SettleDepositDto } from './dto/deposit.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly attachments: ContractAttachmentsService,
    private readonly claimAttachments: ClaimAttachmentsService,
    private readonly handoverPhotos: HandoverPhotosService,
  ) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListContractsQueryDto) {
    return this.contractsService.list(tenant.companyId, query);
  }

  // ---- Attachments (signed lease PDFs, annexes, clearance letters) ----
  // The static `attachments/...` routes are declared before `:id`-based ones so
  // the router never reads "attachments" as a contract id.

  @Get('attachments/:attachmentId/download-url')
  @RequiresAction('view')
  attachmentDownloadUrl(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string) {
    return this.attachments.downloadUrl(tenant.companyId, attachmentId);
  }

  /**
   * ⚖️ ق-١٣٦٥ — **التنزيلُ عبر الخادم يفكّ ويبثّ** (لا رابطَ موقَّعاً لمرفق عقد). بنوعه واسمه، ولا يُخزَّن في وسيطٍ ولا متصفّح
   * (`no-store`) — فالمفكوكُ لا يبقى في نسخةٍ خارج المخزن.
   */
  @Get('attachments/:attachmentId/download')
  @RequiresAction('view')
  async downloadAttachment(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.attachments.download(tenant.companyId, attachmentId);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      length: file.buffer.length,
      disposition: `attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    });
  }

  @Delete('attachments/:attachmentId')
  @RequiresAction('delete')
  @HttpCode(204)
  removeAttachment(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string) {
    return this.attachments.remove(tenant.companyId, attachmentId);
  }

  // مرفقات المطالبات — نمط مرفقات العقد نفسه (احتياجات §11).
  @Get('claim-attachments/:attachmentId/download-url')
  @RequiresAction('view')
  claimAttachmentUrl(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string) {
    return this.claimAttachments.downloadUrl(tenant.companyId, attachmentId);
  }

  @Delete('claim-attachments/:attachmentId')
  @RequiresAction('delete')
  removeClaimAttachment(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string) {
    return this.claimAttachments.remove(tenant.companyId, attachmentId);
  }

  @Get('claims/:claimId/attachments')
  @RequiresAction('view')
  listClaimAttachments(@CurrentTenant() tenant: TenantContext, @Param('claimId') claimId: string) {
    return this.claimAttachments.list(tenant.companyId, claimId);
  }

  @Post('claims/:claimId/attachments')
  @RequiresAction('add')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  addClaimAttachment(@CurrentTenant() tenant: TenantContext, @Param('claimId') claimId: string, @UploadedFile() file: Express.Multer.File) {
    return this.claimAttachments.add(tenant.companyId, claimId, file);
  }

  // صور نماذج الاستلام/التسليم — تُقفل مع النموذج بعد التوقيع (16.15).
  @Get('handover-photos/:photoId/download-url')
  @RequiresAction('view')
  handoverPhotoUrl(@CurrentTenant() tenant: TenantContext, @Param('photoId') photoId: string) {
    return this.handoverPhotos.downloadUrl(tenant.companyId, photoId);
  }

  @Delete('handover-photos/:photoId')
  @RequiresAction('delete')
  removeHandoverPhoto(@CurrentTenant() tenant: TenantContext, @Param('photoId') photoId: string) {
    return this.handoverPhotos.remove(tenant.companyId, photoId);
  }

  @Get('handovers/:handoverId/photos')
  @RequiresAction('view')
  listHandoverPhotos(@CurrentTenant() tenant: TenantContext, @Param('handoverId') handoverId: string) {
    return this.handoverPhotos.list(tenant.companyId, handoverId);
  }

  @Post('handovers/:handoverId/photos')
  @RequiresAction('add')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  addHandoverPhoto(
    @CurrentTenant() tenant: TenantContext,
    @Param('handoverId') handoverId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('itemId') itemId?: string,
    @Body('note') note?: string,
  ) {
    return this.handoverPhotos.add(tenant.companyId, handoverId, file, { itemId: itemId || undefined, note: note || undefined });
  }

  @Get(':contractId/attachments')
  @RequiresAction('view')
  listAttachments(@CurrentTenant() tenant: TenantContext, @Param('contractId') contractId: string) {
    return this.attachments.list(tenant.companyId, contractId);
  }

  @Post(':contractId/attachments')
  @RequiresAction('add')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  addAttachment(@CurrentTenant() tenant: TenantContext, @Param('contractId') contractId: string, @UploadedFile() file: Express.Multer.File) {
    return this.attachments.add(tenant.companyId, contractId, file);
  }

  @Get(':id')
  @RequiresAction('view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.contractsService.findOne(tenant.companyId, id);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateContractDto) {
    return this.contractsService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(tenant.companyId, id, dto);
  }

  @Post(':id/cancel')
  @RequiresAction('delete')
  cancel(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CancelContractDto) {
    return this.contractsService.cancel(tenant.companyId, id, dto);
  }

  /** Creates the next lease and links it back to this one. */
  @Post(':id/renew')
  @RequiresAction('add')
  renew(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: RenewContractDto) {
    return this.contractsService.renew(tenant.companyId, id, dto);
  }

  /** The condition-of-unit form. Draft until signed, immutable after. */
  @Post(':id/handovers')
  @RequiresAction('add')
  createHandover(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CreateHandoverDto) {
    return this.contractsService.createHandover(tenant.companyId, id, dto);
  }

  @Patch(':id/handovers/:handoverId')
  @RequiresAction('edit')
  updateHandover(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('handoverId') handoverId: string,
    @Body() dto: UpdateHandoverDto,
  ) {
    return this.contractsService.updateHandover(tenant.companyId, id, handoverId, dto);
  }

  /** Freezes the form, with a server-side timestamp. */
  @Post(':id/handovers/:handoverId/sign')
  @RequiresAction('review')
  signHandover(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('handoverId') handoverId: string,
    @Body() dto: SignHandoverDto,
  ) {
    return this.contractsService.signHandover(tenant.companyId, id, handoverId, dto);
  }

  @Delete(':id/handovers/:handoverId')
  @RequiresAction('delete')
  deleteHandover(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('handoverId') handoverId: string) {
    return this.contractsService.deleteHandover(tenant.companyId, id, handoverId);
  }

  /** التقبيل — the lump sum for the right to a commercial location. */
  @Post(':id/key-money')
  @RequiresAction('record')
  recordKeyMoney(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: RecordKeyMoneyDto) {
    return this.contractsService.recordKeyMoney(tenant.companyId, id, dto);
  }

  /** A demand on the tenant outside the rent schedule — posted as a receivable
   * the moment it is raised. */
  @Post(':id/claims')
  @RequiresAction('add')
  createClaim(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CreateClaimDto) {
    return this.contractsService.createClaim(tenant.companyId, id, dto);
  }

  @Post(':id/claims/:claimId/pay')
  @RequiresAction('record')
  payClaim(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('claimId') claimId: string, @Body() dto: PayClaimDto) {
    return this.contractsService.payClaim(tenant.companyId, id, claimId, dto);
  }

  /** Writes the claim off, reversing the income it recognized. */
  @Post(':id/claims/:claimId/waive')
  @RequiresAction('review')
  waiveClaim(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('claimId') claimId: string, @Body() dto: WaiveClaimDto) {
    return this.contractsService.waiveClaim(tenant.companyId, id, claimId, dto);
  }

  /** Money received and held on the tenant's behalf — posted as a liability,
   * never as revenue. */
  @Post(':id/deposits')
  @RequiresAction('record')
  recordDeposit(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: RecordDepositDto) {
    return this.contractsService.recordDeposit(tenant.companyId, id, dto);
  }

  /** Closes the deposit out: itemized deductions, remainder refunded. */
  @Post(':id/deposits/:depositId/settle')
  @RequiresAction('review')
  settleDeposit(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('depositId') depositId: string,
    @Body() dto: SettleDepositDto,
  ) {
    return this.contractsService.settleDeposit(tenant.companyId, id, depositId, dto);
  }

  @Post(':id/payments')
  @RequiresAction('record')
  recordPayment(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.contractsService.recordPayment(tenant.companyId, id, dto);
  }
}
