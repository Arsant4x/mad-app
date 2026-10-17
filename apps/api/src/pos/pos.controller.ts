import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { IdempotencyExempt, IdempotencyKey } from '../common/idempotency/idempotency';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  CardVerificationsQueryDto,
  CloseShiftDto,
  CreatePosPaymentAttemptDto,
  CreatePosSaleDto,
  OpenShiftDto,
  ResolvePaymentAttemptWithEvidenceDto,
  SyncPosSaleDto,
} from './dto/pos.dto';
import {
  PagedPosShiftResponse,
  PosCardVerificationListResponse,
  PosClosedShiftResponse,
  PosCurrentShiftResponse,
  PosIncidentsResponse,
  PosOpenPaymentAttemptResponse,
  PosPaymentAttemptResponse,
  PosPaymentAttemptWithSaleResponse,
  PosPaymentModeResponse,
  PosSaleResponse,
  PosShiftResponse,
  PosShiftWithTotalsResponse,
  PosStockDeductedResponse,
  PosStockSkippedResponse,
  PosSyncedSaleResponse,
} from './dto/pos-responses.dto';
import { PosCardVerificationsService } from './pos-card-verifications.service';
import { PosPaymentAttemptsService } from './pos-payment-attempts.service';
import { PosService } from './pos.service';

/**
 * شاشة الكاشير — actor: the cashier employee (or the owner), gated by the
 * `pos` screen the owner grants through permission templates. Ringing a sale
 * is `record`; closing a drawer is `review` (it approves the count).
 *
 * ⚖️ **كلُّ مسارٍ يعلن ردَّه صنفاً مسمّىً** (`ق-١٤٣٨` · خطّةُ الأنواع ④) — `dto/pos-responses.dto.ts`، ويطابقه حارسُ الصدق الحيّ.
 * والأصنافُ المشار إليها بـ`getSchemaPath` (القائمةُ والمناوبةُ الحالية وفرعا الخصم) تُسجَّل هنا كي توجد في الوثيقة.
 */
@Controller('pos')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('pos')
@ApiExtraModels(PosShiftWithTotalsResponse, PagedPosShiftResponse, PosStockDeductedResponse, PosStockSkippedResponse)
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly attempts: PosPaymentAttemptsService,
    private readonly verifications: PosCardVerificationsService,
    private readonly integrations: IntegrationsService,
  ) {}

  // `pagedFindMany`: مصفوفةٌ بلا `?page`، ومغلَّفٌ مرقَّمٌ به — فالردُّ أحدُهما.
  @Get('shifts')
  @RequiresAction('view')
  @ApiOkResponse({
    schema: { oneOf: [{ type: 'array', items: { $ref: getSchemaPath(PosShiftWithTotalsResponse) } }, { $ref: getSchemaPath(PagedPosShiftResponse) }] },
  })
  listShifts(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.posService.listShifts(tenant.companyId, tenant.allowedBranchIds, query);
  }

  // ⚖️ `ق-١٤٤٩`: مغلَّفةً صراحةً `{ shift: null }` — كان `null` يُرسَل جسماً فارغاً (`ExpressAdapter.reply`) فيقرؤه كلُّ قارئٍ بحاله.
  @Get('shifts/current')
  @RequiresAction('view')
  @ApiOkResponse({ type: PosCurrentShiftResponse })
  async currentShift(@CurrentTenant() tenant: TenantContext): Promise<{ shift: Awaited<ReturnType<PosService['currentShift']>> }> {
    return { shift: await this.posService.currentShift(tenant) };
  }

  /** وقائعُ الانقطاع المستنتَجة — بمدّتها وعدد فواتيرها وحدّ استنتاجها (`ق-١٩٢`/ج · `ق-٢٠١`). */
  @Get('incidents')
  @RequiresAction('view')
  @ApiOkResponse({ type: PosIncidentsResponse })
  incidents(@CurrentTenant() tenant: TenantContext) {
    return this.posService.listIncidents(tenant.companyId, tenant.allowedBranchIds);
  }

  @Post('shifts')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: PosShiftResponse })
  @IdempotencyExempt('a cashier has one open shift; a repeat is refused while it is open')
  openShift(@CurrentTenant() tenant: TenantContext, @Body() dto: OpenShiftDto) {
    return this.posService.openShift(tenant, dto);
  }

  @Post('shifts/:id/close')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: PosClosedShiftResponse })
  @IdempotencyExempt('a shift closes once; a repeat is refused because it is closed')
  closeShift(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.posService.closeShift(tenant, id, dto);
  }

  /** مزامنة مبيعات الأوفلاين — idempotent: التكرار يعيد نفس الفاتورة. */
  @Post('sales/sync')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: PosSyncedSaleResponse })
  @IdempotencyExempt('keyed by the terminal sale id in the body: the same sale answers with its invoice, another is refused')
  syncSale(@CurrentTenant() tenant: TenantContext, @Body() dto: SyncPosSaleDto) {
    return this.posService.syncSale(tenant, dto);
  }

  @Post('sales')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: PosSaleResponse })
  createSale(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePosSaleDto, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.posService.createSale(tenant, dto, idempotencyKey);
  }

  // ───────── محاولةُ دفع البطاقة (`ق-١٤٠١` · `ق-١٣٩٧` … `ق-١٣٩٩`) ─────────

  /** أفعّالٌ ربطُ بوابة الدفع، وبأيّ مزوّدٍ ومهلة — تقرؤه شاشةُ الكاشير لتختار المسار (بلا مفاتيح). */
  @Get('payment-mode')
  @RequiresAction('view')
  @ApiOkResponse({ type: PosPaymentModeResponse })
  paymentMode(@CurrentTenant() tenant: TenantContext) {
    return this.integrations.gatewayMode(tenant.companyId);
  }

  /** إنشاءُ المحاولة — تحقّقُ البيع ولقطتُه **بلا شحنٍ ولا فاتورة**؛ وإعادتُه بالمعرّف نفسِه تعيدها نفسَها. */
  @Post('payment-attempts')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: PosPaymentAttemptResponse })
  @IdempotencyExempt('keyed by the terminal sale id in the body; a repeat answers with the same attempt')
  createAttempt(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePosPaymentAttemptDto) {
    return this.attempts.create(tenant, dto);
  }

  /** المحاولاتُ المفتوحة (لم تُرسل · تُشحن · معلّقة · مقبولةٌ لم تكتمل) — مرشَّحةً بفروع القارئ. */
  @Get('payment-attempts')
  @RequiresAction('view')
  @ApiOkResponse({ type: PosOpenPaymentAttemptResponse, isArray: true })
  listAttempts(@CurrentTenant() tenant: TenantContext) {
    return this.attempts.listOpen(tenant);
  }

  @Get('payment-attempts/:id')
  @RequiresAction('view')
  @ApiOkResponse({ type: PosPaymentAttemptWithSaleResponse })
  viewAttempt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attempts.view(tenant, id);
  }

  /** الشحنُ خارج كلِّ معاملة بمهلة المحوّل — قُبل ⟸ فاتورة · رُفض ⟸ لا شيء · لا جواب ⟸ معلّقة. */
  @Post('payment-attempts/:id/charge')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: PosPaymentAttemptWithSaleResponse })
  @IdempotencyExempt('a conditional state change; a repeat reads the attempt as it is and charges nothing')
  chargeAttempt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attempts.charge(tenant, id);
  }

  /** الحسمُ بجواب المزوّد بالمرجع (`ق-١٣٩٩`: «جوابُ المزوّد أوّلاً») — يطلبه الكاشير ويكنسه النظام. */
  @Post('payment-attempts/:id/resolve')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: PosPaymentAttemptWithSaleResponse })
  @IdempotencyExempt('a conditional state change on an unanswered attempt; a repeat finds it answered')
  resolveAttempt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attempts.resolve(tenant, id);
  }

  /** ⚖️ الحسمُ اليدويّ بدليلٍ لا بقول — **لصاحب صلاحية المراجعة** (`ق-١٣٩٩`)؛ ولا يُعدّ نهائياً حتى تطابقه التسوية. */
  @Post('payment-attempts/:id/resolve-with-evidence')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: PosPaymentAttemptWithSaleResponse })
  @IdempotencyExempt('a conditional state change on an unanswered attempt; a repeat is refused once it is answered')
  resolveAttemptWithEvidence(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: ResolvePaymentAttemptWithEvidenceDto) {
    return this.attempts.resolveWithEvidence(tenant, id, dto);
  }

  /** الإلغاءُ قبل الإرسال وحدَه. */
  @Post('payment-attempts/:id/cancel')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: PosPaymentAttemptWithSaleResponse })
  @IdempotencyExempt('cancels an attempt before it is sent; a repeat is refused because it is no longer cancellable')
  cancelAttempt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attempts.cancel(tenant, id);
  }

  /** ⚖️ دفعاتُ البطاقة غيرُ المتحقَّقة (`ق-١٣٩٧`/٢–٣) — باسم الكاشير وبحال المطابقة ومهلة التسوية، **للمراجعة**. */
  @Get('card-verifications')
  @RequiresAction('review')
  @ApiOkResponse({ type: PosCardVerificationListResponse })
  cardVerifications(@CurrentTenant() tenant: TenantContext, @Query() query: CardVerificationsQueryDto) {
    return this.verifications.list(tenant, query.state ?? 'open');
  }
}
