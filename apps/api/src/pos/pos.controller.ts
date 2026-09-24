import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
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
import { PosCardVerificationsService } from './pos-card-verifications.service';
import { PosPaymentAttemptsService } from './pos-payment-attempts.service';
import { PosService } from './pos.service';

/**
 * شاشة الكاشير — actor: the cashier employee (or the owner), gated by the
 * `pos` screen the owner grants through permission templates. Ringing a sale
 * is `record`; closing a drawer is `review` (it approves the count).
 */
@Controller('pos')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('pos')
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly attempts: PosPaymentAttemptsService,
    private readonly verifications: PosCardVerificationsService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Get('shifts')
  @RequiresAction('view')
  listShifts(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.posService.listShifts(tenant.companyId, tenant.allowedBranchIds, query);
  }

  @Get('shifts/current')
  @RequiresAction('view')
  currentShift(@CurrentTenant() tenant: TenantContext) {
    return this.posService.currentShift(tenant);
  }

  /** وقائعُ الانقطاع المستنتَجة — بمدّتها وعدد فواتيرها وحدّ استنتاجها (`ق-١٩٢`/ج · `ق-٢٠١`). */
  @Get('incidents')
  @RequiresAction('view')
  incidents(@CurrentTenant() tenant: TenantContext) {
    return this.posService.listIncidents(tenant.companyId);
  }

  @Post('shifts')
  @RequiresAction('record')
  openShift(@CurrentTenant() tenant: TenantContext, @Body() dto: OpenShiftDto) {
    return this.posService.openShift(tenant, dto);
  }

  @Post('shifts/:id/close')
  @RequiresAction('review')
  closeShift(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.posService.closeShift(tenant, id, dto);
  }

  /** مزامنة مبيعات الأوفلاين — idempotent: التكرار يعيد نفس الفاتورة. */
  @Post('sales/sync')
  @RequiresAction('record')
  syncSale(@CurrentTenant() tenant: TenantContext, @Body() dto: SyncPosSaleDto) {
    return this.posService.syncSale(tenant, dto);
  }

  @Post('sales')
  @RequiresAction('record')
  createSale(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePosSaleDto) {
    return this.posService.createSale(tenant, dto);
  }

  // ───────── محاولةُ دفع البطاقة (`ق-١٤٠١` · `ق-١٣٩٧` … `ق-١٣٩٩`) ─────────

  /** أفعّالٌ ربطُ بوابة الدفع، وبأيّ مزوّدٍ ومهلة — تقرؤه شاشةُ الكاشير لتختار المسار (بلا مفاتيح). */
  @Get('payment-mode')
  @RequiresAction('view')
  paymentMode(@CurrentTenant() tenant: TenantContext) {
    return this.integrations.gatewayMode(tenant.companyId);
  }

  /** إنشاءُ المحاولة — تحقّقُ البيع ولقطتُه **بلا شحنٍ ولا فاتورة**؛ وإعادتُه بالمعرّف نفسِه تعيدها نفسَها. */
  @Post('payment-attempts')
  @RequiresAction('record')
  createAttempt(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePosPaymentAttemptDto) {
    return this.attempts.create(tenant, dto);
  }

  /** المحاولاتُ المفتوحة (لم تُرسل · تُشحن · معلّقة · مقبولةٌ لم تكتمل) — مرشَّحةً بفروع القارئ. */
  @Get('payment-attempts')
  @RequiresAction('view')
  listAttempts(@CurrentTenant() tenant: TenantContext) {
    return this.attempts.listOpen(tenant);
  }

  @Get('payment-attempts/:id')
  @RequiresAction('view')
  viewAttempt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attempts.view(tenant, id);
  }

  /** الشحنُ خارج كلِّ معاملة بمهلة المحوّل — قُبل ⟸ فاتورة · رُفض ⟸ لا شيء · لا جواب ⟸ معلّقة. */
  @Post('payment-attempts/:id/charge')
  @RequiresAction('record')
  chargeAttempt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attempts.charge(tenant, id);
  }

  /** الحسمُ بجواب المزوّد بالمرجع (`ق-١٣٩٩`: «جوابُ المزوّد أوّلاً») — يطلبه الكاشير ويكنسه النظام. */
  @Post('payment-attempts/:id/resolve')
  @RequiresAction('record')
  resolveAttempt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attempts.resolve(tenant, id);
  }

  /** ⚖️ الحسمُ اليدويّ بدليلٍ لا بقول — **لصاحب صلاحية المراجعة** (`ق-١٣٩٩`)؛ ولا يُعدّ نهائياً حتى تطابقه التسوية. */
  @Post('payment-attempts/:id/resolve-with-evidence')
  @RequiresAction('review')
  resolveAttemptWithEvidence(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: ResolvePaymentAttemptWithEvidenceDto) {
    return this.attempts.resolveWithEvidence(tenant, id, dto);
  }

  /** الإلغاءُ قبل الإرسال وحدَه. */
  @Post('payment-attempts/:id/cancel')
  @RequiresAction('record')
  cancelAttempt(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attempts.cancel(tenant, id);
  }

  /** ⚖️ دفعاتُ البطاقة غيرُ المتحقَّقة (`ق-١٣٩٧`/٢–٣) — باسم الكاشير وبحال المطابقة ومهلة التسوية، **للمراجعة**. */
  @Get('card-verifications')
  @RequiresAction('review')
  cardVerifications(@CurrentTenant() tenant: TenantContext, @Query() query: CardVerificationsQueryDto) {
    return this.verifications.list(tenant, query.state ?? 'open');
  }
}
