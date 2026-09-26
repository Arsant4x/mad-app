import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PosPaymentAttempt, PosPaymentAttemptStatus, PosPaymentResolution, Prisma } from '@prisma/client';
import { TenantContext } from '../auth/types';
import { branchFilter } from '../branches/branch-scope.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { money } from '../common/money/text';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { ChargeOutcome, IntegrationsService } from '../integrations/integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePosPaymentAttemptDto, ResolvePaymentAttemptWithEvidenceDto } from './dto/pos.dto';
import { PosService, PreparedSale, SoldSale } from './pos.service';

/**
 * **لقطةُ البيع في المحاولة** — الإصدارُ أوّلاً كي يُقرأ شكلُها إن تغيّر. منها وحدَها تُنشأ الفاتورة عند الإتمام،
 * فلا يفترق ما يُفوتَر عمّا شُحن ولو تغيّر سعرُ الصنف أو فئتُه بين الشحن والإتمام.
 */
interface SaleSnapshot {
  v: 1;
  prepared: Pick<PreparedSale, 'shiftId' | 'shiftBranchId' | 'invoiceDto' | 'paymentMethod' | 'parts' | 'total'>;
  offlineRef: string | null;
}

/** ما لم يُحسم بعد — لا تُقفل مناوبتُه، ويكنسه الكانس. */
const IN_FLIGHT: PosPaymentAttemptStatus[] = ['CHARGING', 'UNKNOWN', 'APPROVED'];
/** ما يُعرض للكاشير «مفتوحاً». */
const OPEN: PosPaymentAttemptStatus[] = ['CREATED', ...IN_FLIGHT];

type Tx = Prisma.TransactionClient;

/**
 * ⭐ **محاولةُ دفع البطاقة — الشحنُ خارج المعاملة، والفاتورةُ بعد القبول** (`ق-١٤٠١` · `ق-١٣٩٧` … `ق-١٣٩٩`).
 *
 * الموجز `docs/موجز-مسار-دفع-الكاشير.md` بحكم المالك:
 * - **الإنشاء** (`CREATED`): تحقّقُ البيع نفسُه (`PosService.prepareSale`) **بلا شحنٍ ولا فاتورة**، ولقطتُه تُحفظ.
 * - **الشحن** (`CHARGING`): انتقالٌ مشروط يُلتزم، **ثم نداءُ المزوّد خارج كلِّ معاملة** بمهلة محوّله (`ق-١٣٩٨`: تسعون ثانية
 *   للتجريبيّ — «تُعلَن في محوّل كلِّ مزوّدٍ لا في النواة»). قُبل ⟸ `APPROVED` ثم الإتمام · رُفض ⟸ `DECLINED` بلا رقم ·
 *   لا جوابَ قاطعاً ⟸ **`UNKNOWN`**.
 * - **الإتمام** (`COMPLETED`): الفاتورةُ وسنداتُها وختمُ `PAID` ومعرّفُ البيع في معاملةٍ واحدة (`completeSaleWithinTx`).
 * - **الحسم** (`ق-١٣٩٩`): **جوابُ المزوّد أوّلاً** (`status` بالمرجع) — **ويدويٌّ بدليلٍ لا بقول**: صاحبُ `pos:review` بإيصال
 *   الجهاز ورمز الموافقة، بعد أن يُسأل المزوّد فلا يُجيب، ويُسجَّل؛ **ولا يُعدّ نهائياً حتى تطابقه التسوية**.
 *   **⛔ ولا زرَّ «اعتبرها مقبولة»** — القيدُ في القاعدة يرفض الحسمَ اليدويّ بلا مرجعٍ ورمز.
 *
 * **كلُّ انتقالٍ كتابةٌ مشروطةٌ بالحالة السابقة** (`updateMany … where status`): نقرتان لا تشحنان مرّتين، والإتمامُ لا يقع مرّتين.
 */
@Injectable()
export class PosPaymentAttemptsService {
  private readonly logger = new Logger(PosPaymentAttemptsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly pos: PosService,
  ) {}

  /**
   * **الإنشاء — بلا شحنٍ ولا فاتورة** · وإعادةُ الطلب بالمعرّف نفسِه تعيد المحاولةَ نفسَها.
   * **على مستوى المنشأة بحقّها**: المحاولةُ على مناوبة الكاشير المفتوحة — مفتاحُها هويّتُه كالبيع (`prepareSale`).
   */
  async create(tenant: TenantContext, dto: CreatePosPaymentAttemptDto) {
    try {
      return await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
        const existing = await tx.posPaymentAttempt.findFirst({ where: { clientSaleId: dto.clientSaleId } });
        if (existing) return present(existing);
        const recorded = await tx.invoice.findFirst({ where: { clientSaleId: dto.clientSaleId }, select: { id: true } });
        if (recorded) throw new ConflictException(MSG.pos_attempt_sale_recorded);

        const gateway = await this.integrations.activeGateway(tx);
        if (!gateway) throw new ConflictException(MSG.pos_attempt_requires_gateway);
        const prepared = await this.pos.prepareSale(tx, tenant, dto, { ringAt: dto.ringAt, ringOffsetMin: dto.ringOffsetMin });
        if (prepared.cardAmount <= 0) throw new BadRequestException(MSG.pos_attempt_needs_card);
        if (prepared.cardParts > 1) throw new BadRequestException(MSG.pos_card_single_part);

        // عملةُ المستند هي عملةُ أساس المنشأة (لا عملةَ صريحة في بيع الكاشير) — لا حرفَ عملةٍ في الشحن (`§3.8`).
        const company = await tx.company.findUniqueOrThrow({ where: { id: tenant.companyId }, select: { baseCurrency: true } });
        const snapshot: SaleSnapshot = {
          v: 1,
          prepared: {
            shiftId: prepared.shiftId,
            shiftBranchId: prepared.shiftBranchId,
            invoiceDto: prepared.invoiceDto,
            paymentMethod: prepared.paymentMethod,
            parts: prepared.parts,
            total: prepared.total,
          },
          offlineRef: dto.offlineRef ?? null,
        };
        const created = await tx.posPaymentAttempt.create({
          data: {
            clientSaleId: dto.clientSaleId,
            shiftId: prepared.shiftId,
            sale: snapshot as unknown as Prisma.InputJsonValue,
            cardAmount: prepared.cardAmount,
            currency: company.baseCurrency,
            provider: gateway.provider,
            createdById: tenant.profileId,
          } as unknown as Prisma.PosPaymentAttemptUncheckedCreateInput,
        });
        return present(created);
      });
    } catch (e) {
      // طلبان متزامنان بالمعرّف نفسِه: الخاسرُ يقرأ محاولةَ الرابح — ولا يفرّق المستدعي بينهما.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) => tx.posPaymentAttempt.findFirst({ where: { clientSaleId: dto.clientSaleId } }));
        if (winner) return present(winner);
      }
      throw e;
    }
  }

  /**
   * ⭐ **الشحن — انتقالٌ مشروط يُلتزم، ثم نداءُ المزوّد خارج كلِّ معاملة** (`ق-١٤٠١`).
   * نقرةٌ ثانية أو إعادةٌ بعد انقطاع الردّ تقرأ الحالَ كما هو ولا تشحن ثانيةً.
   */
  async charge(tenant: TenantContext, id: string) {
    const claim = await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const attempt = await this.readOwn(tx, tenant, id);
      if (attempt.status !== 'CREATED') return null;
      const shift = await tx.posShift.findUnique({ where: { id: attempt.shiftId }, select: { status: true } });
      if (shift?.status !== 'OPEN') throw new ConflictException(MSG.pos_shift_closed);
      const gateway = await this.integrations.activeGateway(tx);
      if (!gateway || gateway.provider !== attempt.provider) throw new ConflictException(formatMessage(MSG.pos_attempt_gateway_changed, { provider: attempt.provider }));
      const { count } = await tx.posPaymentAttempt.updateMany({ where: { id, status: 'CREATED' }, data: { status: 'CHARGING', chargeStartedAt: new Date() } });
      return count === 1 ? attempt : null;
    });
    if (!claim) return this.view(tenant, id);

    const outcome = await this.integrations.chargeWithDeadline(tenant.companyId, claim.provider, {
      reference: claim.id,
      amount: Number(claim.cardAmount),
      currency: claim.currency,
    });
    if (outcome.kind === 'NOT_SENT') {
      // لم يُرسل شيءٌ للمزوّد — فلا مالَ في الطريق: تعود المحاولةُ إلى ما قبل الإرسال ويظهر السبب.
      await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
        tx.posPaymentAttempt.updateMany({ where: { id, status: 'CHARGING' }, data: { status: 'CREATED', chargeStartedAt: null } }),
      );
      throw outcome.error;
    }
    await this.apply(tenant.companyId, id, ['CHARGING'], outcome, 'PROVIDER_CHARGE');
    return this.settleAndView(tenant, id);
  }

  /**
   * ⭐ **الحسمُ بجواب المزوّد** (`ق-١٣٩٩`: «جوابُ المزوّد أوّلاً»): المقبولةُ التي لم تكتمل تُتمّ · المعلّقةُ — أو التي بقيت
   * «تُشحن» بعد مهلة محوّلها (عمليةٌ انقطعت) — يُسأل عنها المزوّدُ بمرجعها: قُبلت ⟸ إتمامٌ بلا شحنٍ ثانٍ · رُفضت ⟸ رفض ·
   * لا أثرَ لها بعد المهلة ⟸ رفض (الطلبُ لم يبلغه) · لا جوابَ ⟸ **تبقى معلّقة**: «تُحسم ولا تُخمَّن».
   */
  async resolve(tenant: TenantContext, id: string) {
    const attempt = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) => this.readVisible(tx, tenant, id));
    await this.resolveByProvider(tenant.companyId, attempt);
    return this.settleAndView(tenant, id);
  }

  /**
   * ⚖️ **الحسمُ اليدويّ — بدليلٍ لا بقول** (`ق-١٣٩٩`).
   *
   * صاحبُ `pos:review` (الحارسُ في المتحكّم) **بمرجع إيصال الجهاز ورمز الموافقة**، ويُسجَّل مَن حسم ومتى. **والمزوّدُ يُسأل
   * أوّلاً**: إن أجاب فجوابُه يحسمها لا الدليل. **ولا يُعدّ نهائياً حتى تطالب به تسويةُ الشبكة** — صفُّ البطاقة
   * `MANUAL_EVIDENCE`، وما لم يُطابَق بعد مهلة التسوية يُرفع للمراجعة باسم الكاشير.
   */
  async resolveWithEvidence(tenant: TenantContext, id: string, dto: ResolvePaymentAttemptWithEvidenceDto) {
    const attempt = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) => this.readVisible(tx, tenant, id));
    if (!this.awaitsAnswer(attempt)) throw new ConflictException(MSG.pos_attempt_manual_requires_unknown);

    const answered = await this.resolveByProvider(tenant.companyId, attempt);
    if (answered) return this.settleAndView(tenant, id);

    await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const resolvedByName = await this.pos.actorName(tx, tenant);
      const { count } = await tx.posPaymentAttempt.updateMany({
        where: { id, status: { in: ['UNKNOWN', 'CHARGING'] } },
        data: {
          status: 'APPROVED',
          resolution: 'MANUAL_EVIDENCE',
          resolvedAt: new Date(),
          resolvedById: tenant.profileId,
          resolvedByName,
          evidenceDeviceReference: dto.deviceReference.trim(),
          evidenceApprovalCode: dto.approvalCode.trim(),
          evidenceNote: dto.note?.trim() || null,
          approvalCode: dto.approvalCode.trim(),
        },
      });
      if (count === 0) throw new ConflictException(MSG.pos_attempt_manual_requires_unknown);
    });
    return this.settleAndView(tenant, id);
  }

  /** **الإلغاءُ قبل الإرسال وحدَه** — ما أُرسل لا يُلغى: المالُ قد يكون في الطريق. */
  async cancel(tenant: TenantContext, id: string) {
    await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const attempt = await this.readOwn(tx, tenant, id);
      const { count } = await tx.posPaymentAttempt.updateMany({
        where: { id, status: 'CREATED' },
        data: { status: 'CANCELLED', resolution: 'CANCELLED', resolvedAt: new Date() },
      });
      if (count === 0) throw new ConflictException(formatMessage(MSG.pos_attempt_not_cancellable, { status: attempt.status }));
    });
    return this.view(tenant, id);
  }

  /**
   * **المحاولةُ بحالها** — وإيصالُ بيعها إن اكتملت.
   * **على مستوى المنشأة بحقّها**: تُقرأ مرشَّحةً بفروع القارئ عبر فرع مناوبتها (`readVisible`).
   */
  async view(tenant: TenantContext, id: string) {
    const attempt = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) => this.readVisible(tx, tenant, id));
    const sale = attempt.invoiceId ? await this.pos.receiptFor(tenant.companyId, attempt.invoiceId) : null;
    return { ...present(attempt), sale };
  }

  /**
   * المحاولاتُ **المفتوحة** (لم تُرسل · تُشحن · معلّقة · مقبولةٌ لم تكتمل) — للكاشير في شاشته ولمن يراجع.
   * **على مستوى المنشأة بحقّها**: مرشَّحةٌ بفروع القارئ عبر فرع المناوبة، والأحدثُ أوّلاً بسقف.
   */
  listOpen(tenant: TenantContext) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const rows = await tx.posPaymentAttempt.findMany({
        where: { status: { in: OPEN }, shift: branchFilter(tenant.allowedBranchIds) as Prisma.PosShiftWhereInput },
        include: { shift: { select: { openedByName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return rows.map((r) => ({ ...present(r), cashierName: r.shift.openedByName }));
    });
  }

  /**
   * ⭐ **الكانسُ الدوريّ** (الموجز ٢.٣/٤): لكلِّ معلّقةٍ ومقبولةٍ لم تكتمل وما بقي «يُشحن» بعد مهلته (عمليةٌ ماتت في
   * منتصفها) — جوابُ المزوّد بالمرجع أو الإتمام. **فاعلُه النظام**: بلا قائمة فروع، والمنشآتُ واحدةً واحدة في سياقها.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepAllCompanies(): Promise<{ companies: number; settled: number }> {
    // العميلُ غيرُ المقيَّد عمداً: هذا الموضعُ يعبر المستأجرين ليدخل سياقَ كلٍّ.
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    let settled = 0;
    for (const c of companies) {
      try {
        settled += await this.sweepCompany(c.id);
      } catch (e) {
        this.logger.error(`كنسُ محاولات الدفع أخفق للمنشأة ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
    }
    if (settled > 0) this.logger.log(`محاولاتُ الدفع: حُسم ${settled} عبر ${companies.length} منشأة`);
    return { companies: companies.length, settled };
  }

  /** كنسُ منشأةٍ واحدة — يعيد عددَ ما انتهى (حُسم أو اكتمل) في هذه الدورة. */
  async sweepCompany(companyId: string): Promise<number> {
    const pending = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.posPaymentAttempt.findMany({ where: { status: { in: IN_FLIGHT } } }));
    let settled = 0;
    for (const attempt of pending) {
      await this.resolveByProvider(companyId, attempt);
      // الإتمامُ بلا إيصال: لا كاشيرَ ينتظره — والختمُ والإبلاغُ في الطابور كأيّ فاتورة (حدثُ الإصدار في معاملتها).
      await retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, (tx) => this.settle(tx, companyId, 'all', attempt.id)));
      const after = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.posPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id }, select: { status: true } }));
      if (after.status === 'COMPLETED' || after.status === 'DECLINED') settled += 1;
    }
    return settled;
  }

  // ───────────────────────────────── داخليّ ─────────────────────────────────

  /**
   * يسأل المزوّدَ عن محاولةٍ تنتظر جواباً ويطبّق جوابَه — ويعيد `true` إن أجاب جواباً قاطعاً.
   * المقبولةُ التي لم تكتمل لا تُسأل عنها (قُبلت) — يكفيها الإتمام.
   */
  private async resolveByProvider(companyId: string, attempt: PosPaymentAttempt): Promise<boolean> {
    if (!this.awaitsAnswer(attempt)) return false;
    const answer = await this.integrations.queryStatus(companyId, attempt.provider, attempt.id);
    const from: PosPaymentAttemptStatus[] = ['UNKNOWN', 'CHARGING'];
    if (answer.state === 'APPROVED') {
      await this.apply(companyId, attempt.id, from, { kind: 'APPROVED', providerRef: answer.providerRef ?? attempt.id, approvalCode: answer.approvalCode ?? null }, 'PROVIDER_STATUS');
      return true;
    }
    if (answer.state === 'DECLINED') {
      await this.apply(companyId, attempt.id, from, { kind: 'DECLINED', reason: answer.declineReason ?? null }, 'PROVIDER_STATUS');
      return true;
    }
    // «لا أثر» جوابٌ بعد انقضاء مهلة الشحن وحدَها: الطلبُ لم يبلغ المزوّد — وقبلها قد يكون في الطريق.
    if (answer.state === 'NOT_FOUND' && this.deadlinePassed(attempt)) {
      await this.apply(companyId, attempt.id, from, { kind: 'DECLINED', reason: 'لا أثرَ للعملية لدى المزوّد — لم تبلغه' }, 'PROVIDER_STATUS');
      return true;
    }
    // لا جوابَ قاطعاً: تبقى معلّقة — و«تُشحن» بعد مهلتها تصير معلّقةً مسمّاة.
    const detail = answer.unreachable ? `تعذّر سؤالُ المزوّد: ${answer.unreachable}` : `جوابُ المزوّد: ${answer.state}`;
    await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.posPaymentAttempt.updateMany({ where: { id: attempt.id, status: { in: from } }, data: { status: 'UNKNOWN', detail } }),
    );
    return false;
  }

  /** تنتظر جواباً: معلّقة، أو «تُشحن» وقد انقضت مهلةُ محوّلها (عمليةٌ ماتت في منتصفها). */
  private awaitsAnswer(attempt: PosPaymentAttempt): boolean {
    return attempt.status === 'UNKNOWN' || (attempt.status === 'CHARGING' && this.deadlinePassed(attempt));
  }

  private deadlinePassed(attempt: PosPaymentAttempt): boolean {
    if (!attempt.chargeStartedAt) return false;
    return Date.now() - attempt.chargeStartedAt.getTime() >= this.integrations.deadlineOf(attempt.provider);
  }

  /** يطبّق نتيجةً على محاولةٍ في حالٍ متوقَّع — كتابةٌ مشروطة، فمن سبق إليها غلب. */
  private async apply(companyId: string, id: string, from: PosPaymentAttemptStatus[], outcome: Exclude<ChargeOutcome, { kind: 'NOT_SENT' }>, resolution: PosPaymentResolution) {
    const now = new Date();
    const data: Prisma.PosPaymentAttemptUpdateManyMutationInput =
      outcome.kind === 'APPROVED'
        ? { status: 'APPROVED', providerRef: outcome.providerRef, approvalCode: outcome.approvalCode, resolution, resolvedAt: now, detail: null }
        : outcome.kind === 'DECLINED'
          ? { status: 'DECLINED', declineReason: outcome.reason, resolution, resolvedAt: now, detail: null }
          : { status: 'UNKNOWN', detail: outcome.detail };
    await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.posPaymentAttempt.updateMany({ where: { id, status: { in: from } }, data }));
  }

  /**
   * بعد أيّ انتقال: المقبولةُ تُتمّ، ثم يُقرأ الحالُ بإيصاله.
   *
   * 🔴 **وإيصالُ البيع الذي أُتمّ في هذا الطلب هو ناتجُ `finishReceipt` نفسُه** (`ق-١٤٤٧`) — كان يُرمى ويُقرأ الإيصالُ من جديد،
   * **فضاع تقريرُ الخصم** (تنبيهُ الرصيد السالب صفةُ لحظة الإتمام لا يُعاد بناؤه) **وضاعت نتيجةُ الختم**. وبوّابةُ الإجازة
   * صارت في بانيّ الإيصال الواحد فتحملها القراءةُ اللاحقة أيضاً.
   */
  private async settleAndView(tenant: TenantContext, id: string) {
    const sold = await retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) => this.settle(tx, tenant.companyId, tenant.allowedBranchIds, id)));
    const finished = sold ? await this.pos.finishReceipt(tenant.companyId, sold) : null;
    const viewed = await this.view(tenant, id);
    return finished ? { ...viewed, sale: finished } : viewed;
  }

  /**
   * ⭐ **الإتمام** (`APPROVED ⟸ COMPLETED`): الفاتورةُ من لقطة المحاولة، في معاملةٍ واحدة مع انتقال المحاولة — إتمامان
   * متزامنان لا يُنتجان فاتورتين: الخاسرُ يسقط على الانتقال المشروط فتُرجَع معاملتُه كلُّها.
   */
  private async settle(tx: Tx, companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<SoldSale | null> {
    const attempt = await tx.posPaymentAttempt.findUniqueOrThrow({ where: { id } });
    if (attempt.status !== 'APPROVED') return null;
    const snapshot = attempt.sale as unknown as SaleSnapshot;
    const manual = attempt.resolution === 'MANUAL_EVIDENCE';
    const sold = await this.pos.completeSaleWithinTx(tx, {
      companyId,
      allowedBranchIds,
      prepared: snapshot.prepared,
      clientSaleId: attempt.clientSaleId,
      offlineRef: snapshot.offlineRef ?? undefined,
      card: manual
        ? { verification: 'MANUAL_EVIDENCE', deviceReference: attempt.evidenceDeviceReference, approvalCode: attempt.evidenceApprovalCode, attemptId: id }
        : { verification: 'PROVIDER_APPROVED', providerRef: attempt.providerRef, approvalCode: attempt.approvalCode, attemptId: id },
      trustLineTax: true,
      expectedTotal: snapshot.prepared.total,
    });
    const { count } = await tx.posPaymentAttempt.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'COMPLETED', invoiceId: sold.id } });
    if (count !== 1) throw new ConflictException(formatMessage(MSG.pos_attempt_not_resolvable, { status: attempt.status }));
    return sold;
  }

  /** محاولةٌ يشحنها أو يلغيها صاحبُها — والمالكُ لمن ترك مناوبةً مفتوحة. */
  private async readOwn(tx: Tx, tenant: TenantContext, id: string): Promise<PosPaymentAttempt> {
    const attempt = await tx.posPaymentAttempt.findUnique({ where: { id } });
    if (!attempt) throw new NotFoundException(MSG.pos_attempt_not_found);
    if (attempt.createdById !== tenant.profileId && tenant.actorType !== 'COMPANY') {
      // ق-١٤٤٠: محاولةُ غيره على مناوبةٍ خارج فروعه لا وجودَ لها عنده — `404` (`readVisible`) قبل `403` الملكيّة (ومحاولتُه هو بعد نقله قرارٌ معلَّق للمالك لا يُمسّ).
      await this.readVisible(tx, tenant, id);
      throw new ForbiddenException(MSG.pos_attempt_not_yours);
    }
    return attempt;
  }

  /** محاولةٌ يراها القارئ — بفرع مناوبتها على فروعه، **ومحجوبُ الفرع `404` لا `403`** فلا يُكشف وجودُه. */
  private async readVisible(tx: Tx, tenant: TenantContext, id: string): Promise<PosPaymentAttempt> {
    const attempt = await tx.posPaymentAttempt.findFirst({ where: { id, shift: branchFilter(tenant.allowedBranchIds) as Prisma.PosShiftWhereInput } });
    if (!attempt) throw new NotFoundException(MSG.pos_attempt_not_found);
    return attempt;
  }
}

/** الشكلُ الخارج — المالُ نصّاً بخانتين (`ق-١٢٣٥`)، ولا لقطةَ البيع كاملةً (تبقى في الخادم). */
function present(a: PosPaymentAttempt) {
  const snapshot = a.sale as unknown as SaleSnapshot | null;
  return {
    id: a.id,
    status: a.status,
    clientSaleId: a.clientSaleId,
    shiftId: a.shiftId,
    cardAmount: money(a.cardAmount),
    total: snapshot ? money(snapshot.prepared.total) : null,
    paymentMethod: snapshot?.prepared.paymentMethod ?? null,
    currency: a.currency,
    provider: a.provider,
    providerRef: a.providerRef,
    approvalCode: a.approvalCode,
    declineReason: a.declineReason,
    detail: a.detail,
    invoiceId: a.invoiceId,
    chargeStartedAt: a.chargeStartedAt,
    resolvedAt: a.resolvedAt,
    resolution: a.resolution,
    resolvedByName: a.resolvedByName,
    evidence: a.resolution === 'MANUAL_EVIDENCE' ? { deviceReference: a.evidenceDeviceReference, approvalCode: a.evidenceApprovalCode, note: a.evidenceNote } : null,
    createdAt: a.createdAt,
  };
}
