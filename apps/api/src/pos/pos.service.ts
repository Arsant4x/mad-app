import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../auth/types';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { computeTotals, InvoicesService } from '../invoices/invoices.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { formatMessage } from '../common/i18n/messages';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { FulfilmentResult } from '../invoices/sale-fulfilment.util';
import { CloseShiftDto, CreatePosSaleDto, OpenShiftDto, PosSaleLineDto, SyncPosSaleDto } from './dto/pos.dto';
import { round2 } from '../common/money/rounding';
import { localDateOf } from '../common/wall-clock.util';
import { ZatcaService } from '../zatca/zatca.service';

/** KSA standard VAT — the cashier rings retail lines at the standard rate,
 * matching the invoice screen's default. */
const POS_TAX_RATE = 15;

/** اسم عميل المرور الافتراضي — created once per company, then reused. */
const WALK_IN_CUSTOMER = 'عميل نقدي';

/**
 * تقرير خصم المخزون المرفق بردّ البيع (معلوماتي فقط — الرصيد نفسه يبقى
 * مشتقاً من دفتر الحركات وحده، قاعدة 11: لا حالة موازية).
 *
 * `deducted: false` هو سلوك التراجع الصريح، لا عطلاً: وردية بلا فرع، أو فرع
 * بلا مستودع مربوط، أو سلة كلها بنود غير مخزنية — البيع يمضي والخصم يُتخطى.
 */
export type StockDeductionReport =
  | {
      deducted: true;
      warehouseId: string;
      /** عدد حركات OUT المُنشأة (حركة لكل بند مخزني). */
      movements: number;
      /** بنود هبط رصيدها تحت الصفر — تحذير ناعم لا مانع، كسياسة المخزون القائمة. */
      belowZero: { productId: string; resultingQty: number }[];
    }
  | { deducted: false; reason: 'NO_BRANCH_WAREHOUSE' | 'NO_TRACKED_PRODUCTS' };

/**
 * يترجم تقرير التسليم (`م٦`) إلى شكل التقرير الذي يعرفه الكاشير.
 *
 * ⚠️ **والشكل يبقى كما هو عمداً**: الخصم انتقل مالكُه من الكاشير إلى سطر
 * الفاتورة، **وهذا تغييرٌ داخليّ لا يخصّ من يقرأ الردّ**. فمن غيّر الشكل مع
 * المالك أجبر كل واجهةٍ على تتبّع إعادة تنظيمٍ لا تعنيها.
 */
function toDeductionReport(f: FulfilmentResult | undefined): StockDeductionReport {
  if (!f || !f.fulfilled) {
    return { deducted: false, reason: f?.reason === 'NO_TRACKED_PRODUCTS' ? 'NO_TRACKED_PRODUCTS' : 'NO_BRANCH_WAREHOUSE' };
  }
  return { deducted: true, warehouseId: f.warehouseId, movements: f.movements, belowZero: f.belowZero };
}

export interface ShiftTotals {
  salesCount: number;
  cashTotal: number;
  cardTotal: number;
  /** openingFloat + cashTotal — what should be in the drawer. */
  expectedCash: number;
}

/**
 * الكاشير (مستند §6، النسخة الأولى — أونلاين): مناوبات + بيع يُسجَّل كفاتورة
 * حقيقية مدفوعة.
 *
 * A POS sale is not a parallel document type: it goes through
 * InvoicesService.create — same numbering chain, same VAT math, same ledger
 * auto-posting — then gets stamped PAID onto the open shift. The drawer's
 * expected cash is *derived* from those invoices, never accumulated in a
 * mutable counter that could drift.
 */
@Injectable()
export class PosService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly integrationsService: IntegrationsService,
    private readonly zatca: ZatcaService,
  ) {}

  openShift(tenant: TenantContext, dto: OpenShiftDto) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      // One open drawer per cashier: a second float with the first still open
      // is how cash goes missing between counts.
      const open = await tx.posShift.findFirst({ where: { status: 'OPEN', openedById: tenant.profileId } });
      if (open) throw new ConflictException(MSG.pos_shift_already_open);

      if (dto.branchId) {
        const branch = await tx.branch.findUnique({ where: { id: dto.branchId } });
        if (!branch) throw new NotFoundException(MSG.branch_not_found);
      }

      return tx.posShift.create({
        data: {
          branchId: dto.branchId,
          openedById: tenant.profileId,
          openedByName: await this.actorName(tx, tenant),
          openingFloat: dto.openingFloat,
        } as unknown as Prisma.PosShiftUncheckedCreateInput,
      });
    });
  }

  /** The caller's open shift with live drawer math — null when none is open. */
  currentShift(tenant: TenantContext) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const shift = await tx.posShift.findFirst({ where: { status: 'OPEN', openedById: tenant.profileId } });
      if (!shift) return null;
      return { ...shift, ...(await this.totalsFor(tx, shift.id, Number(shift.openingFloat))) };
    });
  }

  listShifts(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const shifts = await tx.posShift.findMany({ orderBy: { openedAt: 'desc' } });
      return Promise.all(shifts.map(async (s) => ({ ...s, ...(await this.totalsFor(tx, s.id, Number(s.openingFloat))) })));
    });
  }

  closeShift(tenant: TenantContext, id: string, dto: CloseShiftDto) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const shift = await tx.posShift.findUnique({ where: { id } });
      if (!shift) throw new NotFoundException(MSG.pos_shift_not_found);
      if (shift.status === 'CLOSED') throw new ConflictException(MSG.pos_shift_closed);
      // A cashier closes their own drawer; the owner can close anyone's
      // (an employee who left with a shift still open must not wedge it).
      if (shift.openedById !== tenant.profileId && tenant.actorType !== 'COMPANY') {
        throw new ForbiddenException(MSG.pos_not_your_shift);
      }

      const totals = await this.totalsFor(tx, shift.id, Number(shift.openingFloat));
      const closed = await tx.posShift.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), declaredClosing: dto.declaredClosing, notes: dto.notes },
      });
      return {
        ...closed,
        ...totals,
        /** موجب = زيادة في الدرج، سالب = عجز. */
        variance: round2(dto.declaredClosing - totals.expectedCash),
      };
    });
  }

  /** بيع كاشير: فاتورة حقيقية (ترقيم/ضريبة/قيد) تُختم مدفوعةً على المناوبة. */
  createSale(tenant: TenantContext, dto: CreatePosSaleDto) {
    return this.ring(tenant, dto, { ringAt: dto.ringAt, ringOffsetMin: dto.ringOffsetMin });
  }

  /**
   * مزامنة بيع سُجّل أوفلاين (مستند §6 v2) — idempotent بمعرّف الطرفية:
   * resending the same clientSaleId returns the SAME invoice, never a copy.
   * The real invoice number is assigned HERE, centrally — two terminals that
   * sold offline at the same moment can therefore never collide on numbering,
   * which is exactly the conflict the requirements doc flags.
   */
  async syncSale(tenant: TenantContext, dto: SyncPosSaleDto) {
    const existing = await this.findByClientSaleId(tenant.companyId, dto.clientSaleId);
    if (existing) return this.withReceiptQr(tenant.companyId, existing);
    try {
      return await this.ring(tenant, dto, {
        clientSaleId: dto.clientSaleId,
        offlineRef: dto.offlineRef,
        ringAt: dto.ringAt,
        ringOffsetMin: dto.ringOffsetMin,
        // بيع أوفلاين أُخذت بطاقته على الجهاز وقت الانقطاع — لا نعيد تمريرها
        // عند المزامنة؛ البوابة تُستشار في البيع الحي فقط.
        viaSync: true,
      });
    } catch (e) {
      // Two terminals racing the same clientSaleId: the loser reads the
      // winner's row — the caller cannot tell the difference, by design.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.findByClientSaleId(tenant.companyId, dto.clientSaleId);
        if (winner) return this.withReceiptQr(tenant.companyId, winner);
      }
      throw e;
    }
  }

  private findByClientSaleId(companyId: string, clientSaleId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findFirst({ where: { clientSaleId }, include: { lines: true, customer: true, posPayments: true } }),
    );
  }

  private async ring(
    tenant: TenantContext,
    dto: CreatePosSaleDto,
    opts: { clientSaleId?: string; offlineRef?: string; ringAt?: string; ringOffsetMin?: number; viaSync?: boolean },
  ) {
    const { shiftId, shiftBranchId, branchWarehouseId, invoiceDto, providerRef } = await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const shift = await tx.posShift.findFirst({ where: { status: 'OPEN', openedById: tenant.profileId } });
      if (!shift) throw new ConflictException(MSG.pos_no_open_shift);

      // مستودع الخصم = مستودع فرع الوردية (Branch.warehouseId) — قاعدة 6.8:
      // لكل فرع مخزونه. وردية بلا فرع أو فرع بلا مستودع ⇒ لا خصم (تراجع صريح).
      const branchWarehouseId = shift.branchId
        ? ((await tx.branch.findUnique({ where: { id: shift.branchId }, select: { warehouseId: true } }))?.warehouseId ?? null)
        : null;

      const ids = dto.lines.map((l) => l.productId);
      const products = await tx.product.findMany({ where: { id: { in: ids } } });
      const byId = new Map(products.map((p) => [p.id, p]));
      const missing = ids.find((id) => !byId.has(id));
      if (missing) throw new NotFoundException(MSG.product_not_found);

      const customerId = dto.customerId ?? (await this.walkInCustomerId(tx));
      /**
       * ⭐ **يومُ الفاتورة يومُ الجهاز، لا يومُ UTC ولا يومُ عودة الشبكة** (`ق-١٨٥`).
       *
       * كان يُشتقّ من `toISOString().slice(0, 10)` — تاريخُ UTC — فبيعٌ في الواحدة
       * صباحاً بتوقيت الرياض يُؤرَّخ **أمس**، وبيعٌ أوفلاين يُزامَن بعد يوم يُبلَّغ
       * بتاريخٍ خارج نافذة الـ٢٤ ساعة **ونحن من صنعها**. الآن: اللحظة من الجهاز
       * (`ringAt`) وانحرافُه معها، فيُحسب يومُه؛ وتُحفظ اللحظةُ والانحراف لمستند
       * الهيئة. طرفيةٌ لم تُرسل انحرافاً (عميلٌ أقدم) تُعامَل كما كانت: يومُ UTC
       * بلا وقتٍ معلوم — حدٌّ معلَن لا تخمين.
       */
      const rungAt = opts.ringAt ? new Date(opts.ringAt) : new Date();
      const offsetKnown = opts.ringAt !== undefined && opts.ringOffsetMin !== undefined;
      const issueDate = localDateOf(rungAt, offsetKnown ? opts.ringOffsetMin! : 0);
      const invoiceDto = {
        customerId,
        issueDate,
        issuedAt: offsetKnown ? rungAt.toISOString() : undefined,
        issuedOffsetMin: offsetKnown ? opts.ringOffsetMin : undefined,
        // Paid on the spot — due = issue keeps it out of every aging bucket.
        dueDate: issueDate,
        branchId: shift.branchId ?? undefined,
        lines: dto.lines.map((l) => {
          const p = byId.get(l.productId)!;
          /**
           * ⚠️ **`productId` يُنقل ولا يُترك عند الاسم.**
           *
           * الكاشير **يعرف الصنف يقيناً** — يبحث عنه هنا بالسطر الذي فوق —
           * وكان يحتفظ باسمه وحده. فينتج سطرُ فاتورةٍ بلا صنف، أي «خدميّ»
           * بتعريف الطبقة، **فلا تكلفةَ مبيعات له أبداً** مهما اكتملت
           * الطبقات لاحقاً.
           *
           * وهو المسار الأخطر تحديداً لأنه **الوحيد الذي يخصم من المخزون**:
           * فتخرج البضاعة من الرفّ ولا يخرج ما يقابلها من الدفتر.
           */
          return {
            description: p.name,
            productId: p.id,
            quantity: l.quantity,
            unitPrice: Number(p.price),
            taxRate: POS_TAX_RATE,
          };
        }),
      } as CreateInvoiceDto;

      // الدفع المقسّم يُدقَّق قبل إنشاء أي شيء: نفس دالة المجاميع التي
      // ستحسب الفاتورة تتحقق أن الأجزاء تساويها — لا فاتورة نصف مدفوعة.
      if (dto.paymentMethod === 'SPLIT') {
        if (!dto.payments?.length) throw new BadRequestException(MSG.pos_split_parts_required);
        const expected = computeTotals(invoiceDto.lines).total;
        const paid = dto.payments.reduce((sum, p) => sum + p.amount, 0);
        if (Math.abs(paid - expected) > 0.01) throw new BadRequestException(MSG.pos_split_mismatch);
      } else if (dto.payments?.length) {
        throw new BadRequestException(MSG.pos_split_only_for_split);
      }
      // §4: البطاقة تمرّ عبر بوابة الدفع إن كانت مربوطة — قبل إنشاء أي
      // فاتورة، فالرفض لا يخلّف شيئاً وراءه. بلا ربطٍ يبقى السلوك السابق.
      let providerRef: string | null = null;
      const cardAmount =
        dto.paymentMethod === 'CARD'
          ? computeTotals(invoiceDto.lines).total
          : dto.paymentMethod === 'SPLIT'
            ? dto.payments!.filter((p) => p.method === 'CARD').reduce((sum, p) => sum + p.amount, 0)
            : 0;
      if (cardAmount > 0 && !opts.viaSync) {
        const result = await this.integrationsService.chargeCardIfConfigured(tx, {
          amount: round2(cardAmount),
          currency: 'SAR',
          reference: opts.clientSaleId ?? opts.offlineRef ?? `POS-${shift.id.slice(0, 8)}-${await tx.invoice.count({ where: { posShiftId: shift.id } })}`,
        });
        if (result && !result.approved) {
          throw new BadRequestException(formatMessage(MSG.pos_terminal_declined, { reason: result.declineReason ?? '—' }));
        }
        providerRef = result?.providerRef ?? null;
      }
      return { shiftId: shift.id, shiftBranchId: shift.branchId, branchWarehouseId, invoiceDto, providerRef };
    });

    // Same path a hand-written invoice takes (numbering retry included) —
    // outside the block above because it opens its own tenant transaction.
    const invoice = await this.invoicesService.create(tenant.companyId, tenant.allowedBranchIds, invoiceDto);

    const sold = await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      // صفّ دفعة لكل طريقة: البيع البسيط صفٌّ واحد بكامل المبلغ، والمقسّم
      // كما فصّله الكاشير — درجُ المناوبة يجمع صفوف النقد فقط.
      const parts = dto.paymentMethod === 'SPLIT' ? dto.payments! : [{ method: dto.paymentMethod, amount: Number(invoice.total) }];
      await tx.posPayment.createMany({
        data: parts.map((p) => ({
          companyId: tenant.companyId,
          invoiceId: invoice.id,
          method: p.method,
          amount: p.amount,
          // مرجع البوابة يلتصق بصف البطاقة وحده.
          providerRef: p.method === 'CARD' ? providerRef : null,
        })),
      });
      /**
       * ⭐ **الخصم لم يعد هنا** — صار مالكه سطرَ الفاتورة (`م٦`).
       *
       * كان الكاشير يخصم بنفسه والفاتورة تُرحّل وحدها: **كتابتان لمالكين
       * مختلفين**، ومنه جاء عطل `م١` — مسارٌ يعرف الصنف ثم يرميه. وبقاء
       * الخصم هنا بعد `م٦` كان سيخصم **مرّتين**.
       *
       * والخصم ما زال داخل معاملة إتمام البيع نفسها (موجز POS §6): سقوطها
       * يُسقط حركاتها معها، **فلا خصم مزدوج بنيوياً**.
       */
      const stockDeduction = toDeductionReport(invoice.stockFulfilment);

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          posShiftId: shiftId,
          paymentMethod: dto.paymentMethod,
          clientSaleId: opts.clientSaleId,
          offlineRef: opts.offlineRef,
        } as Prisma.InvoiceUncheckedUpdateInput,
        include: { lines: true, customer: true, posPayments: true },
      });
      // إيصال العميل يحمل الوسوم الخمسة من هذه اللحظة — لا من قائمة الفواتير وحدها (ق-١٨٦).
      return { ...(await this.withReceiptQr(tenant.companyId, updated)), stockDeduction };
    });

    /**
     * ⭐ **الختمُ المتزامن — بعد معاملة البيع لا داخلها** (`ق-١٨٧` · `ق-١٩٦`).
     *
     * البيعُ التزم وخُتم مدفوعاً؛ الآن يُختم مستندُه (١٠–٣٦ مللي ثانية) فيخرج
     * الإيصالُ بالوسوم التسعة — والإبلاغُ يبقى في الطابور. **وسقوطُ الختم لا يُسقط
     * البيع** (`ق-١٩٦`/١): `stampForReceipt` لا يرمي، فيخرج الإيصال بالوسوم الخمسة
     * ويُنبَّه الكاشير، والطابور يعيد الختم والإبلاغ. والمزامَن يمرّ هنا أيضاً —
     * وهذا هو (`ق-١٩٢`/ب): الممتثلة بتاريخ المعاملة عند عودة الاتصال.
     */
    const stamp = await this.zatca.stampForReceipt(tenant.companyId, sold.id);
    return { ...sold, zatcaQr: stamp.qrPayload ?? sold.zatcaQr, zatcaStamped: stamp.qrPayload !== null, stampError: stamp.error };
  }

  /**
   * ⭐ **إيصالُ الكاشير يحمل رمز الهيئة في كل مساراته** — الحيّ والمزامَن والمكرَّر (`ق-١٨٦`).
   *
   * الملحق (١) من قرار التنفيذ: `QR` **إلزاميٌّ توليداً وطباعةً** على الفاتورة
   * المبسّطة. وكان الرمز يُبنى لقائمة الفواتير وحدها، **والإيصالُ الذي يُسلَّم
   * للعميل بلا رمزٍ إطلاقاً** — مخالفةٌ في كل بيعٍ في نقطة البيع. البنّاءُ نفسه
   * وساعةُ الحائط نفسها (`ق-١٨٥`)، فلا يفترق رمزُ الإيصال عن رمز القائمة.
   * `null` حين يغيب الاسم القانوني أو الرقم الضريبي — والواجهة تُنبّه الكاشير
   * بدل رمزٍ يُقرأ ولا يصحّ.
   */
  private async withReceiptQr<
    T extends { issueDate: Date; issuedAt: Date | null; issuedOffsetMin: number | null; total: Prisma.Decimal; taxTotal: Prisma.Decimal; zatcaQrPayload?: string | null },
  >(companyId: string, invoice: T): Promise<T & { zatcaQr: string | null; zatcaStamped: boolean }> {
    // مستندٌ مختوم يعيد رمزَه التساعي المحفوظ — فإعادةُ المزامنة تطبع ما طُبع أولَ مرة حرفاً.
    return { ...invoice, zatcaQr: await this.invoicesService.zatcaQrFor(companyId, invoice), zatcaStamped: Boolean(invoice.zatcaQrPayload) };
  }


  private async totalsFor(tx: Prisma.TransactionClient, shiftId: string, openingFloat: number): Promise<ShiftTotals> {
    // من صفوف الدفعات لا من الفواتير: الفاتورة المقسّمة تضع في الدرج
    // جزءها النقدي فقط.
    const [groups, salesCount] = await Promise.all([
      tx.posPayment.groupBy({
        by: ['method'],
        where: { invoice: { posShiftId: shiftId } },
        _sum: { amount: true },
      }),
      tx.invoice.count({ where: { posShiftId: shiftId } }),
    ]);
    let cashTotal = 0;
    let cardTotal = 0;
    for (const g of groups) {
      const sum = Number(g._sum.amount ?? 0);
      if (g.method === 'CASH') cashTotal += sum;
      else cardTotal += sum;
    }
    return {
      salesCount,
      cashTotal: round2(cashTotal),
      cardTotal: round2(cardTotal),
      expectedCash: round2(openingFloat + cashTotal),
    };
  }

  private async walkInCustomerId(tx: Prisma.TransactionClient): Promise<string> {
    const existing = await tx.customer.findFirst({ where: { name: WALK_IN_CUSTOMER } });
    if (existing) return existing.id;
    const created = await tx.customer.create({ data: { name: WALK_IN_CUSTOMER } as unknown as Prisma.CustomerUncheckedCreateInput });
    return created.id;
  }

  private async actorName(tx: Prisma.TransactionClient, tenant: TenantContext): Promise<string> {
    if (tenant.actorType === 'COMPANY_USER') {
      const user = await tx.companyUser.findUnique({ where: { id: tenant.profileId }, select: { name: true } });
      if (user) return user.name;
    }
    const company = await tx.company.findUnique({ where: { id: tenant.companyId }, select: { orgName: true } });
    return company ? `مالك ${company.orgName}` : 'المالك';
  }
}
