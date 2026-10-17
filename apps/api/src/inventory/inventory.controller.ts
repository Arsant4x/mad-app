import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { IdempotencyExempt, IdempotencyKey, keyedRequest } from '../common/idempotency/idempotency';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MAX_FILE_BYTES } from '../files/files.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateWriteOffDto } from './dto/create-write-off.dto';
import { DeclareStockOpeningDto } from './dto/declare-stock-opening.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { ListWriteOffsQueryDto } from './dto/list-write-offs-query.dto';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { RejectWriteOffDto } from './dto/reject-write-off.dto';
import { InventoryService } from './inventory.service';
import { StockOpeningsService } from './stock-openings.service';
import { WriteOffAttachmentsService } from './write-off-attachments.service';
import { WriteOffsService } from './write-offs.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly writeOffs: WriteOffsService,
    private readonly writeOffAttachments: WriteOffAttachmentsService,
    private readonly stockOpenings: StockOpeningsService,
  ) {}

  // ── ٣٠ الأرصدةُ الافتتاحية بالطبقات (ق-١١٧٧ · ق-١١٧٩) — خادمٌ ومسارٌ بلا شاشة (ق-١١٧٦) ──
  //
  // الإعلانُ بفعل `record` (من يُدخل البضاعة يُعلن رصيدَها)، والإلغاءُ بفعل `delete` كعكس الحركات؛
  // والتقريرُ بـ`view`. والمسارُ الثابت `opening` قبل `opening/:id`.

  /** تقريرُ الافتتاح: الإعلاناتُ مختومةً، وما بلا سندٍ مُعلَناً، وطبقاتُ التسوية القائمة عدّاً خارج المجموع. */
  @Get('opening')
  @RequiresAction('view')
  listOpenings(@CurrentTenant() tenant: TenantContext) {
    return this.stockOpenings.list(tenant.companyId, tenant.allowedBranchIds);
  }

  @Get('opening/:id')
  @RequiresAction('view')
  getOpening(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.stockOpenings.get(tenant.companyId, tenant.allowedBranchIds, id);
  }

  /** الاسمُ يُمرَّر لأن الإعلانَ **يُختم باسم مُعلِنه** وقتَ الفعل لا يُحلّ لاحقاً (كما سجلّ التدقيق). */
  @Post('opening')
  @RequiresAction('record')
  declareOpening(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: DeclareStockOpeningDto, @IdempotencyKey() idempotencyKey: string | undefined) {
    const declarer = { id: tenant.profileId, actorType: tenant.actorType, name: user.username };
    return this.stockOpenings.declare(tenant.companyId, tenant.allowedBranchIds, declarer, dto, keyedRequest(idempotencyKey, 'inventory.opening', tenant, dto));
  }

  /** إلغاءُ سطرٍ — عكسٌ لا محو، ويُرفض بعد استهلاك. */
  @Post('opening/:id/lines/:lineId/void')
  @RequiresAction('delete')
  @IdempotencyExempt('an opening line is voided once; a repeat is refused because the line is already void')
  voidOpeningLine(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('lineId') lineId: string) {
    return this.stockOpenings.voidLine(tenant.companyId, tenant.allowedBranchIds, id, lineId);
  }

  @Get('stock-levels')
  @RequiresAction('view')
  stockLevels(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.inventoryService.stockLevels(tenant.companyId, tenant.allowedBranchIds, query);
  }

  @Get('movements')
  @RequiresAction('view')
  listMovements(@CurrentTenant() tenant: TenantContext, @Query() query: ListMovementsQueryDto) {
    return this.inventoryService.listMovements(tenant.companyId, tenant.allowedBranchIds, query);
  }

  /** ٥+٦ الرصيدُ بالدفعة — المتبقّي لكلِّ (صنفٍ · مستودعٍ · دفعة) من الطبقات، وما لا دفعةَ له مسمًّى (ق-١٠٩٩). */
  @Get('batch-balances')
  @RequiresAction('view')
  batchBalances(@CurrentTenant() tenant: TenantContext, @Query('productId') productId?: string) {
    return this.inventoryService.batchBalances(tenant.companyId, tenant.allowedBranchIds, productId?.trim() || undefined);
  }

  /** Batches expiring within `withinDays` (default 90), already-expired first. */
  @Get('expiring')
  @RequiresAction('view')
  expiring(@CurrentTenant() tenant: TenantContext, @Query('withinDays') withinDays?: string) {
    const days = withinDays ? Math.max(0, parseInt(withinDays, 10) || 0) : 90;
    return this.inventoryService.expiringStock(tenant.companyId, tenant.allowedBranchIds, days);
  }

  /** ㉘ الاستهلاكاتُ المؤقّتة المفتوحة — ما سبق استلامَه ولم يُسوَّ بعد (ق-١٠٦٢). */
  @Get('provisional')
  @RequiresAction('view')
  provisional(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.inventoryService.openProvisional(tenant.companyId, tenant.allowedBranchIds, query);
  }

  /** Record for every movement; one that reduces inventory value (stock out, negative adjustment) also needs review. */
  @Post('movements')
  @RequiresAction('record')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateStockMovementDto, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.inventoryService.create(tenant, dto, keyedRequest(idempotencyKey, 'inventory.movement', tenant, dto));
  }

  /** ㉙ عكسُ الحركة بحركةٍ مقابلة — لا حذف (ق-١٠٦٣): تاريخُ المخزون لا يُمحى. */
  @Post('movements/:id/reverse')
  @RequiresAction('delete')
  @IdempotencyExempt('a movement is reversed once; a repeat is refused because it is already reversed')
  reverse(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.inventoryService.reverse(tenant.companyId, tenant.allowedBranchIds, id);
  }

  // ── واقعات الشطب (`SPEC 30.5` · `30.7`) ────────────────────────────────
  //
  // ⚠️ **القسمة هنا لا في الخدمة**: التسجيل بـ`record` والحسم بـ`review`.
  // فمن يستقبل البضاعة يسجّل ما رآه، **ولا يقرّر إعدامها**. ووضعُ الفصل عند
  // الباب يجعله **قابلاً للقراءة في سطرٍ واحد** لمن يراجع الصلاحيات.

  @Get('write-offs')
  @RequiresAction('view')
  listWriteOffs(@CurrentTenant() tenant: TenantContext, @Query() query: ListWriteOffsQueryDto) {
    return this.writeOffs.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  @Post('write-offs')
  @RequiresAction('record')
  recordWriteOff(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateWriteOffDto, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.writeOffs.create(tenant.companyId, tenant.allowedBranchIds, tenant.profileId, dto, keyedRequest(idempotencyKey, 'inventory.write-off', tenant, dto));
  }

  @Post('write-offs/:id/approve')
  @RequiresAction('review')
  @IdempotencyExempt('a write-off is decided once; a repeat is refused because it is no longer pending')
  approveWriteOff(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Param('id') id: string) {
    // الاسم يُمرَّر لأن الاعتماد الذاتي **يُكتب حدثاً باسم فاعله** — واسمُه
    // يُخزَّن وقت الفعل لا يُحلّ لاحقاً (كما في بقية سجل التدقيق).
    return this.writeOffs.approve(
      tenant.companyId,
      tenant.allowedBranchIds,
      { id: tenant.profileId, actorType: tenant.actorType, name: user.username },
      id,
    );
  }

  @Post('write-offs/:id/reject')
  @RequiresAction('review')
  @IdempotencyExempt('a write-off is decided once; a repeat is refused because it is no longer pending')
  rejectWriteOff(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: RejectWriteOffDto) {
    return this.writeOffs.reject(tenant.companyId, tenant.allowedBranchIds, tenant.profileId, id, dto);
  }

  // ── مرفقات الواقعة — الدليل الذي تطلبه الهيئة إن سألت (`م٤٩/٥`) ────────
  //
  // ⚠️ **المسارات الثابتة قبل ذات المعرّف**: `write-offs/attachments/:id`
  // مكتوبٌ فوق `write-offs/:id/…`، وإلا قرأ Nest كلمة `attachments` معرّفَ
  // واقعة. (نفس ترتيب `purchases` — وهو ترتيبٌ يُخطئ فيه المرء مرّةً واحدة.)

  @Get('write-offs/attachments/:attachmentId/download-url')
  @RequiresAction('view')
  writeOffAttachmentUrl(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string) {
    return this.writeOffAttachments.downloadUrl(tenant.companyId, tenant.allowedBranchIds, attachmentId);
  }

  @Delete('write-offs/attachments/:attachmentId')
  @RequiresAction('record')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeWriteOffAttachment(@CurrentTenant() tenant: TenantContext, @Param('attachmentId') attachmentId: string) {
    return this.writeOffAttachments.remove(tenant.companyId, tenant.allowedBranchIds, attachmentId);
  }

  @Get('write-offs/:id/attachments')
  @RequiresAction('view')
  listWriteOffAttachments(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.writeOffAttachments.list(tenant.companyId, tenant.allowedBranchIds, id);
  }

  /** `record` لا `review`: **من يرى التلف يرفع دليله** — والاعتماد قرارٌ آخر. */
  @Post('write-offs/:id/attachments')
  @RequiresAction('record')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  @IdempotencyExempt('uploads a file to a write-off; it writes no document and no posting')
  addWriteOffAttachment(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.writeOffAttachments.add(tenant.companyId, tenant.allowedBranchIds, id, file);
  }
}
