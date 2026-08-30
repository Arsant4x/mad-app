import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Prisma } from '@prisma/client';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { roundTo } from '../common/money/rounding';
import { postPurchaseEntry, unpostIfLinked } from '../journal/auto-posting.util';
import { receiveStockedLines } from './purchase-receipt.util';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { formatMessage, MSG } from '../common/i18n/messages';

const PURCHASE_INCLUDE = { supplier: true, lines: true } as const;
const VAT_RATE = 0.15;

/** The one category whose expenses may be amortized — matches the mockup, which
 * only offers the amortization control when the category is establishment costs
 * (and maps that category to account 5500). */
const INCORPORATION_CATEGORY = 'مصروفات تأسيس';

/** Amortization is establishment-only and needs a real month count. Returns the
 * clean pair to store, or throws a localized error. `amortize=false` always
 * clears the month count so a stale value can't linger. */
function resolveAmortization(amortize: boolean, category: string | null | undefined, months: number | null | undefined): {
  amortize: boolean;
  amortizeMonths: number | null;
} {
  if (!amortize) return { amortize: false, amortizeMonths: null };
  if ((category ?? '').trim() !== INCORPORATION_CATEGORY || !months || months < 1) {
    throw new BadRequestException(MSG.purchase_amortize_requires_incorporation);
  }
  return { amortize: true, amortizeMonths: months };
}

/** Always derive tax/total server-side from subtotal + exempt — never trust
 * a client-submitted amount (same reasoning as invoices). */
function computeTax(subtotal: number, exempt: boolean) {
  const tax = exempt ? 0 : subtotal * VAT_RATE;
  return { tax, total: subtotal + tax };
}

@Injectable()
export class PurchasesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.purchase.findMany({ where: branchFilter(allowedBranchIds), include: PURCHASE_INCLUDE, orderBy: { date: 'desc' } }),
    );
  }

  /**
   * ⚠️ **البنود صارت مصدر الترحيل — فمجموعها يجب أن يساوي الإجمالي.**
   *
   * كانت `م١` تقبل اختلافهما عمداً، **وأعلنت أن المطابقة تأتي مع الموجة التي
   * تجعل البنود مصدر الحقيقة**. وهذه هي: بندٌ مخزنيّ يُمدِّن المخزون وخدميّ
   * يُمدِّن المصروف، والفرق بينهما يُقرأ من المجموع — فاختلافُه عن الإجمالي
   * يعني قيداً يوزّع مالاً لم يُدفع أو يُهمل مالاً دُفع.
   */
  private stockedSubtotal(dto: { subtotal: number; lines?: { productId?: string; quantity: number; unitPrice: number }[] }): number {
    if (!dto.lines?.length) return 0;

    const sum = (rows: typeof dto.lines) => roundTo(rows.reduce((t, l) => t + l.quantity * l.unitPrice, 0), 'LINE_AMOUNT');
    const all = sum(dto.lines);
    if (Math.abs(all - roundTo(dto.subtotal, 'LINE_AMOUNT')) > 0.005) {
      throw new BadRequestException(
        formatMessage(MSG.purchase_lines_total_mismatch, { lines: String(all), subtotal: String(dto.subtotal) }),
      );
    }
    return sum(dto.lines.filter((l) => l.productId));
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreatePurchaseDto) {
    const exempt = dto.exempt ?? false;
    const { tax, total } = computeTax(dto.subtotal, exempt);
    const { currency, exchangeRate } = resolveCurrency(dto);
    const { amortize, amortizeMonths } = resolveAmortization(dto.amortize ?? false, dto.category, dto.amortizeMonths);
    // يُحسب **قبل** المعاملة: خطأُ المطابقة يُردّ قبل أن يُكتب صفٌّ واحد.
    const stockedSubtotal = this.stockedSubtotal(dto);
    // Retries the whole transaction (fresh count() each time) on a "no"
    // collision from a concurrent create — see nextPurchaseNumber's comment.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
        const no = await this.nextPurchaseNumber(tx);
        const created = await tx.purchase.create({
          data: {
            companyId,
            no,
            branchId,
            supplierId: dto.supplierId,
            date: new Date(dto.date),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            category: dto.category,
            subtotal: dto.subtotal,
            taxAmount: tax,
            exempt,
            excludeFromVat: dto.excludeFromVat ?? false,
            amortize,
            amortizeMonths,
            incorpItem: dto.incorpItem?.trim() || null,
            total,
            currency,
            exchangeRate,
            baseSubtotal: toBaseAmount(dto.subtotal, exchangeRate),
            baseTaxAmount: toBaseAmount(tax, exchangeRate),
            baseTotal: toBaseAmount(total, exchangeRate),
            /**
             * البنود — تُكتب متداخلةً في نفس المعاملة، **و`companyId` مضبوطٌ
             * على كل بند صراحةً** لا اتّكالاً على امتداد المستأجر: الكتابة
             * المتداخلة تقع داخل استعلام الأب، فلا يمرّ عليها الامتداد.
             * وسياسة RLS تفحص `companyId` — فبندٌ بلا شركةٍ يُرفض من القاعدة.
             */
            ...(dto.lines?.length
              ? {
                  lines: {
                    create: dto.lines.map((line) => ({
                      companyId,
                      description: line.description,
                      productId: line.productId ?? null,
                      quantity: line.quantity,
                      unitPrice: line.unitPrice,
                      taxRate: line.taxRate ?? 15,
                    })),
                  },
                }
              : {}),
          } as unknown as Prisma.PurchaseUncheckedCreateInput,
          include: PURCHASE_INCLUDE,
        });

        // Auto-post to the ledger; soft-skip (journalEntryId stays null) if
        // the required accounts (expense category/2100/2200) aren't set up
        // for this company yet.
        /**
         * ⚠️ **الاستلام يسبق الترحيل عمداً.**
         *
         * فإن رُفض (بندٌ مخزنيّ بلا مستودع) سقطت المعاملة كلها **قبل أن
         * يُكتب قيد**. والعكس يترك قيداً يُمدِّن مخزوناً بلا طبقةٍ تقابله —
         * وهو أسوأ من الرفض: ميزانيةٌ تعلن بضاعةً لا يستطيع أحد أن يبيعها
         * بتكلفتها.
         */
        await receiveStockedLines(tx, {
          companyId,
          branchId: created.branchId,
          warehouseId: dto.warehouseId ?? null,
          date: created.date,
          exchangeRate,
          lines: created.lines,
        });

        const entry = await postPurchaseEntry(tx, companyId, {
          branchId: created.branchId,
          no: created.no,
          date: created.date,
          supplierName: created.supplier.name,
          category: created.category,
          baseSubtotal: Number(created.baseSubtotal),
          baseTaxAmount: Number(created.baseTaxAmount),
          baseTotal: Number(created.baseTotal),
          baseStockedSubtotal: toBaseAmount(stockedSubtotal, exchangeRate),
        });
        if (!entry) return created;
        return tx.purchase.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: PURCHASE_INCLUDE });
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdatePurchaseDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.purchase_not_found);

      const data: Prisma.PurchaseUncheckedUpdateInput = {};
      if (dto.supplierId !== undefined) data.supplierId = dto.supplierId;
      if (dto.date !== undefined) data.date = new Date(dto.date);
      if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
      if (dto.category !== undefined) data.category = dto.category;

      if (dto.subtotal !== undefined || dto.exempt !== undefined) {
        const subtotal = dto.subtotal ?? Number(existing.subtotal);
        const exempt = dto.exempt ?? existing.exempt;
        const { tax, total } = computeTax(subtotal, exempt);
        // Keep the rate the purchase was recorded at unless explicitly changed.
        const rate = dto.exchangeRate ?? Number(existing.exchangeRate);
        data.subtotal = subtotal;
        data.exempt = exempt;
        data.taxAmount = tax;
        data.total = total;
        data.baseSubtotal = toBaseAmount(subtotal, rate);
        data.baseTaxAmount = toBaseAmount(tax, rate);
        data.baseTotal = toBaseAmount(total, rate);
        if (dto.currency) data.currency = dto.currency;
        if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
      }

      if (dto.paid !== undefined) {
        data.paid = dto.paid;
        data.paidDate = dto.paid ? new Date(dto.paidDate ?? new Date().toISOString().slice(0, 10)) : null;
      }

      // Declaration exclusion and amortization are metadata only — neither
      // touches the ledger, so they never trigger a re-post below.
      if (dto.excludeFromVat !== undefined) data.excludeFromVat = dto.excludeFromVat;
      if (dto.incorpItem !== undefined) data.incorpItem = dto.incorpItem.trim() || null;

      // Re-validate whenever amortize, its months, or the category changes: a
      // category moved away from establishment costs must invalidate an
      // amortization set earlier.
      if (dto.amortize !== undefined || dto.amortizeMonths !== undefined || dto.category !== undefined) {
        const effCategory = dto.category !== undefined ? dto.category : existing.category;
        const effAmortize = dto.amortize ?? existing.amortize;
        const effMonths = dto.amortizeMonths ?? existing.amortizeMonths;
        const resolved = resolveAmortization(effAmortize, effCategory, effMonths);
        data.amortize = resolved.amortize;
        data.amortizeMonths = resolved.amortizeMonths;
      }

      // Anything that changes who/what/how-much gets reversed and re-posted
      // fresh rather than patched in place — same reasoning as InvoicesService.
      const affectsPosting =
        dto.supplierId !== undefined ||
        dto.date !== undefined ||
        dto.category !== undefined ||
        dto.subtotal !== undefined ||
        dto.exempt !== undefined;
      if (affectsPosting && existing.journalEntryId) {
        data.journalEntryId = null;
      }

      const updated = await tx.purchase.update({ where: { id }, data, include: PURCHASE_INCLUDE });
      if (!affectsPosting) return updated;

      if (existing.journalEntryId) await unpostIfLinked(tx, existing.journalEntryId);
      const entry = await postPurchaseEntry(tx, companyId, {
        branchId: updated.branchId,
        no: updated.no,
        date: updated.date,
        supplierName: updated.supplier.name,
        category: updated.category,
        baseSubtotal: Number(updated.baseSubtotal),
        baseTaxAmount: Number(updated.baseTaxAmount),
        baseTotal: Number(updated.baseTotal),
      });
      if (!entry) return updated;
      return tx.purchase.update({ where: { id }, data: { journalEntryId: entry.id }, include: PURCHASE_INCLUDE });
    });
  }

  /**
   * تقرير مصاريف التأسيس — establishment costs grouped by line item.
   *
   * Deliberately separate from the general expense report (the mockup keeps
   * them apart too): setting a business up is a one-off investment, and mixing
   * it into running costs makes the first year's operating performance look far
   * worse than it is.
   *
   * Amounts are base-currency, so a company that paid a foreign supplier still
   * gets one comparable total.
   */
  incorporationReport(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.purchase.findMany({
        where: { category: INCORPORATION_CATEGORY },
        select: { incorpItem: true, baseTotal: true, amortize: true, amortizeMonths: true },
      });

      const total = rows.reduce((s, p) => s + Number(p.baseTotal), 0);
      const amortizedCount = rows.filter((p) => p.amortize).length;

      const byItem = new Map<string, { count: number; total: number; amortizeMonths: number | null }>();
      for (const p of rows) {
        // Unlabelled purchases still belong in the report — dropping them would
        // make the totals disagree with the ledger.
        const key = p.incorpItem?.trim() || 'بدون بند محدَّد';
        const cur = byItem.get(key) ?? { count: 0, total: 0, amortizeMonths: null };
        cur.count += 1;
        cur.total += Number(p.baseTotal);
        if (p.amortize && cur.amortizeMonths === null) cur.amortizeMonths = p.amortizeMonths ?? 0;
        byItem.set(key, cur);
      }

      return {
        total,
        invoiceCount: rows.length,
        amortizedCount,
        items: [...byItem.entries()]
          .map(([item, v]) => ({
            item,
            count: v.count,
            total: v.total,
            method: v.amortizeMonths !== null ? `استهلاك (${v.amortizeMonths} شهر)` : 'دفعة واحدة',
          }))
          .sort((a, b) => b.total - a.total),
      };
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.purchase_not_found);
      await tx.purchase.delete({ where: { id } });
      await unpostIfLinked(tx, existing.journalEntryId);
    });
  }

  /** `PUR-<seq>`, matching the original mockup's numbering. Based on the
   * highest existing sequence, not `count()` — see InvoicesService's
   * equivalent comment for why count() breaks once any purchase is deleted. */
  private async nextPurchaseNumber(tx: Prisma.TransactionClient): Promise<string> {
    const prefix = 'PUR-';
    const rows = await tx.purchase.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });
    const maxSeq = rows.reduce((max, r) => {
      const n = parseInt(r.no.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }
}
