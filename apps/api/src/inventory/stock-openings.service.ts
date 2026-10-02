import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { resolveBranchId, warehouseFilter } from '../branches/branch-scope.util';
import { resolveReceiptBatch, toDateOnly } from '../common/batches/stock-batch.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2, roundTo } from '../common/money/rounding';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postProvisionalSettlementEntries } from '../journal/auto-posting.util';
import { openingEntryDate } from '../journal/opening-balance.util';
import { settleProvisionalConsumptions } from '../journal/provisional-settlement.util';
import { postStockOpeningEntry, postStockOpeningVoidEntry } from '../journal/stock-opening-posting.util';
import { closeLayerExactly, createLayerFromMovement } from './costing.util';
import { DeclareStockOpeningDto } from './dto/declare-stock-opening.dto';
import { currentStockQty } from './stock-quantity.util';

/**
 * ⭐ **`٣٠` الأرصدةُ الافتتاحية بالطبقات** (`ق-١١٧٧` · `ق-١١٧٨` · `ق-١١٧٩`) — إعلانُ رصيد الرفّ يومَ الدخول.
 *
 * ## ما يحلّه
 * تاجرٌ يدخل ببضاعةٍ على رفّه كان يُدخلها **حركةً يدوية**: طبقةُ `ADJUSTMENT` **بتاريخ الحركة** لا تاريخ
 * الاقتناء — فيبدأ `FIFO` عنده مقلوباً من يومه الأوّل — وبلا ختمِ مُعلِن، **وبلا قيدٍ على `1300`**.
 *
 * ## ما يفعله (`declare`)
 * - سطورٌ عدّة في معاملةٍ واحدة: لكلِّ سطرٍ حركةُ `IN` بمصدر `OPENING` وطبقةُ `OPENING` **بتاريخ اقتناءٍ يُعلَن
 *   لا يُخمَّن** (`≤` تاريخ الافتتاح)، والدفعةُ بالدالّة القائمة (`resolveReceiptBatch` — معلَنُ التتبّع بلا
 *   دفعةٍ يُرفض؛ **لا نمطان** — `ق-١١٧٧/③`).
 * - **تاريخُ افتتاحٍ واحد للمنشأة**: يُعلَن مرّةً أو يُشتقّ من بداية السنة المالية (كما `3.8`)، ويُردّ ثانٍ مسمّىً؛
 *   ولا حركةَ مخزونٍ على صنفٍ يُعلَن **قبله** (نظيرُ `assertNoMovementBeforeOpening`).
 * - **قيدٌ واحد للإعلان** مدين `1300` / دائن `3900` (حسابُ `3.8` نفسُه) بتاريخ الافتتاح، خاضعٌ لقفل الفترات.
 * - **تسويةُ المؤقّت** بالكاتب القائم (`ق-١٠٧٢/①`: بيعٌ سبق الإعلان يُقيَّد بتكلفةٍ مؤقّتة، والافتتاحُ هو
 *   الحقيقةُ التي كانت على الرفّ).
 * - **يُقبل بلا سند** (`ق-١١٧٧/①`: السندُ شرطُ خصم ضريبة المدخلات لا شرطُ الرصيد) — مختوماً بمن أعلن ومتى،
 *   والسطرُ بلا `evidenceRef` يُعلَن «بلا سند» في التقرير.
 *
 * ## الإلغاء (`voidLine`) — عكسٌ لا محو
 * حركةُ إخراجٍ تُقفل الطبقةَ بعينها (`closeLayerExactly`) وقيدٌ يعكس نصيبَ السطر؛ **ويُرفض بعد استهلاك** —
 * والتصحيحُ سطرُ افتتاحٍ جديد أو تسوية. والمسارُ العامّ لعكس الحركات (`㉙`) لا يمسّ حركاتِ الافتتاح (لها
 * مستندُها).
 *
 * ## القائم (`ق-١١٧٨`)
 * طبقاتُ التسوية بمتبقٍّ **تُعدّ وتُعلَن ولا تُحوَّل** ولا تدخل تقريرَ الافتتاح — يذكرها التقريرُ عدّاً مسمّىً
 * خارج المجموع.
 *
 * ## الفاعل (`§3.5`)
 * مالكُ المنشأة ومن منحه فعلَ `record` على شاشة المخزون — لا لوحةَ المطوّر؛ **ولا شاشةَ** (`ق-١١٧٦`): خادمٌ
 * ومسارٌ، والشاشةُ بندُ واجهةٍ يُفتح مع التجزئة.
 */
type Tx = Prisma.TransactionClient;

const LINES_INCLUDE = { lines: { orderBy: { createdAt: 'asc' as const } } } as const;

export interface Declarer {
  id: string;
  actorType: string;
  name?: string | null;
}

@Injectable()
export class StockOpeningsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** `SO-YYYY-NNNN` — من العدّاد الذرّيّ (`ق-٣٢٨`)؛ والأعلى القائمُ يُقرأ مرّةً عند البذر. */
  private nextNo(tx: Tx, companyId: string, date: Date): Promise<string> {
    return nextDocumentNumber(tx, companyId, date, { kind: 'SO', pad: 4 }, (prefix) => highestSequenceOf(tx.stockOpening, prefix));
  }

  /**
   * تاريخُ الافتتاح المعتمَد للمنشأة: ما أُعلن من قبل — وإلا ما طُلب — وإلا بدايةُ السنة المالية التي تغطّي
   * اليوم (`openingEntryDate` — كما `3.8`). وطلبٌ بتاريخٍ يخالف المعلَنَ يُردّ مسمّىً: **يومٌ واحد للمنشأة**.
   */
  private async resolveOpeningDate(tx: Tx, companyId: string, requested: string | undefined): Promise<Date> {
    const prior = await tx.stockOpening.findFirst({ orderBy: { createdAt: 'asc' }, select: { openingDate: true } });
    const wanted = requested ? toDateOnly(new Date(requested)) : null;
    if (prior) {
      const declared = toDateOnly(prior.openingDate);
      if (wanted && wanted.getTime() !== declared.getTime()) {
        throw new ConflictException(
          formatMessage(MSG.stock_opening_date_mismatch, { declared: declared.toISOString().slice(0, 10), requested: wanted.toISOString().slice(0, 10) }),
        );
      }
      return declared;
    }
    return wanted ?? toDateOnly(await openingEntryDate(tx, companyId));
  }

  /**
   * الافتتاحُ يسبق كلَّ حركة: صنفٌ له حركةُ مخزونٍ بتاريخٍ أسبقَ من تاريخ الافتتاح لا يُعلَن رصيدُه افتتاحاً
   * بذلك التاريخ — كما لا يُعلَن حسابٌ تحرّك قبل افتتاحه (`assertNoMovementBeforeOpening`).
   *
   * **على مستوى المنشأة بحقّها**: سكونُ الصنف قبل تاريخ الافتتاح يُفحص على حركاته في كلِّ فرع — فحركةٌ
   * محجوبةٌ عن المُعلِن تُجيز افتتاحاً يكذب على الرفّ.
   */
  private async assertNoMovementBeforeOpening(tx: Tx, productId: string, openingDate: Date): Promise<void> {
    const prior = await tx.stockMovement.findFirst({
      where: { productId, date: { lt: openingDate } },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    if (!prior) return;
    throw new ConflictException(
      formatMessage(MSG.stock_opening_after_movement, { moved: prior.date.toISOString().slice(0, 10), opening: openingDate.toISOString().slice(0, 10) }),
    );
  }

  declare(companyId: string, allowedBranchIds: string[] | 'all', declarer: Declarer, dto: DeclareStockOpeningDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        if (!dto.lines?.length) throw new BadRequestException(MSG.stock_opening_lines_required);

        const openingDate = await this.resolveOpeningDate(tx, companyId, dto.openingDate);
        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);

        // ١. كلُّ سطرٍ يُفحص قبل أن يُكتب شيء: الصنفُ والمستودعُ والاقتناءُ والدفعة — فرفضٌ في الخامس لا يترك أربعة.
        const products = new Map<string, { id: string; expiryTracked: boolean | null }>();
        const warehouses = new Set<string>();
        const prepared: { line: DeclareStockOpeningDto['lines'][number]; acquiredAt: Date; batchId: string | null; baseAmount: number }[] = [];
        for (const line of dto.lines) {
          let product = products.get(line.productId);
          if (!product) {
            const row = await tx.product.findUnique({ where: { id: line.productId }, select: { id: true, expiryTracked: true } });
            if (!row) throw new NotFoundException(MSG.product_not_found);
            product = row;
            products.set(row.id, row);
            await this.assertNoMovementBeforeOpening(tx, row.id, openingDate);
          }
          if (!warehouses.has(line.warehouseId)) {
            // ⚖️ ومستودعٌ يراه المُعلِن (`ق-١٥٨١`): تقريرُ الافتتاح مرشَّحٌ بمستودعات فروعه، فإعلانُه في مستودع فرعٍ آخر يُردّ كالغائب.
            const wh = await tx.warehouse.findFirst({ where: { id: line.warehouseId, ...warehouseFilter(allowedBranchIds) }, select: { id: true } });
            if (!wh) throw new NotFoundException(MSG.warehouse_not_found);
            warehouses.add(wh.id);
          }
          const acquiredAt = toDateOnly(new Date(line.acquiredAt));
          if (acquiredAt.getTime() > openingDate.getTime()) {
            throw new BadRequestException(
              formatMessage(MSG.stock_opening_acquired_after_opening, { acquired: acquiredAt.toISOString().slice(0, 10), opening: openingDate.toISOString().slice(0, 10) }),
            );
          }
          // ٥+٦ الدفعةُ بالدالّة نفسِها — لا نمطان (ق-١١٧٧/③).
          const batchId = await resolveReceiptBatch(tx, companyId, {
            productId: line.productId,
            expiryTracked: product.expiryTracked,
            batchNo: line.batchNo,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
          });
          prepared.push({ line, acquiredAt, batchId, baseAmount: round2(line.qty * line.unitCost) });
        }

        // ٢. الرأسُ مختوماً بمن أعلن ومتى (ق-١١٧٧/①).
        const no = await this.nextNo(tx, companyId, openingDate);
        const opening = await tx.stockOpening.create({
          data: {
            companyId,
            no,
            openingDate,
            declaredById: declarer.id,
            declaredByType: declarer.actorType,
            declaredByName: declarer.name ?? null,
            notes: dto.notes?.trim() || null,
          } as unknown as Prisma.StockOpeningUncheckedCreateInput,
        });

        // ٣. لكلِّ سطر: حركةٌ داخلة بمصدر OPENING، وطبقةٌ بتاريخ الاقتناء، وسطرُ إعلانٍ يملك ما أُعلن، ثم تسويةُ المؤقّت.
        let settledDelta = 0;
        let settledCount = 0;
        const settledAllocation = { shelf: 0, cogs: 0, writeOff: 0, variance: 0 };
        const today = toDateOnly(new Date());
        for (const p of prepared) {
          const movement = await tx.stockMovement.create({
            data: {
              companyId,
              branchId,
              productId: p.line.productId,
              warehouseId: p.line.warehouseId,
              type: 'IN',
              origin: 'OPENING',
              qty: p.line.qty,
              date: openingDate,
              reason: `رصيدٌ افتتاحيّ ${no}`,
              batchNo: p.batchId ? p.line.batchNo?.trim() : undefined,
              expiryDate: p.batchId && p.line.expiryDate ? new Date(p.line.expiryDate) : undefined,
            } as unknown as Prisma.StockMovementUncheckedCreateInput,
            select: { id: true },
          });
          const layerId = await createLayerFromMovement(tx, companyId, {
            productId: p.line.productId,
            warehouseId: p.line.warehouseId,
            qty: p.line.qty,
            unitCost: p.line.unitCost,
            acquiredAt: p.acquiredAt,
            sourceType: 'OPENING',
            movementId: movement.id,
            batchId: p.batchId,
          });
          await tx.stockOpeningLine.create({
            data: {
              companyId,
              openingId: opening.id,
              movementId: movement.id,
              layerId,
              productId: p.line.productId,
              warehouseId: p.line.warehouseId,
              qty: p.line.qty,
              unitCost: p.line.unitCost,
              baseAmount: p.baseAmount,
              acquiredAt: p.acquiredAt,
              evidenceRef: p.line.evidenceRef?.trim() || null,
            } as unknown as Prisma.StockOpeningLineUncheckedCreateInput,
          });
          const settled = await settleProvisionalConsumptions(tx, companyId, { productId: p.line.productId, warehouseId: p.line.warehouseId, layerId });
          settledDelta = round2(settledDelta + settled.costDelta);
          settledCount += settled.settled;
          for (const k of ['shelf', 'cogs', 'writeOff', 'variance'] as const) settledAllocation[k] = round2(settledAllocation[k] + settled.allocation[k]);
        }

        // ٤. قيدٌ واحد للإعلان — مدين 1300 / دائن 3900 بتاريخ الافتتاح (يخضع للقفل في createJournalEntry).
        const baseAmount = round2(prepared.reduce((t, p) => t + p.baseAmount, 0));
        const entry = await postStockOpeningEntry(tx, companyId, { no, openingDate, baseAmount, branchId });
        if (entry) await tx.stockOpening.update({ where: { id: opening.id }, data: { journalEntryId: entry.id } });

        // ٥. فرقُ تسوية المؤقّت — حدثُ اليوم لا حدثُ الافتتاح: البيعُ قُيّد بتكلفةٍ مؤقّتة والحقيقةُ عُرفت الآن.
        if (settledCount > 0) {
          // ق-١٣٦٣ — فرقُ كلِّ مؤقّتٍ على حساب مصدره: البيعُ تكلفةُ مبيعات، والحركةُ اليدويةُ فروقاتُ المخزون.
          await postProvisionalSettlementEntries(tx, companyId, { branchId, ref: `رصيدٌ افتتاحيّ ${no}`, date: today, allocation: settledAllocation });
        }

        return this.readOne(tx, opening.id, { provisionalSettled: settledCount, provisionalCostDelta: settledDelta });
      }),
    );
  }

  /**
   * تقريرُ الافتتاح: الإعلاناتُ بسطورها (مختومةً، وكلُّ سطرٍ بلا سندٍ مُعلَنٌ كذلك) ومجموعُها — **وطبقاتُ التسوية
   * بمتبقٍّ تُعدّ عدّاً مسمّىً خارج المجموع ولا تُحوَّل** (`ق-١١٧٨`).
   *
   * ⚖️ **بمستودعات القارئ** (توجيه ٢٧٥ · `ق-١٥٨١`): «القوائمُ تُرشَّح بفروع القارئ»، والسطرُ فرعُه فرعُ مستودعه (`warehouseFilter`).
   * فيرى المقيَّدُ سطورَ مستودعات فروعه والمستودعِ الذي لا يشير إليه فرع، والمجموعُ مجموعُها، وطبقاتُ التسوية فيها وحدَها.
   */
  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const visible = await this.visibleWarehouseIds(tx, allowedBranchIds);
      const inVisible = visible ? { warehouseId: { in: visible } } : {};
      const openings = await tx.stockOpening.findMany({
        include: { lines: { where: inVisible, orderBy: { createdAt: 'asc' } } },
        orderBy: [{ openingDate: 'asc' }, { createdAt: 'asc' }],
      });
      const names = await this.namesFor(tx, openings.flatMap((o) => o.lines));
      const items = openings.map((o) => this.present(o, names));
      const activeLines = items.flatMap((o) => o.lines.filter((l) => !l.voidedAt));
      const legacyAdjustment = await tx.inventoryLayer.aggregate({ where: { sourceType: 'ADJUSTMENT', qtyRemaining: { gt: 0 }, ...inVisible }, _count: { _all: true }, _sum: { qtyRemaining: true } });
      return {
        openingDate: openings[0]?.openingDate.toISOString().slice(0, 10) ?? null,
        items,
        totals: {
          lines: activeLines.length,
          baseAmount: round2(activeLines.reduce((t, l) => t + l.baseAmount, 0)),
          withoutEvidence: activeLines.filter((l) => !l.evidenceRef).length,
        },
        // القائمُ قبل البناء — يُعدّ ويُعلَن ولا يُحوَّل ولا يدخل المجموع (ق-١١٧٨).
        legacyAdjustmentLayers: {
          count: legacyAdjustment._count._all,
          qtyRemaining: roundTo(Number(legacyAdjustment._sum.qtyRemaining ?? 0), 'DERIVED_QUANTITY'),
          note: 'طبقاتُ تسويةٍ بمتبقٍّ — قد تكون افتتاحاً مقنَّعاً وقد لا تكون؛ تُعدّ ولا تُحوَّل ولا تُحسب في المجموع (ق-١١٧٨)',
        },
      };
    });
  }

  get(companyId: string, allowedBranchIds: string[] | 'all', id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => this.readOne(tx, id, {}, await this.visibleWarehouseIds(tx, allowedBranchIds)));
  }

  /** مستودعاتُ القارئ (`warehouseFilter`) — أو `null` لمن يرى الفروعَ كلَّها، فلا يُضيَّق شيء. */
  private async visibleWarehouseIds(tx: Tx, allowedBranchIds: string[] | 'all'): Promise<string[] | null> {
    if (allowedBranchIds === 'all') return null;
    return (await tx.warehouse.findMany({ where: warehouseFilter(allowedBranchIds), select: { id: true } })).map((w) => w.id);
  }

  /**
   * إلغاءُ سطرٍ — عكسٌ لا محو: حركةُ إخراجٍ تُقفل طبقتَه بعينها، وقيدٌ يعكس نصيبَه من قيد الإعلان بتاريخ اليوم؛
   * **ويُرفض بعد استهلاك** (التاريخُ الذي بُني عليه لا يُعاد) — والتصحيحُ سطرُ افتتاحٍ جديد أو تسوية.
   */
  voidLine(companyId: string, allowedBranchIds: string[] | 'all', openingId: string, lineId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const opening = await tx.stockOpening.findUnique({ where: { id: openingId }, select: { id: true, no: true } });
      if (!opening) throw new NotFoundException(MSG.stock_opening_not_found);
      // سطرٌ في مستودعٍ لا يراه القارئ غيرُ موجودٍ له (`ق-١٥٨١`)، كما في التقرير.
      const visible = await this.visibleWarehouseIds(tx, allowedBranchIds);
      const line = await tx.stockOpeningLine.findFirst({ where: { id: lineId, openingId, ...(visible ? { warehouseId: { in: visible } } : {}) } });
      if (!line) throw new NotFoundException(MSG.stock_opening_line_not_found);
      if (line.voidedAt) throw new ConflictException(MSG.stock_opening_line_voided);

      const layer = await tx.inventoryLayer.findUniqueOrThrow({ where: { id: line.layerId }, select: { qtyRemaining: true, qtyReceived: true } });
      if (Number(layer.qtyRemaining) !== Number(layer.qtyReceived)) throw new ConflictException(MSG.stock_opening_line_consumed);

      const original = await tx.stockMovement.findUniqueOrThrow({ where: { id: line.movementId }, select: { branchId: true } });
      const branchId = await resolveBranchId(tx, original.branchId, allowedBranchIds, 'mirror');
      const today = toDateOnly(new Date());
      const reversal = await tx.stockMovement.create({
        data: {
          companyId,
          branchId,
          productId: line.productId,
          warehouseId: line.warehouseId,
          type: 'OUT',
          origin: 'OPENING',
          qty: line.qty,
          date: today,
          reason: `إلغاءُ سطرٍ من الرصيد الافتتاحيّ ${opening.no}`,
          reversalOfId: line.movementId,
        } as unknown as Prisma.StockMovementUncheckedCreateInput,
        select: { id: true },
      });
      await closeLayerExactly(tx, companyId, { layerId: line.layerId, movementId: reversal.id });
      const entry = await postStockOpeningVoidEntry(tx, companyId, { no: opening.no, date: today, baseAmount: Number(line.baseAmount), branchId });
      await tx.stockOpeningLine.update({
        where: { id: line.id },
        data: { voidedAt: new Date(), voidMovementId: reversal.id, voidJournalEntryId: entry?.id ?? null },
      });
      return { ...(await this.readOne(tx, opening.id)), resultingQty: await currentStockQty(tx, line.productId, line.warehouseId) };
    });
  }

  private async readOne(tx: Tx, id: string, extra: Record<string, unknown> = {}, visibleWarehouses: string[] | null = null) {
    const opening = await tx.stockOpening.findUnique({
      where: { id },
      include: { lines: { where: visibleWarehouses ? { warehouseId: { in: visibleWarehouses } } : {}, orderBy: { createdAt: 'asc' } } },
    });
    if (!opening) throw new NotFoundException(MSG.stock_opening_not_found);
    const names = await this.namesFor(tx, opening.lines);
    return { ...this.present(opening, names), ...extra };
  }

  private async namesFor(tx: Tx, lines: { productId: string; warehouseId: string }[]) {
    const productIds = [...new Set(lines.map((l) => l.productId))];
    const warehouseIds = [...new Set(lines.map((l) => l.warehouseId))];
    const [products, warehouses] = [
      productIds.length ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true, unitCode: true } }) : [],
      warehouseIds.length ? await tx.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name: true } }) : [],
    ];
    return { products: new Map(products.map((p) => [p.id, p])), warehouses: new Map(warehouses.map((w) => [w.id, w])) };
  }

  private present(
    o: Prisma.StockOpeningGetPayload<{ include: typeof LINES_INCLUDE }>,
    names: { products: Map<string, { name: string; sku: string | null; unitCode: string | null }>; warehouses: Map<string, { name: string }> },
  ) {
    return {
      id: o.id,
      no: o.no,
      openingDate: o.openingDate.toISOString().slice(0, 10),
      declaredById: o.declaredById,
      declaredByType: o.declaredByType,
      declaredByName: o.declaredByName,
      declaredAt: o.createdAt,
      notes: o.notes,
      journalEntryId: o.journalEntryId,
      baseAmount: round2(o.lines.filter((l) => !l.voidedAt).reduce((t, l) => t + Number(l.baseAmount), 0)),
      lines: o.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        productName: names.products.get(l.productId)?.name ?? null,
        sku: names.products.get(l.productId)?.sku ?? null,
        unitCode: names.products.get(l.productId)?.unitCode ?? null,
        warehouseId: l.warehouseId,
        warehouseName: names.warehouses.get(l.warehouseId)?.name ?? null,
        qty: Number(l.qty),
        unitCost: Number(l.unitCost),
        baseAmount: Number(l.baseAmount),
        acquiredAt: l.acquiredAt.toISOString().slice(0, 10),
        evidenceRef: l.evidenceRef,
        // «بلا سند» يُعلَن لا يُمنع (ق-١١٧٧/①).
        withoutEvidence: !l.evidenceRef,
        movementId: l.movementId,
        layerId: l.layerId,
        voidedAt: l.voidedAt,
        voidMovementId: l.voidMovementId,
        voidJournalEntryId: l.voidJournalEntryId,
      })),
    };
  }
}
