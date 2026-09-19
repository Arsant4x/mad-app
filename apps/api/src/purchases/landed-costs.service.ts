import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { branchFilter } from '../branches/branch-scope.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postLandedCostEntry, postReversalEntry } from '../journal/auto-posting.util';
import { CreateLandedCostDto } from './dto/create-landed-cost.dto';
import { purchaseLineBase } from './goods-receipts.service';
import { spreadCostOverLayer, unitCostAfterShelfDelta } from './layer-cost-spread.util';

/**
 * ⭐ **التكلفةُ المحمَّلة — توزيعُ فاتورةٍ خدمية على طبقاتٍ مسمّاة** (`٧` · `ق-١١٤٥` · `ق-١١٤٦`).
 *
 * ## ما يفعله
 * - **التوزيع** (`distribute`): سطرُ شراءٍ خدميّ (بلا صنف — شحنٌ · تخليصٌ · رسوم) يُوزَّع على طبقاتِ استلامٍ
 *   بالقيمة أو بالكمّية أو يدوياً؛ لكلِّ طبقةٍ نصيبُها: ما على الرفّ يرفع تكلفتَها (`1300`)، وما استُهلك قبل
 *   الوصول تكلفةُ مبيعاتٍ في فترة التوزيع (`5100`) — الدالّةُ المشتركةُ مع إشعار السعر (`layer-cost-spread.util`).
 * - **الإلغاء** (`voidDistribution`): عكسٌ لا محو — يُرفض بعد استهلاكٍ لاحق من طبقاته (حدٌّ معلَن).
 * - **القراءة** (`listForPurchase`): توزيعاتُ شراءٍ خدميّ بسطورها، وما بقي من سطوره الخدمية بلا توزيع.
 *
 * ## نقطةُ التعليق الطبقةُ (`ق-١١٤٦`)
 * سطرُ الاستلام ⟵ حركتُه ⟵ طبقتُه (`1:1` مقيساً) ولا مفتاحَ مباشراً — فالطبقةُ تُسمّى بمعرّفها أو باستلامها
 * (فتُؤخذ طبقاتُ سطوره كلُّها)، ويُشترط أن تكون من استلامٍ قائم. وإرساليةٌ تصل استلاماتٍ عدّة تُوزَّع عليها معاً.
 *
 * ## المحاسبة (`ق-١٠٧٥`)
 * قيدُ الشراء الخدميّ لا يُمسّ؛ التوزيعُ قيدُ إعادة تصنيفٍ مستقلّ (`postLandedCostEntry`)، وإلغاؤه قيدُ عكس.
 *
 * ## الفاعل (`§3.5`)
 * مالكُ المنشأة وموظّفوه على شاشة المشتريات (`suppliers`) بفعل «تسجيل» — ولا شاشةَ بعد (`ق-١١٠١`).
 */
type Tx = Prisma.TransactionClient;
type Method = 'VALUE' | 'QUANTITY' | 'MANUAL';

const DISTRIBUTION_INCLUDE = {
  lines: { include: { layer: { select: { id: true, productId: true, warehouseId: true, qtyReceived: true, qtyRemaining: true, unitCost: true, acquiredAt: true } } } },
} as const;

/** تسامحُ مطابقة المجموع اليدويّ — نصفُ هللة كما في تسوية السداد. */
const SUM_EPS = 0.005;

interface CandidateLayer {
  id: string;
  qtyReceived: number;
  qtyRemaining: number;
  unitCost: number;
  /** قيمةُ سطر استلامها الأساسية — وزنُ التوزيع بالقيمة. */
  receiptLineBase: number;
  receiptNo: string;
}

@Injectable()
export class LandedCostsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * الطبقاتُ المرشَّحة: بمعرّفاتها و/أو طبقاتُ الاستلامات المسمّاة — وكلُّها من استلامٍ قائم (`GOODS_RECEIPT`
   * وحركتُها تحمل سطرَ استلامٍ غيرِ ملغى)، وإلا رُدّت باسمها. والتكرارُ يُرفض لا يُدمج.
   */
  private async candidateLayers(tx: Tx, layerIds: string[], goodsReceiptIds: string[]): Promise<CandidateLayer[]> {
    const wanted: string[] = [];
    const seen = new Set<string>();
    const push = (id: string) => {
      if (seen.has(id)) throw new BadRequestException(MSG.landed_cost_layer_repeated);
      seen.add(id);
      wanted.push(id);
    };
    for (const id of layerIds) push(id);
    if (goodsReceiptIds.length > 0) {
      const receipts = await tx.goodsReceipt.findMany({
        where: { id: { in: goodsReceiptIds }, voidedAt: null },
        select: { id: true, lines: { select: { stockMovements: { where: { type: 'IN' }, select: { layers: { select: { id: true } } } } } } },
      });
      if (receipts.length !== new Set(goodsReceiptIds).size) throw new NotFoundException(MSG.goods_receipt_not_found);
      for (const r of receipts) for (const l of r.lines) for (const m of l.stockMovements) for (const layer of m.layers) push(layer.id);
    }
    if (wanted.length === 0) throw new BadRequestException(MSG.landed_cost_no_layers);

    const rows = await tx.inventoryLayer.findMany({
      where: { id: { in: wanted } },
      select: {
        id: true,
        sourceType: true,
        qtyReceived: true,
        qtyRemaining: true,
        unitCost: true,
        sourceMovement: { select: { goodsReceiptLine: { select: { baseAmount: true, goodsReceipt: { select: { no: true, voidedAt: true } } } } } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return wanted.map((id) => {
      const row = byId.get(id);
      const receiptLine = row?.sourceMovement?.goodsReceiptLine;
      if (!row || row.sourceType !== 'GOODS_RECEIPT' || !receiptLine || receiptLine.goodsReceipt.voidedAt) {
        throw new BadRequestException(formatMessage(MSG.landed_cost_layer_not_receipt, { layerId: id }));
      }
      return {
        id,
        qtyReceived: Number(row.qtyReceived),
        qtyRemaining: Number(row.qtyRemaining),
        unitCost: Number(row.unitCost),
        receiptLineBase: Number(receiptLine.baseAmount),
        receiptNo: receiptLine.goodsReceipt.no,
      };
    });
  }

  /** الأنصبةُ بالوزن — مدوَّرةً هللةً، والأخيرُ يحمل بقيّةَ التدوير فيُساوي المجموعُ قيمةَ السطر بلا هللةٍ عالقة. */
  private sharesByWeight(total: number, weights: number[]): number[] {
    const sum = weights.reduce((t, w) => t + w, 0);
    const effective = sum > 0 ? weights : weights.map(() => 1);
    const effectiveSum = sum > 0 ? sum : weights.length;
    const shares: number[] = [];
    let allocated = 0;
    for (let i = 0; i < effective.length; i++) {
      const share = i === effective.length - 1 ? round2(total - allocated) : round2((total * effective[i]) / effectiveSum);
      shares.push(share);
      allocated = round2(allocated + share);
    }
    if (shares.some((s) => s < 0)) throw new BadRequestException(MSG.landed_cost_no_layers);
    return shares;
  }

  /**
   * توزيعُ سطرٍ خدميّ من شراءٍ قائم — والشراءُ مرحَّلٌ (قيدُه هو ما يُعاد تصنيفُه)، والسطرُ خدميٌّ حيٌّ بقيمةٍ موجبة
   * ولم يُوزَّع بعد؛ والطبقاتُ من استلاماتٍ قائمة؛ والمجموعُ اليدويّ يساوي قيمةَ السطر.
   */
  distribute(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string, dto: CreateLandedCostDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, ...branchFilter(allowedBranchIds) },
        include: { supplier: { select: { name: true } }, lines: { where: { supersededAt: null } } },
      });
      if (!purchase) throw new NotFoundException(MSG.purchase_not_found);
      if (purchase.docType !== 'PURCHASE') throw new ConflictException(MSG.landed_cost_on_note);
      if (purchase.voidedAt) throw new ConflictException(formatMessage(MSG.purchase_voided, { no: purchase.no }));
      if (!purchase.journalEntryId) throw new ConflictException(formatMessage(MSG.landed_cost_purchase_not_posted, { no: purchase.no }));

      const line = purchase.lines.find((l) => l.id === dto.purchaseLineId);
      if (!line) throw new BadRequestException(MSG.landed_cost_line_not_of_purchase);
      if (line.productId) throw new BadRequestException(MSG.landed_cost_line_not_service);
      const rate = Number(purchase.exchangeRate);
      const lineBase = purchaseLineBase(line, rate);
      if (lineBase <= 0) throw new BadRequestException(MSG.landed_cost_line_zero);
      const active = await tx.landedCostDistribution.count({ where: { purchaseLineId: line.id, voidedAt: null } });
      if (active > 0) throw new ConflictException(formatMessage(MSG.landed_cost_line_already_distributed, { no: purchase.no }));

      const method: Method = dto.method ?? 'VALUE';
      let layers: CandidateLayer[];
      let shares: number[];
      if (method === 'MANUAL') {
        if (!dto.lines?.length) throw new BadRequestException(MSG.landed_cost_manual_lines_required);
        layers = await this.candidateLayers(
          tx,
          dto.lines.map((l) => l.layerId),
          [],
        );
        shares = dto.lines.map((l) => round2(l.baseAmount));
        const given = round2(shares.reduce((t, s) => t + s, 0));
        if (Math.abs(given - lineBase) > SUM_EPS) {
          throw new ConflictException(formatMessage(MSG.landed_cost_manual_sum_mismatch, { expected: lineBase.toFixed(2), given: given.toFixed(2) }));
        }
      } else {
        layers = await this.candidateLayers(tx, dto.layerIds ?? [], dto.goodsReceiptIds ?? []);
        const weights = layers.map((l) => (method === 'QUANTITY' ? l.qtyReceived : l.receiptLineBase > 0 ? l.receiptLineBase : l.qtyReceived * l.unitCost));
        shares = this.sharesByWeight(lineBase, weights);
      }

      // لكلِّ طبقة: نصيبُها على كلِّ ما استُلم فيها؛ ما على الرفّ يرفع تكلفتَها بكتابةٍ مشروطة بالمتبقّي المقروء
      // (`ق-٨١٤`: بيعٌ متزامن غيّر المتبقّي ⇒ يُرفض ويُعاد)، وما استُهلك حصّتُه إلى `5100`.
      const written: { layerId: string; baseAmount: number; baseInventory: number; baseCogs: number; qtyRemainingAt: number; unitCostBefore: number; unitCostAfter: number }[] = [];
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const share = shares[i];
        const spread = spreadCostOverLayer({
          unitsAffected: layer.qtyReceived,
          perUnitAmount: layer.qtyReceived > 0 ? share / layer.qtyReceived : 0,
          direction: 1,
          qtyRemaining: layer.qtyRemaining,
          unitCost: layer.unitCost,
        });
        const baseInventory = round2(spread.baseInventory);
        const baseCogs = round2(share - baseInventory);
        // التكلفةُ الجديدة من الحصّة **المدوَّرة** — ما يُقيَّد على `1300` هو ما يحمله الرفّ حرفاً.
        const unitCostAfter = unitCostAfterShelfDelta(layer.qtyRemaining, layer.unitCost, baseInventory);
        if (unitCostAfter !== layer.unitCost) {
          const { count } = await tx.inventoryLayer.updateMany({
            where: { id: layer.id, qtyRemaining: layer.qtyRemaining, unitCost: layer.unitCost },
            data: { unitCost: unitCostAfter },
          });
          if (count === 0) throw new ConflictException(formatMessage(MSG.landed_cost_layer_changed, { layerId: layer.id }));
        }
        written.push({ layerId: layer.id, baseAmount: share, baseInventory, baseCogs, qtyRemainingAt: layer.qtyRemaining, unitCostBefore: layer.unitCost, unitCostAfter });
      }

      const baseInventory = round2(written.reduce((t, w) => t + w.baseInventory, 0));
      const baseCogs = round2(written.reduce((t, w) => t + w.baseCogs, 0));
      const date = dto.date ? new Date(dto.date) : purchase.date;
      const distribution = await tx.landedCostDistribution.create({
        data: {
          companyId,
          purchaseId: purchase.id,
          purchaseLineId: line.id,
          method,
          date,
          baseAmount: round2(baseInventory + baseCogs),
          baseInventory,
          baseCogs,
          notes: dto.notes?.trim() || null,
          lines: { create: written.map((w) => ({ companyId, ...w })) },
        },
        select: { id: true },
      });
      const entry = await postLandedCostEntry(tx, companyId, {
        supplierId: purchase.supplierId,
        branchId: purchase.branchId,
        purchaseNo: purchase.no,
        lineDescription: line.description,
        categoryCode: purchase.categoryCode,
        date,
        baseInventory,
        baseCogs,
        layersCount: written.length,
      });
      if (entry) await tx.landedCostDistribution.update({ where: { id: distribution.id }, data: { journalEntryId: entry.id } });
      return tx.landedCostDistribution.findUniqueOrThrow({ where: { id: distribution.id }, include: DISTRIBUTION_INCLUDE });
    });
  }

  /** توزيعاتُ شراءٍ بسطورها، وسطورُه الخدمية الحيّة وحالُ كلٍّ منها (موزَّعٌ · لم يُوزَّع). */
  listForPurchase(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, ...branchFilter(allowedBranchIds) },
        select: { id: true, exchangeRate: true, lines: { where: { supersededAt: null, productId: null }, select: { id: true, description: true, quantity: true, unitPrice: true } } },
      });
      if (!purchase) throw new NotFoundException(MSG.purchase_not_found);
      const distributions = await tx.landedCostDistribution.findMany({ where: { purchaseId }, orderBy: { createdAt: 'asc' }, include: DISTRIBUTION_INCLUDE });
      const activeByLine = new Set(distributions.filter((d) => !d.voidedAt).map((d) => d.purchaseLineId));
      const serviceLines = purchase.lines.map((l) => ({
        purchaseLineId: l.id,
        description: l.description,
        baseAmount: purchaseLineBase(l, Number(purchase.exchangeRate)),
        distributed: activeByLine.has(l.id),
      }));
      return { distributions, serviceLines };
    });
  }

  /**
   * إلغاءُ توزيع: عكسٌ لا محو — تكلفةُ كلِّ طبقةٍ تُخفَّض بحصّتها (لا تُعاد إلى «قبل» حرفاً، فتوزيعٌ لاحق على الطبقة
   * نفسِها يبقى)، بكتابةٍ مشروطة بالمتبقّي لحظةَ التوزيع: **استهلاكٌ لاحق يمنع الإلغاءَ مسمّىً** — لأن ما استُهلك
   * بعد التوزيع خرج بتكلفةٍ تحمل النصيب، وإعادتُه بابٌ لم يُبنَ. والقيدُ يُعكس بتاريخ الإلغاء.
   */
  async voidDistribution(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string, distributionId: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({ where: { id: purchaseId, ...branchFilter(allowedBranchIds) }, select: { id: true, no: true } });
      if (!purchase) throw new NotFoundException(MSG.purchase_not_found);
      const distribution = await tx.landedCostDistribution.findFirst({ where: { id: distributionId, purchaseId }, include: { lines: true } });
      if (!distribution) throw new NotFoundException(MSG.landed_cost_not_found);
      if (distribution.voidedAt) throw new ConflictException(MSG.landed_cost_voided);

      for (const line of distribution.lines) {
        const layer = await tx.inventoryLayer.findUnique({ where: { id: line.layerId }, select: { qtyRemaining: true, unitCost: true } });
        const qtyRemainingAt = Number(line.qtyRemainingAt);
        if (!layer || Number(layer.qtyRemaining) !== qtyRemainingAt) {
          throw new ConflictException(formatMessage(MSG.landed_cost_void_after_consumption, { no: purchase.no }));
        }
        const restored = unitCostAfterShelfDelta(qtyRemainingAt, Number(layer.unitCost), -Number(line.baseInventory));
        const { count } = await tx.inventoryLayer.updateMany({
          where: { id: line.layerId, qtyRemaining: layer.qtyRemaining, unitCost: layer.unitCost },
          data: { unitCost: restored },
        });
        if (count === 0) throw new ConflictException(formatMessage(MSG.landed_cost_void_after_consumption, { no: purchase.no }));
      }

      const voidedAt = new Date();
      const reversal = distribution.journalEntryId
        ? await postReversalEntry(tx, companyId, { entryId: distribution.journalEntryId, date: voidedAt, memo: `عكسُ تكلفةٍ محمَّلة — فاتورة شراء ${purchase.no}` })
        : null;
      await tx.landedCostDistribution.update({ where: { id: distribution.id }, data: { voidedAt, voidJournalEntryId: reversal?.id ?? null } });
    });
  }
}
