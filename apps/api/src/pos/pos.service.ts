import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../auth/types';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { computeTotals, InvoicesService } from '../invoices/invoices.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { formatMessage } from '../common/i18n/messages';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { currentStockQty } from '../inventory/stock-quantity.util';
import { CloseShiftDto, CreatePosSaleDto, OpenShiftDto, PosSaleLineDto, SyncPosSaleDto } from './dto/pos.dto';

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
        variance: Number((dto.declaredClosing - totals.expectedCash).toFixed(2)),
      };
    });
  }

  /** بيع كاشير: فاتورة حقيقية (ترقيم/ضريبة/قيد) تُختم مدفوعةً على المناوبة. */
  createSale(tenant: TenantContext, dto: CreatePosSaleDto) {
    return this.ring(tenant, dto, {});
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
    if (existing) return existing;
    try {
      return await this.ring(tenant, dto, {
        clientSaleId: dto.clientSaleId,
        offlineRef: dto.offlineRef,
        issueDate: dto.ringAt?.slice(0, 10),
        // بيع أوفلاين أُخذت بطاقته على الجهاز وقت الانقطاع — لا نعيد تمريرها
        // عند المزامنة؛ البوابة تُستشار في البيع الحي فقط.
        viaSync: true,
      });
    } catch (e) {
      // Two terminals racing the same clientSaleId: the loser reads the
      // winner's row — the caller cannot tell the difference, by design.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.findByClientSaleId(tenant.companyId, dto.clientSaleId);
        if (winner) return winner;
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
    opts: { clientSaleId?: string; offlineRef?: string; issueDate?: string; viaSync?: boolean },
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
      const today = new Date().toISOString().slice(0, 10);
      // An offline sale keeps the day it was actually rung, not the day the
      // connection came back.
      const issueDate = opts.issueDate ?? today;
      const invoiceDto = {
        customerId,
        issueDate,
        // Paid on the spot — due = issue keeps it out of every aging bucket.
        dueDate: issueDate,
        branchId: shift.branchId ?? undefined,
        lines: dto.lines.map((l) => {
          const p = byId.get(l.productId)!;
          return { description: p.name, quantity: l.quantity, unitPrice: Number(p.price), taxRate: POS_TAX_RATE };
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
          amount: Number(cardAmount.toFixed(2)),
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

    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
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
      // خصم المخزون داخل نفس معاملة إتمام البيع (موجز POS §6): لو خسرت
      // مزامنةٌ سباقَ clientSaleId فسقطت هذه المعاملة، سقطت حركاتها معها —
      // فلا خصم مزدوج بنيوياً. وإعادة الإرسال المتطابقة لا تصل هنا أصلاً
      // (syncSale يعيد فاتورة الفائز قبل أي رنّ جديد).
      const stockDeduction = await this.deductStock(tx, tenant.companyId, {
        warehouseId: branchWarehouseId,
        branchId: shiftBranchId,
        lines: dto.lines,
        date: invoiceDto.issueDate,
        invoiceNo: invoice.no,
      });

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
      return { ...updated, stockDeduction };
    });
  }

  /**
   * حركات OUT لبنود البيع المخزنية — على مستودع فرع الوردية.
   *
   * «مخزني» = له حركة واحدة على الأقل في دفتر الحركات (الرصيد هنا مشتق من
   * الدفتر وحده، فبند بلا أي حركة — خدمة أو صنف لا تتعقبه المنشأة — لا معنى
   * لخصمه، وخصمه كان سيلوّث شاشة الأرصدة بسوالب دائمة لكل خدمة تُباع).
   *
   * النقص لا يمنع البيع: السالب مسموح بتحذير ناعم، نفس سياسة إنشاء الحركة
   * اليدوية في InventoryService — الكاشير لا يوقف طابور المحل على جرد.
   */
  private async deductStock(
    tx: Prisma.TransactionClient,
    companyId: string,
    args: { warehouseId: string | null; branchId: string | null; lines: PosSaleLineDto[]; date: string; invoiceNo: string },
  ): Promise<StockDeductionReport> {
    if (!args.warehouseId) return { deducted: false, reason: 'NO_BRANCH_WAREHOUSE' };
    const warehouseId = args.warehouseId;

    const ids = [...new Set(args.lines.map((l) => l.productId))];
    const tracked = new Set(
      (await tx.stockMovement.findMany({ where: { productId: { in: ids } }, select: { productId: true }, distinct: ['productId'] })).map(
        (m) => m.productId,
      ),
    );
    const deductible = args.lines.filter((l) => tracked.has(l.productId));
    if (!deductible.length) return { deducted: false, reason: 'NO_TRACKED_PRODUCTS' };

    await tx.stockMovement.createMany({
      // companyId صراحةً — createMany لا يمرّ على امتداد حقن المستأجر دائماً،
      // نفس نمط posPayment.createMany أعلاه؛ RLS يسند الاثنين.
      data: deductible.map((l) => ({
        companyId,
        productId: l.productId,
        warehouseId,
        branchId: args.branchId,
        type: 'OUT' as const,
        qty: l.quantity,
        date: new Date(args.date),
        reason: `بيع كاشير ${args.invoiceNo}`,
      })),
    });

    const belowZero: { productId: string; resultingQty: number }[] = [];
    for (const productId of new Set(deductible.map((l) => l.productId))) {
      const resultingQty = await currentStockQty(tx, productId, warehouseId);
      if (resultingQty < 0) belowZero.push({ productId, resultingQty });
    }
    return { deducted: true, warehouseId, movements: deductible.length, belowZero };
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
      cashTotal: Number(cashTotal.toFixed(2)),
      cardTotal: Number(cardTotal.toFixed(2)),
      expectedCash: Number((openingFloat + cashTotal).toFixed(2)),
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
