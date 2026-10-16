import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { branchFilter } from '../branches/branch-scope.util';
import { companyToday } from '../common/company-day.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2, roundTo } from '../common/money/rounding';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postGoodsReceiptEntry } from '../journal/auto-posting.util';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { receiveStockedLines, resolveReceiptWarehouse } from './purchase-receipt.util';
import { reverseGoodsReceipt } from './purchase-receipt-reversal.util';
import { reconcileNonDeductibleVat } from './non-deductible-vat.util';

/**
 * ⭐ **الاستلامُ المستقلّ** (`٢٥` · `ق-١١٢١` · `ق-١١٢٢` · `ق-١١٣١`) — كيانٌ فوق الشراء لا بدلَه.
 *
 * ## ما يفعله
 * - **الضمنيُّ** (`createImplicitWithinTx`): يُولَّد مع الشراء بكلِّ سطوره المخزنية بتاريخ الشراء ما لم يُطلب
 *   غيرُه — تجربةُ اليوم كما هي (`ق-١١٢٢`/⑤).
 * - **المسجَّل** (`record`): على شراءٍ قائم، جزئيّاً أو مكمِّلاً، بتاريخِ وصولٍ **هو تاريخُ الطبقة**؛ وما لم
 *   يُستلم لا طبقةَ له ولا مخزونَ في الميزانية.
 * - **الإلغاء** (`voidReceipt`): عكسٌ لا محو — بشرط ألّا يكون استُهلك من طبقاته شيء.
 * - **المطابقة** (`reconciliation`): حارسُ الرصيد — يقرأ ما بقي في الوسيط **من المستندات** ويطابقه بالدفتر.
 *
 * ## المحاسبة — قيدان لا قيد (`ق-١١٢١`)
 * قيدُ الشراء يُمدين الوسيطَ بقيمة البنود المخزنية؛ وكلُّ استلامٍ يُمدين `1300` ويُدائن الوسيطَ بما وصل
 * (`postGoodsReceiptEntry`). **والاستلامُ الذي يُكمل السطر يرحّل الفرقَ** عمّا رُحِّل قبله لا كمّيتَه مدوَّرةً —
 * فثلاثةُ استلاماتٍ لسطر `3 × 0.333` ترحّل `0.33 + 0.33 + 0.34 = 1.00` لا `0.99`، ويتصافى الوسيط.
 *
 * ## الفاعل (`§3.5`)
 * مالكُ المنشأة وموظّفوه على شاشة المشتريات (`suppliers`) بفعل «تسجيل» — لا لوحةَ المطوّر؛ والشاشةُ
 * نفسُها بندُ واجهةٍ معلَّق (`ق-١١٠١`).
 */
type Tx = Prisma.TransactionClient;

const RECEIPT_INCLUDE = { lines: true } as const;

export interface PurchaseForReceipt {
  id: string;
  no: string;
  date: Date;
  branchId: string | null;
  supplierId: string;
  supplierName: string;
  exchangeRate: number;
  lines: { id: string; productId: string | null; quantity: Prisma.Decimal | number; unitPrice: Prisma.Decimal | number; batchNo: string | null; expiryDate: Date | null }[];
}

/** قيمةُ سطر شراءٍ بالعملة الأساسية — التدويرُ سطراً سطراً، وقيدُ الشراء يجمع هذه لا يدوّر المجموع. */
export function purchaseLineBase(line: { quantity: Prisma.Decimal | number; unitPrice: Prisma.Decimal | number }, exchangeRate: number): number {
  return round2(Number(line.quantity) * Number(line.unitPrice) * exchangeRate);
}

/** Σ قيمة السطور المخزنية بالعملة الأساسية — ما يُمدين الوسيطَ في قيد الشراء. */
export function stockedBaseOf(lines: PurchaseForReceipt['lines'], exchangeRate: number): number {
  return round2(lines.filter((l) => l.productId).reduce((t, l) => t + purchaseLineBase(l, exchangeRate), 0));
}

/** ما استُلم من سطرٍ حتى الآن (استلاماتٌ غيرُ ملغاة): كمّيةً ومبلغاً مرحَّلاً. */
async function receivedSoFar(tx: Tx, purchaseLineId: string): Promise<{ qty: number; base: number }> {
  const rows = await tx.goodsReceiptLine.findMany({
    where: { purchaseLineId, goodsReceipt: { voidedAt: null } },
    select: { quantity: true, baseAmount: true },
  });
  return {
    qty: roundTo(rows.reduce((t, r) => t + Number(r.quantity), 0), 'DERIVED_QUANTITY'),
    base: round2(rows.reduce((t, r) => t + Number(r.baseAmount), 0)),
  };
}

@Injectable()
export class GoodsReceiptsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** `GR-YYYY-NNNN` — من العدّاد الذرّيّ (`ق-٣٢٨`)؛ والأعلى القائمُ يُقرأ مرّةً عند البذر (استلاماتُ ما قبل البناء مرقَّمةٌ به). */
  private nextNumber(tx: Tx, companyId: string, date: Date): Promise<string> {
    return nextDocumentNumber(tx, companyId, date, { kind: 'GR', pad: 4 }, (prefix) => highestSequenceOf(tx.goodsReceipt, prefix));
  }

  /**
   * الاستلامُ الضمنيّ — كلُّ سطورِ الشراء المخزنية بتاريخ الشراء، في معاملة الشراء نفسِها.
   * يعيد `null` لشراءٍ خدميّ (لا سطرَ مخزنيّ) — فلا استلامَ يُكتب لما لا رفَّ له.
   */
  async createImplicitWithinTx(tx: Tx, companyId: string, purchase: PurchaseForReceipt, explicitWarehouseId: string | null | undefined) {
    const stocked = purchase.lines.filter((l) => l.productId);
    if (stocked.length === 0) return null;
    const warehouseId = await resolveReceiptWarehouse(tx, explicitWarehouseId, purchase.branchId);
    const no = await this.nextNumber(tx, companyId, purchase.date);
    const receipt = await tx.goodsReceipt.create({
      data: {
        companyId,
        no,
        purchaseId: purchase.id,
        warehouseId,
        branchId: purchase.branchId,
        receivedAt: purchase.date,
        implicit: true,
        lines: {
          create: stocked.map((l) => ({
            companyId,
            purchaseLineId: l.id,
            quantity: l.quantity,
            baseAmount: purchaseLineBase(l, purchase.exchangeRate),
          })),
        },
      } as unknown as Prisma.GoodsReceiptUncheckedCreateInput,
      include: RECEIPT_INCLUDE,
    });
    await this.writeShelfAndPost(tx, companyId, purchase, receipt, warehouseId, stocked.map((l) => ({ line: l, quantity: Number(l.quantity), batchNo: l.batchNo, expiryDate: l.expiryDate })));
    return receipt;
  }

  /**
   * استلامٌ مسجَّل على شراءٍ قائم — جزئيٌّ أو مكمِّل (`ق-١١٢٢`/②).
   * الشراءُ يجب أن يكون شراءً لا إشعاراً، غيرَ ملغى، وسطورُه المطلوبة حيّةً مخزنيةً وله، والكمّيةُ لا تتجاوز ما بقي.
   */
  record(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string, dto: CreateGoodsReceiptDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const purchase = await tx.purchase.findFirst({
          where: { id: purchaseId, ...branchFilter(allowedBranchIds) },
          include: { supplier: { select: { name: true } }, lines: { where: { supersededAt: null } } },
        });
        if (!purchase) throw new NotFoundException(MSG.purchase_not_found);
        if (purchase.docType !== 'PURCHASE') throw new ConflictException(MSG.goods_receipt_on_note);
        if (purchase.voidedAt) throw new ConflictException(formatMessage(MSG.purchase_voided, { no: purchase.no }));

        const receivedAt = new Date(dto.receivedAt);
        const rate = Number(purchase.exchangeRate);
        const byId = new Map(purchase.lines.map((l) => [l.id, l]));
        const wanted: { line: (typeof purchase.lines)[number]; quantity: number; batchNo: string | null; expiryDate: Date | null; baseAmount: number }[] = [];
        const seen = new Set<string>();
        for (const dl of dto.lines) {
          if (seen.has(dl.purchaseLineId)) throw new BadRequestException(MSG.goods_receipt_line_repeated);
          seen.add(dl.purchaseLineId);
          const line = byId.get(dl.purchaseLineId);
          if (!line) throw new BadRequestException(MSG.goods_receipt_line_not_of_purchase);
          if (!line.productId) throw new BadRequestException(MSG.goods_receipt_line_not_stocked);
          const qty = roundTo(dl.quantity, 'DERIVED_QUANTITY');
          const done = await receivedSoFar(tx, line.id);
          const remainingQty = roundTo(Number(line.quantity) - done.qty, 'DERIVED_QUANTITY');
          if (qty > remainingQty) {
            throw new ConflictException(formatMessage(MSG.goods_receipt_exceeds_remaining, { no: purchase.no, remaining: String(remainingQty), requested: String(qty) }));
          }
          const lineBase = purchaseLineBase(line, rate);
          // المكمِّلُ يرحّل الفرقَ عمّا رُحِّل قبله — لا كمّيتَه مدوَّرةً — فيتصافى الوسيط بلا هللة.
          const baseAmount = qty === remainingQty ? round2(lineBase - done.base) : Math.min(round2(qty * Number(line.unitPrice) * rate), round2(lineBase - done.base));
          wanted.push({ line, quantity: qty, batchNo: dl.batchNo?.trim() || line.batchNo, expiryDate: dl.expiryDate ? new Date(dl.expiryDate) : line.expiryDate, baseAmount });
        }

        const warehouseId = await resolveReceiptWarehouse(tx, dto.warehouseId ?? null, purchase.branchId);
        const no = await this.nextNumber(tx, companyId, receivedAt);
        const receipt = await tx.goodsReceipt.create({
          data: {
            companyId,
            no,
            purchaseId: purchase.id,
            warehouseId,
            branchId: purchase.branchId,
            receivedAt,
            implicit: false,
            notes: dto.notes?.trim() || null,
            lines: { create: wanted.map((w) => ({ companyId, purchaseLineId: w.line.id, quantity: w.quantity, baseAmount: w.baseAmount })) },
          } as unknown as Prisma.GoodsReceiptUncheckedCreateInput,
          include: RECEIPT_INCLUDE,
        });
        const forReceipt: PurchaseForReceipt = {
          id: purchase.id,
          no: purchase.no,
          date: purchase.date,
          branchId: purchase.branchId,
          supplierId: purchase.supplierId,
          supplierName: purchase.supplier.name,
          exchangeRate: rate,
          lines: purchase.lines,
        };
        await this.writeShelfAndPost(tx, companyId, forReceipt, receipt, warehouseId, wanted);
        // ⚖️ `ق-١٣٤٢` حصّةُ ما وصل من الضريبة غيرِ القابلة للخصم تنتقل من الوسيط إلى طبقتها الجديدة — بتاريخ الاستلام.
        await reconcileNonDeductibleVat(tx, companyId, purchase.id, { date: receivedAt, trigger: 'RECEIPT', labelSuffix: `استلام ${receipt.no}` });
        return tx.goodsReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: RECEIPT_INCLUDE });
      }),
    );
  }

  /** الرفُّ ثم القيد — فإن رُفض الرفُّ سقطت المعاملةُ قبل أن يُكتب قيد (كما في الشراء). */
  private async writeShelfAndPost(
    tx: Tx,
    companyId: string,
    purchase: PurchaseForReceipt,
    receipt: { id: string; no: string; receivedAt: Date; lines: { id: string; purchaseLineId: string; baseAmount: Prisma.Decimal }[] },
    warehouseId: string,
    wanted: { line: PurchaseForReceipt['lines'][number]; quantity: number; batchNo: string | null; expiryDate: Date | null }[],
  ) {
    const receiptLineByPurchaseLine = new Map(receipt.lines.map((rl) => [rl.purchaseLineId, rl]));
    await receiveStockedLines(tx, {
      companyId,
      branchId: purchase.branchId,
      warehouseId,
      date: receipt.receivedAt,
      exchangeRate: purchase.exchangeRate,
      ref: receipt.no,
      lines: wanted.map((w) => ({
        id: w.line.id,
        goodsReceiptLineId: receiptLineByPurchaseLine.get(w.line.id)!.id,
        productId: w.line.productId,
        quantity: w.quantity,
        unitPrice: w.line.unitPrice,
        batchNo: w.batchNo,
        expiryDate: w.expiryDate,
      })),
    });
    const baseAmount = round2(receipt.lines.reduce((t, rl) => t + Number(rl.baseAmount), 0));
    const entry = await postGoodsReceiptEntry(tx, companyId, {
      supplierId: purchase.supplierId,
      branchId: purchase.branchId,
      no: receipt.no,
      purchaseNo: purchase.no,
      date: receipt.receivedAt,
      baseAmount,
    });
    if (entry) await tx.goodsReceipt.update({ where: { id: receipt.id }, data: { journalEntryId: entry.id } });
  }

  /**
   * استلاماتُ ما قبل البناء رُحِّلت داخل قيد شرائها (`journalEntryId` فارغ). حين يُعاد ترحيلُ ذلك الشراء
   * (تعديلٌ يمسّ القيد) يصير قيدُه على الوسيط — فتأخذ استلاماتُه الحيّةُ قيودَها حينها، ولا يبقى مخزونٌ بلا قيد.
   *
   * **على مستوى المنشأة بحقّها**: استلاماتُ شراءٍ بعينه تُقرأ بمعرّفه لا بفرع القارئ — فالشراءُ نفسُه قُصر على
   * فروع القارئ حين قُرئ، واستلامٌ في فرعٍ محجوب لشراءٍ مرئيّ يُترك بلا قيدٍ لو رُشِّح فيبقى مخزونٌ بلا `1300`.
   */
  async postPendingReceiptEntriesWithinTx(tx: Tx, companyId: string, purchase: Omit<PurchaseForReceipt, 'lines'>) {
    const pending = await tx.goodsReceipt.findMany({
      where: { purchaseId: purchase.id, voidedAt: null, journalEntryId: null },
      include: RECEIPT_INCLUDE,
    });
    for (const receipt of pending) {
      const baseAmount = round2(receipt.lines.reduce((t, rl) => t + Number(rl.baseAmount), 0));
      const entry = await postGoodsReceiptEntry(tx, companyId, {
        supplierId: purchase.supplierId,
        branchId: purchase.branchId,
        no: receipt.no,
        purchaseNo: purchase.no,
        date: receipt.receivedAt,
        baseAmount,
      });
      if (entry) await tx.goodsReceipt.update({ where: { id: receipt.id }, data: { journalEntryId: entry.id } });
    }
    return pending.length;
  }

  /** استلاماتُ شراءٍ بسطورها وما بقي من كلِّ سطرٍ للاستلام. */
  listForPurchase(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, ...branchFilter(allowedBranchIds) },
        select: { id: true, exchangeRate: true, lines: { where: { supersededAt: null, productId: { not: null } } } },
      });
      if (!purchase) throw new NotFoundException(MSG.purchase_not_found);
      const receipts = await tx.goodsReceipt.findMany({ where: { purchaseId }, orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }], include: RECEIPT_INCLUDE });
      const remaining = [];
      for (const line of purchase.lines) {
        const done = await receivedSoFar(tx, line.id);
        remaining.push({
          purchaseLineId: line.id,
          ordered: Number(line.quantity),
          received: done.qty,
          remaining: roundTo(Number(line.quantity) - done.qty, 'DERIVED_QUANTITY'),
          baseAmount: purchaseLineBase(line, Number(purchase.exchangeRate)),
          basePosted: done.base,
        });
      }
      return { receipts, remaining };
    });
  }

  /** إلغاءُ استلامٍ مسجَّل: عكسٌ لا محو، ولا يُلغى ما استُهلك منه. */
  async voidReceipt(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string, receiptId: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({ where: { id: purchaseId, ...branchFilter(allowedBranchIds) }, select: { id: true, no: true, branchId: true } });
      if (!purchase) throw new NotFoundException(MSG.purchase_not_found);
      const receipt = await tx.goodsReceipt.findFirst({ where: { id: receiptId, purchaseId }, select: { id: true, no: true, voidedAt: true } });
      if (!receipt) throw new NotFoundException(MSG.goods_receipt_not_found);
      if (receipt.voidedAt) throw new ConflictException(MSG.goods_receipt_voided);
      await reverseGoodsReceipt(tx, {
        companyId,
        branchId: purchase.branchId,
        date: await companyToday(tx, companyId),
        documentNo: receipt.no,
        reason: `إلغاءُ استلام ${receipt.no}`,
        receiptId: receipt.id,
      });
    });
  }

  /**
   * ⭐ **حارسُ الرصيد** (`ق-١١٢١`: «ما بقي فيه = مستلَمٌ لم يُفوتر، ويُعدّ») — يقرأ **من المستندات** لا من الدفتر:
   * لكلِّ سطرِ شراءٍ مخزنيٍّ حيّ (لشراءٍ غيرِ ملغى رُحِّل بعد البناء) الفرقُ بين ما فُوتر (`purchaseLineBase`)
   * وما استُلم (Σ `baseAmount` استلاماته غيرِ الملغاة): موجبٌ ⇒ مفوتَرٌ لم يُستلم (مدينٌ في الوسيط) ·
   * سالبٌ ⇒ مستلَمٌ لم يُفوتر (دائنٌ — لا يقع اليوم لأن مرجعَ الشراء إلزاميّ، ويُعدّ ليُرى إن وقع).
   * ثم يُطابَق المتوقَّعُ برصيد حساب الوسيط في الدفتر، **والفرقُ يُعلَن لا يُصلَح**.
   *
   * ⚠️ **وحدُّه معلَن**: ما رُحِّل قبل البناء رُحِّل على `1300` مباشرةً ولم يمرّ بالوسيط، فيُستثنى بقيده
   * (قيدُ الشراء أقدمُ من هجرة `٢٥`) ويُعدّ — لا يُلفَّق له وسيطٌ ولا يُقرأ فرقاً.
   *
   * **على مستوى المنشأة بحقّها**: الوسيطُ حسابٌ واحد في دليل المنشأة والدفترُ دفترٌ واحد — فمطابقةُ رصيده تجمع
   * مشترياتِ الفروع كلِّها وأسطرَ القيد كلَّها، ومطابقةٌ مقصورةٌ على فرعٍ تقارن جزءَ المستندات برصيدٍ كامل فتكذب.
   */
  reconciliation(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const migration = await tx.$queryRaw<{ finished_at: Date | null }[]>`
        SELECT finished_at FROM _prisma_migrations WHERE migration_name = '20260919140000_goods_receipts' LIMIT 1
      `;
      const since = migration[0]?.finished_at ?? null;
      if (!since) throw new ConflictException(MSG.goods_receipt_migration_missing);

      const purchases = await tx.purchase.findMany({
        where: { docType: 'PURCHASE', voidedAt: null, lines: { some: { productId: { not: null }, supersededAt: null } } },
        select: {
          id: true,
          no: true,
          exchangeRate: true,
          journalEntry: { select: { createdAt: true } },
          lines: { where: { supersededAt: null, productId: { not: null } }, select: { id: true, quantity: true, unitPrice: true } },
        },
      });

      let invoicedNotReceived = 0;
      let receivedNotInvoiced = 0;
      let linesOpen = 0;
      let legacyPurchases = 0;
      let unpostedPurchases = 0;
      const open: { purchaseNo: string; purchaseLineId: string; invoiced: number; received: number; difference: number }[] = [];
      for (const p of purchases) {
        // شراءٌ بلا قيد (دليلٌ ناقص عند إنشائه) لا يُقاس على الدفتر؛ وما رُحِّل قبل البناء لم يمرّ بالوسيط.
        if (!p.journalEntry) {
          unpostedPurchases += 1;
          continue;
        }
        if (p.journalEntry.createdAt < since) {
          legacyPurchases += 1;
          continue;
        }
        const rate = Number(p.exchangeRate);
        for (const line of p.lines) {
          const invoiced = purchaseLineBase(line, rate);
          const received = (await receivedSoFar(tx, line.id)).base;
          const difference = round2(invoiced - received);
          if (difference === 0) continue;
          linesOpen += 1;
          if (difference > 0) invoicedNotReceived = round2(invoicedNotReceived + difference);
          else receivedNotInvoiced = round2(receivedNotInvoiced - difference);
          open.push({ purchaseNo: p.no, purchaseLineId: line.id, invoiced, received, difference });
        }
      }

      // الحسابُ يُقرأ ولا يُنشأ هنا — مطابقةٌ لا تكتب؛ ومنشأةٌ بلا شراءٍ مخزنيٍّ بعدُ رصيدُها صفرٌ بلا حساب.
      const company = await tx.company.findUnique({ where: { id: companyId }, select: { receiptClearingAccountId: true } });
      const account = company?.receiptClearingAccountId
        ? await tx.account.findUnique({ where: { id: company.receiptClearingAccountId }, select: { id: true, code: true, name: true } })
        : null;
      const sums = account ? await tx.journalLine.aggregate({ where: { accountId: account.id }, _sum: { debit: true, credit: true } }) : null;
      const debit = round2(Number(sums?._sum.debit ?? 0));
      const credit = round2(Number(sums?._sum.credit ?? 0));
      // رصيدُ الوسيط دائناً موجباً (حسابُ التزام): ما استُلم ولم يُفوتر − ما فُوتر ولم يُستلم.
      const ledgerBalance = round2(credit - debit);
      // ⚖️ `ق-١٣٤٢` وحصّةُ الضريبة غيرِ القابلة للخصم لما فُوتر ولم يُستلم تنتظر في الوسيط مدينةً حتى تجد طبقتَها —
      // تُقرأ من سطور أحداثها (مستنداتٌ بعد البناء وحدَها؛ والمُلغى صافيه صفر).
      const pending = await tx.nonDeductibleVatEventLine.aggregate({ where: { placement: 'CLEARING' }, _sum: { baseAmount: true } });
      const nonDeductiblePending = round2(Number(pending._sum.baseAmount ?? 0));
      const expected = round2(receivedNotInvoiced - invoicedNotReceived - nonDeductiblePending);
      return {
        account: account ? { code: account.code, name: account.name } : null,
        ledgerBalance,
        expected,
        difference: round2(ledgerBalance - expected),
        invoicedNotReceived,
        receivedNotInvoiced,
        nonDeductiblePending,
        linesOpen,
        open,
        legacyPurchases,
        unpostedPurchases,
        since,
      };
    });
  }
}
