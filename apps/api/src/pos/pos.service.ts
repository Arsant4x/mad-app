import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../auth/types';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { computeTotals, InvoicesService } from '../invoices/invoices.service';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { CloseShiftDto, CreatePosSaleDto, OpenShiftDto, SyncPosSaleDto } from './dto/pos.dto';

/** KSA standard VAT — the cashier rings retail lines at the standard rate,
 * matching the invoice screen's default. */
const POS_TAX_RATE = 15;

/** اسم عميل المرور الافتراضي — created once per company, then reused. */
const WALK_IN_CUSTOMER = 'عميل نقدي';

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
    opts: { clientSaleId?: string; offlineRef?: string; issueDate?: string },
  ) {
    const { shiftId, invoiceDto } = await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const shift = await tx.posShift.findFirst({ where: { status: 'OPEN', openedById: tenant.profileId } });
      if (!shift) throw new ConflictException(MSG.pos_no_open_shift);

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
      return { shiftId: shift.id, invoiceDto };
    });

    // Same path a hand-written invoice takes (numbering retry included) —
    // outside the block above because it opens its own tenant transaction.
    const invoice = await this.invoicesService.create(tenant.companyId, tenant.allowedBranchIds, invoiceDto);

    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      // صفّ دفعة لكل طريقة: البيع البسيط صفٌّ واحد بكامل المبلغ، والمقسّم
      // كما فصّله الكاشير — درجُ المناوبة يجمع صفوف النقد فقط.
      const parts = dto.paymentMethod === 'SPLIT' ? dto.payments! : [{ method: dto.paymentMethod, amount: Number(invoice.total) }];
      await tx.posPayment.createMany({
        data: parts.map((p) => ({ companyId: tenant.companyId, invoiceId: invoice.id, method: p.method, amount: p.amount })),
      });
      return tx.invoice.update({
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
    });
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
