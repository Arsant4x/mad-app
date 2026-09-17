import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Prisma } from '@prisma/client';
import { outstandingAfterNotes } from '../common/adjustment/adjustment-note.util';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { formatMoney, round2, roundTo } from '../common/money/rounding';
import { AMORTIZABLE_CATEGORY, purchaseCategoryLabel, toPurchaseCategoryCode } from '../common/purchase-categories';
import { allocatedByDocument, allocatedFor, SETTLEMENT_EPS } from '../common/settlement/settlement.util';
import { postPurchaseEntry, postReversalEntry } from '../journal/auto-posting.util';
import { receiveStockedLines } from './purchase-receipt.util';
import { receiptConsumed, reverseReceipt } from './purchase-receipt-reversal.util';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { creditedByPurchase, purchaseTarget, recomputePurchaseStatus } from './purchase-settlement.util';
import { formatMessage, MSG } from '../common/i18n/messages';

/** البنودُ الحيّة وحدَها — المتجاوَزُ بتعديلٍ قبل الاستهلاك (`supersededAt`) محفوظٌ للدفتر لا للعرض. */
const PURCHASE_INCLUDE = { supplier: true, lines: { where: { supersededAt: null } } } as const;
const VAT_RATE = 0.15;

/** Amortization is establishment-only and needs a real month count. Returns the
 * clean pair to store, or throws a localized error. `amortize=false` always
 * clears the month count so a stale value can't linger.
 *
 * Takes the **code**, not the label. The three places that used to decide off
 * the Arabic string did not agree on whitespace — two trimmed, one did not — so
 * `'مصروفات تأسيس '` passed this gate and then vanished from the incorporation
 * report. See `common/purchase-categories.ts`. */
function resolveAmortization(amortize: boolean, categoryCode: string | null | undefined, months: number | null | undefined): {
  amortize: boolean;
  amortizeMonths: number | null;
} {
  if (!amortize) return { amortize: false, amortizeMonths: null };
  if (toPurchaseCategoryCode(categoryCode) !== AMORTIZABLE_CATEGORY || !months || months < 1) {
    throw new BadRequestException(MSG.purchase_amortize_requires_incorporation);
  }
  return { amortize: true, amortizeMonths: months };
}

/** Always derive tax/total server-side from subtotal + exempt — never trust
 * a client-submitted amount (same reasoning as invoices). يستعمله إشعارُ المورّد أيضاً
 * (`supplier-notes.service`) — فضريبةُ الشراء تُحسب بطريقةٍ واحدة في الجانبين. */
export function computePurchaseTax(subtotal: number, exempt: boolean) {
  const tax = exempt ? 0 : subtotal * VAT_RATE;
  return { tax, total: subtotal + tax };
}

@Injectable()
export class PurchasesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * القائمة **بمسدَّدها ومتبقّيها محسوبَين من التخصيصات** (`ق-٨٧٢`) — في استعلامٍ واحد لكل
   * الصفوف، كما تحسب قائمةُ الفواتير مقبوضَها. لا حقلَ مبلغٍ مسدَّد على الشراء إطلاقاً؛
   * و`status` مرآةٌ مشتقّةٌ لهذين الرقمين للفرز وحدَه.
   */
  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const purchases = await tx.purchase.findMany({ where: branchFilter(allowedBranchIds), include: PURCHASE_INCLUDE, orderBy: { date: 'desc' } });
      const ids = purchases.map((p) => p.id);
      const allocated = await allocatedByDocument(purchaseTarget(tx), ids);
      // ما ائتمن به المورّد يخفّض المتبقّي كما يخفّضه الإشعارُ الدائن على الفاتورة — المصدرُ الواحد ⑥ (`ق-١٠٠٨`/١).
      const credited = await creditedByPurchase(tx, ids);
      return purchases.map((p) => {
        const paid = allocated.get(p.id) ?? 0;
        const creditedTotal = p.docType === 'SUPPLIER_CREDIT_NOTE' ? 0 : (credited.get(p.id) ?? 0);
        // والمُلغى بقيد عكسٍ لا ذمّةَ عليه (`ق-٩٩٧`/②).
        const remaining = p.voidedAt ? 0 : outstandingAfterNotes(p, creditedTotal, paid, 'SUPPLIER_CREDIT_NOTE');
        return { ...p, allocated: paid, credited: creditedTotal, remaining };
      });
    });
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
    const { tax, total } = computePurchaseTax(dto.subtotal, exempt);
    const { currency, exchangeRate } = resolveCurrency(dto);
    // الرمز يُشتقّ مرةً واحدة عند الكتابة — فلا يعود قارئٌ يطابق نصّاً عربياً.
    const categoryCode = toPurchaseCategoryCode(dto.categoryCode ?? dto.category);
    const { amortize, amortizeMonths } = resolveAmortization(dto.amortize ?? false, categoryCode, dto.amortizeMonths);
    // يُحسب **قبل** المعاملة: خطأُ المطابقة يُردّ قبل أن يُكتب صفٌّ واحد.
    const stockedSubtotal = this.stockedSubtotal(dto);
    // Retries the whole transaction (fresh count() each time) on a "no"
    // collision from a concurrent create — see nextPurchaseNumber's comment.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
        const no = await this.nextPurchaseNumber(tx, companyId);
        const created = await tx.purchase.create({
          data: {
            companyId,
            no,
            branchId,
            supplierId: dto.supplierId,
            date: new Date(dto.date),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            category: purchaseCategoryLabel(dto.categoryCode ?? dto.category),
            categoryCode,
            // رقمُ فاتورة المورّد — مرجعٌ خارجيٌّ يُسجَّل لا رقمٌ يُصدَر (`ق-١٠٠٦`/①).
            supplierRef: dto.supplierRef?.trim() || null,
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
          supplierId: created.supplierId,
          branchId: created.branchId,
          no: created.no,
          date: created.date,
          supplierName: created.supplier.name,
          categoryCode: created.categoryCode,
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

  /**
   * ⚖️ **تعديلُ فاتورة الشراء — بعكسٍ لا بحذف، والمفصلُ محكوم** (`ق-٩٩٧` · `ق-١٠٠٦`/⑥):
   *
   * ① **قبل أيّ استهلاك يُعدَّل كلُّ شيء**: القيدُ يُعكس (`postReversalEntry` — قائمٌ لا محذوف، `ق-٩٦٥`)
   *    ويُعاد بتاريخ المستند من بنوده الحيّة؛ والرفُّ يتبع: الاستلامُ يُعكس بحركةٍ خارجة من طبقته ويُعاد
   *    بطبقةٍ جديدة، والسطرُ القديم **يُحفظ متجاوَزاً** (`supersededAt`) لأن حركاتِه تشير إليه — وقائعُ لا حالات.
   * ② **بعد استهلاكٍ ولو جزئيّ** (بيعاً أو إعادةً إلى المورّد) **أو إشعارٍ صدر عليه**: الكميةُ والتكلفةُ
   *    مجمَّدتان — البنودُ والإجماليُّ والعملةُ وسعرُها والمستودع — والرفضُ `409` **يسمّي المخرج**: إشعارٌ من
   *    المورّد (`ق-٢٦٥`). وما عداهما يُعدَّل: المورّدُ والتاريخان والفئةُ والإعفاءُ والاستبعادُ والمرجع.
   * ③ والمُلغى مُغلَق.
   *
   * والاستهلاكُ **بالحال** (`ق-٩٩٩`): طبقةُ الاستلام ناقصةٌ عمّا استُلم — أياً كان ما أنقصها.
   *
   * **على مستوى المنشأة بحقّها**: إشعاراتُ الشراء تُعدّ في أيّ فرعٍ كانت لتجميد كميته وتكلفته — فإشعارٌ في
   * فرعٍ محجوبٍ عن القارئ يجمّده كما يجمّده إشعارُ فرعه، وإلا عُدِّل مستندٌ صُحِّح من فرعٍ آخر.
   */
  update(companyId: string, id: string, dto: UpdatePurchaseDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id }, include: PURCHASE_INCLUDE });
      if (!existing) throw new NotFoundException(MSG.purchase_not_found);
      // ⚖️ إشعارُ المورّد حدثٌ مرحَّل — لا يُعدَّل بعد ترحيله (`ق-١٠٠٦`/②)، والتصحيحُ بإشعارٍ مقابل.
      if (existing.docType !== 'PURCHASE') throw new ConflictException(MSG.supplier_note_immutable);
      if (existing.voidedAt) throw new ConflictException(formatMessage(MSG.purchase_voided, { no: existing.no }));

      // ② الكميةُ والتكلفةُ: ما يمسّهما يُرفض مسمّىً بعد استهلاكٍ أو إشعار.
      const quantityOrCostGiven =
        dto.lines !== undefined || dto.subtotal !== undefined || dto.currency !== undefined || dto.exchangeRate !== undefined || dto.warehouseId !== undefined;
      if (quantityOrCostGiven) {
        const notes = await tx.purchase.count({ where: { relatedPurchaseId: id } });
        if (notes > 0 || (await receiptConsumed(tx, existing.lines))) {
          throw new ConflictException(formatMessage(MSG.purchase_frozen_after_consumption, { no: existing.no }));
        }
      }

      const data: Prisma.PurchaseUncheckedUpdateInput = {};
      if (dto.supplierId !== undefined) data.supplierId = dto.supplierId;
      if (dto.date !== undefined) data.date = new Date(dto.date);
      if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
      if (dto.supplierRef !== undefined) data.supplierRef = dto.supplierRef.trim() || null;
      const categoryGiven = dto.categoryCode !== undefined || dto.category !== undefined;
      if (categoryGiven) {
        const raw = dto.categoryCode ?? dto.category;
        data.category = purchaseCategoryLabel(raw);
        data.categoryCode = toPurchaseCategoryCode(raw);
      }

      // البنودُ مصدرُ الإجمالي كالإنشاء: إن أُرسلت اشتُقّ منها، وإن أُرسل معها إجماليٌّ وجب أن يطابقها.
      const linesSubtotal = dto.lines ? roundTo(dto.lines.reduce((t, l) => t + l.quantity * l.unitPrice, 0), 'LINE_AMOUNT') : null;
      if (dto.lines) this.stockedSubtotal({ subtotal: dto.subtotal ?? linesSubtotal!, lines: dto.lines });
      const amountsGiven =
        dto.subtotal !== undefined || dto.exempt !== undefined || dto.lines !== undefined || dto.exchangeRate !== undefined || dto.currency !== undefined;
      const rate = dto.exchangeRate ?? Number(existing.exchangeRate);
      if (amountsGiven) {
        const subtotal = dto.subtotal ?? linesSubtotal ?? Number(existing.subtotal);
        const exempt = dto.exempt ?? existing.exempt;
        const { tax, total } = computePurchaseTax(subtotal, exempt);
        // إجماليٌّ ينزل تحت ما سُدِّد عليه فعلاً يجعل الحالةَ تكذب (مسدَّدةٌ بأكثر من قيمتها)
        // — رفضٌ مسمّىً، والتصحيحُ بعكس السند أولاً.
        const paidSoFar = await allocatedFor(purchaseTarget(tx), id);
        if (paidSoFar > round2(total) + SETTLEMENT_EPS) {
          throw new ConflictException(
            formatMessage(MSG.purchase_total_below_allocated, { no: existing.no, total: formatMoney(total), allocated: formatMoney(paidSoFar) }),
          );
        }
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

      // Declaration exclusion and amortization are metadata only — neither
      // touches the ledger, so they never trigger a re-post below.
      if (dto.excludeFromVat !== undefined) data.excludeFromVat = dto.excludeFromVat;
      if (dto.incorpItem !== undefined) data.incorpItem = dto.incorpItem.trim() || null;

      // Re-validate whenever amortize, its months, or the category changes: a
      // category moved away from establishment costs must invalidate an
      // amortization set earlier.
      if (dto.amortize !== undefined || dto.amortizeMonths !== undefined || categoryGiven) {
        const effCategory = categoryGiven ? (data.categoryCode as string | null) : existing.categoryCode;
        const effAmortize = dto.amortize ?? existing.amortize;
        const effMonths = dto.amortizeMonths ?? existing.amortizeMonths;
        const resolved = resolveAmortization(effAmortize, effCategory, effMonths);
        data.amortize = resolved.amortize;
        data.amortizeMonths = resolved.amortizeMonths;
      }

      // Anything that changes who/what/how-much gets reversed and re-posted
      // fresh rather than patched in place — same reasoning as InvoicesService.
      const affectsPosting = dto.supplierId !== undefined || dto.date !== undefined || categoryGiven || amountsGiven;

      let updated = await tx.purchase.update({ where: { id }, data, include: PURCHASE_INCLUDE });

      if (dto.lines !== undefined) {
        // ① الرفُّ يتبع: الاستلامُ القديم يُعكس بحركةٍ خارجة (لا يُحذف)، والقديمُ يُحفظ متجاوَزاً، والجديدُ يُستلم.
        const { warehouseId } = await reverseReceipt(tx, {
          companyId,
          branchId: existing.branchId,
          date: updated.date,
          documentNo: existing.no,
          reason: `تعديلُ فاتورة شراء ${existing.no}`,
          lines: existing.lines,
        });
        await tx.purchaseLine.updateMany({ where: { purchaseId: id, supersededAt: null }, data: { supersededAt: new Date() } });
        await tx.purchaseLine.createMany({
          data: dto.lines.map((line) => ({
            companyId,
            purchaseId: id,
            description: line.description,
            productId: line.productId ?? null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate ?? 15,
          })),
        });
        updated = (await tx.purchase.findUnique({ where: { id }, include: PURCHASE_INCLUDE }))!;
        await receiveStockedLines(tx, {
          companyId,
          branchId: updated.branchId,
          warehouseId: dto.warehouseId ?? warehouseId,
          date: updated.date,
          exchangeRate: rate,
          lines: updated.lines,
        });
      }

      // الإجماليُّ تغيّر فالحالةُ المشتقّة تُعاد من التخصيصات في المعاملة نفسِها — لا تنحرف لحظة.
      if (amountsGiven) await recomputePurchaseStatus(tx, id);
      if (!affectsPosting) return updated;

      // ① القيدُ يُعكس ولا يُحذف (`ق-٩٦٥`) — بتاريخ المستند (`ق-٩٧٢`) — ثم يُعاد من بنوده الحيّة.
      if (existing.journalEntryId) {
        await postReversalEntry(tx, companyId, { entryId: existing.journalEntryId, date: updated.date, memo: `عكسُ فاتورة شراء ${existing.no} — تعديل` });
      }
      const stocked = roundTo(
        updated.lines.filter((l) => l.productId).reduce((t, l) => t + Number(l.quantity) * Number(l.unitPrice), 0),
        'LINE_AMOUNT',
      );
      const entry = await postPurchaseEntry(tx, companyId, {
        supplierId: updated.supplierId,
        branchId: updated.branchId,
        no: updated.no,
        date: updated.date,
        supplierName: updated.supplier.name,
        categoryCode: updated.categoryCode,
        baseSubtotal: Number(updated.baseSubtotal),
        baseTaxAmount: Number(updated.baseTaxAmount),
        baseTotal: Number(updated.baseTotal),
        // كان يُعاد الترحيلُ بلا نصيب المخزون فيذهب الشراءُ المخزنيُّ كلُّه إلى المصروف (`ق-٩٩٣`) — الآن من بنوده الحيّة.
        baseStockedSubtotal: toBaseAmount(stocked, rate),
      });
      return tx.purchase.update({ where: { id }, data: { journalEntryId: entry?.id ?? null }, include: PURCHASE_INCLUDE });
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
   *
   * **على مستوى المنشأة بحقّها**: مصاريفُ التأسيس استثمارُ المنشأة الواحد لا
   * مصروفُ فرع — والتقريرُ يجمعها كلَّها ليُقارَن بسنة التشغيل الأولى، وتقسيمُها
   * على الفروع يُخفي ما بُنيت به المنشأة.
   */
  incorporationReport(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.purchase.findMany({
        // والمُلغى بقيد عكسٍ ليس مصروفاً (`ق-٩٩٧`/②).
        where: { categoryCode: AMORTIZABLE_CATEGORY, voidedAt: null },
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

  /**
   * ⚖️ **الحذفُ إلغاءٌ بقيد عكس — لا محوٌ ولا `500`** (`ق-٩٩٧`/②): الصفُّ يبقى مُلغىً (`voidedAt`)، والقيدُ
   * يُعكس بتاريخ الإلغاء (قائمٌ لا محذوف)، والاستلامُ يُعكس بحركةٍ خارجة من طبقته. **ولا يُلغى ما استُهلك منه**
   * (المخرجُ إشعارُ المورّد على ما بقي)، ولا ما عليه سندُ صرفٍ (عكسُ السند أولاً)، ولا ما صدرت عليه إشعارات.
   *
   * **على مستوى المنشأة بحقّها**: الشراءُ الذي صدرت عليه إشعاراتٌ لا يُلغى — والعدُّ يقرأ إشعاراتِه في أيّ
   * فرعٍ كانت، كما يُمنع حذفُ العميل بفواتيره في أيّ فرع؛ وعدٌّ مقصورٌ على فروع القارئ يُلغي ما أُشير إليه.
   */
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id }, include: PURCHASE_INCLUDE });
      if (!existing) throw new NotFoundException(MSG.purchase_not_found);
      // ⚖️ إشعارُ المورّد يُعكس ولا يُحذف (`ق-١٠٠٦`/②) — والشراءُ الذي صدرت عليه إشعاراتٌ يبقى (`Restrict`).
      if (existing.docType !== 'PURCHASE') throw new ConflictException(MSG.supplier_note_immutable);
      if (existing.voidedAt) throw new ConflictException(formatMessage(MSG.purchase_voided, { no: existing.no }));
      const notes = await tx.purchase.count({ where: { relatedPurchaseId: id } });
      if (notes > 0) throw new ConflictException(formatMessage(MSG.purchase_has_notes, { no: existing.no }));
      // شراءٌ عليه سندُ صرفٍ لا يُلغى وسندُه قائم، والتصحيحُ بعكس السند — `409` مسمّىً لا خطأَ قيدٍ خاماً.
      const allocations = await tx.supplierPaymentAllocation.count({ where: { purchaseId: id } });
      if (allocations > 0) throw new ConflictException(formatMessage(MSG.purchase_has_payments, { no: existing.no }));
      if (await receiptConsumed(tx, existing.lines)) throw new ConflictException(formatMessage(MSG.purchase_void_consumed, { no: existing.no }));

      const voidedAt = new Date();
      await reverseReceipt(tx, { companyId, branchId: existing.branchId, date: voidedAt, documentNo: existing.no, reason: `إلغاءُ فاتورة شراء ${existing.no}`, lines: existing.lines });
      if (existing.journalEntryId) {
        await postReversalEntry(tx, companyId, { entryId: existing.journalEntryId, date: voidedAt, memo: `إلغاءُ فاتورة شراء ${existing.no}` });
      }
      await tx.purchase.update({ where: { id }, data: { voidedAt } });
    });
  }

  /** `PUR-<seq>`, matching the original mockup's numbering. Based on the
   * highest existing sequence, not `count()` — see InvoicesService's
   * equivalent comment for why count() breaks once any purchase is deleted. */
  private async nextPurchaseNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
    // عدّادٌ ذرّيّ لا مسحٌ كامل (ق-٣٢٨). ⚠️ **وهذه السلسلة عمريّةٌ لا سنوية**
    // (`PUR-###` بلا سنة) — فمفتاحُ السنة صفرٌ والشكلُ يبقى كما هو.
    return nextDocumentNumber(tx, companyId, new Date(), { kind: 'PUR', pad: 3, perYear: false }, (prefix) =>
      highestSequenceOf(tx.purchase, prefix),
    );
  }
}
