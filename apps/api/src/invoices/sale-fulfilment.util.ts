import { Prisma } from '@prisma/client';
import { consumeFifo, restoreConsumptionPartial } from '../inventory/costing.util';
import { roundTo } from '../common/money/rounding';

/**
 * تسليم البيع — **مالكٌ واحد للكتابتين: حركة المخزون وتكلفتها**.
 *
 * ## العطل الذي يعالجه — وقد كان قائماً
 *
 * كان الكاشير يخصم المخزون بنفسه، والفاتورة تُرحّل وحدها. **فالكتابتان
 * لمالكين مختلفين**، ونتيجتُه ما رُصد في `م١`: مسارٌ يعرف الصنف ثم يرميه، فتخرج
 * البضاعة من الرفّ ولا يقول المستند ماذا خرج.
 *
 * ⭐ **وهذا ما طلبه المالك نصّاً**: «قاعدةٌ بنيوية تجعل كل مسارٍ يُنشئ
 * `StockMovement` عاجزاً عن إنشاء سطرٍ بلا صنف — **دالةٌ واحدة تملك
 * الطريقين**، لا انضباطاً يُتذكَّر».
 *
 * فصار **سطر الفاتورة** هو المالك: منه تُشتقّ الحركة، ومنه تُستهلك الطبقة،
 * ومنه يُبنى قيد التكلفة. والكاشير يمرّ من هنا كغيره — **لا مسار ثانياً**.
 *
 * ## وقاعدة «المتعقَّب» تبقى كما كانت
 *
 * «مخزنيّ» = له حركةٌ واحدة على الأقل في الدفتر. فبندٌ بصنفٍ لم يُستلم قطّ
 * (خدمةٌ عُرِّفت صنفاً) **لا يُخصم ولا تُحسب له تكلفة** — وخصمُه كان سيلوّث
 * شاشة الأرصدة بسوالب دائمة لكل خدمة تُباع. **ونُقلت القاعدة كما هي لا
 * أُعيدت صياغتها.**
 */

type Tx = Prisma.TransactionClient;

export interface FulfilmentLine {
  id: string;
  productId: string | null;
  quantity: Prisma.Decimal | number;
}

export interface FulfilmentArgs {
  companyId: string;
  branchId: string | null;
  warehouseId?: string | null;
  date: Date;
  documentNo: string;
  lines: FulfilmentLine[];
}

export type FulfilmentResult =
  | {
      fulfilled: true;
      warehouseId: string;
      movements: number;
      belowZero: { productId: string; resultingQty: number }[];
      /** تكلفة ما خرج — مبلغٌ جاهز لقيد COGS. */
      totalCost: number;
      /** كميةٌ استُهلكت بلا طبقة — **تقديرٌ في قائمة الدخل، ويُعلَن**. */
      provisionalQty: number;
    }
  | { fulfilled: false; reason: 'NO_WAREHOUSE' | 'NO_TRACKED_PRODUCTS' };

/**
 * **على مستوى المنشأة بحقّها**: تتبُّعُ الصنف ورصيدُه في المستودع يُقرآن من
 * كلّ الحركات — فالمستودعُ وحدةُ المخزون لا الفرع، والخصمُ من رفٍّ لا يرى
 * القارئ نصفَه يُنزل الرصيدَ تحت الصفر بصمت.
 */
export async function fulfilStockedLines(tx: Tx, args: FulfilmentArgs): Promise<FulfilmentResult> {
  const warehouseId =
    args.warehouseId ??
    (args.branchId
      ? (await tx.branch.findUnique({ where: { id: args.branchId }, select: { warehouseId: true } }))?.warehouseId ?? null
      : null);

  /**
   * ⚠️ **تخطٍّ مُعلَن لا صامت.** الفاتورة تمضي — منشأةٌ بلا مستودع مربوط
   * تبيع خدماتها ولا يُعقل أن تُمنع — **لكن السبب يعود في الردّ**، فمن باع
   * بضاعةً بلا مستودع يرى لماذا لم تُحسب تكلفتها بدل أن يكتشفه في تقرير هامش
   * بعد شهر.
   */
  if (!warehouseId) return { fulfilled: false, reason: 'NO_WAREHOUSE' };

  const stocked = args.lines.filter((l) => l.productId !== null);
  if (stocked.length === 0) return { fulfilled: false, reason: 'NO_TRACKED_PRODUCTS' };

  const ids = [...new Set(stocked.map((l) => l.productId!))];
  const tracked = new Set(
    (await tx.stockMovement.findMany({ where: { productId: { in: ids } }, select: { productId: true }, distinct: ['productId'] })).map(
      (m) => m.productId,
    ),
  );
  const deductible = stocked.filter((l) => tracked.has(l.productId!));
  if (deductible.length === 0) return { fulfilled: false, reason: 'NO_TRACKED_PRODUCTS' };

  let totalCost = 0;
  let provisionalQty = 0;

  for (const line of deductible) {
    const qty = Number(line.quantity);
    const movement = await tx.stockMovement.create({
      data: {
        companyId: args.companyId,
        productId: line.productId!,
        warehouseId,
        branchId: args.branchId,
        type: 'OUT',
        // ⭐ الحركة تحمل سطرها — فمُشغِّل القاعدة يرفضها إن خالف صنفُها صنفَه
        // أو كان السطر بلا صنف. **المنع تحت الشيفرة لا فيها.**
        origin: 'SALE',
        invoiceLineId: line.id,
        qty,
        date: args.date,
        reason: `بيع ${args.documentNo}`,
      },
      select: { id: true },
    });

    // ٥+٦ البيعُ يسمّي نفسَه: منه وحدَه يُرفض المنتهي مسمًّى (`ق-١٠٨٢`) — والانتهاءُ يُقاس بيوم المستند.
    const consumed = await consumeFifo(tx, args.companyId, {
      productId: line.productId!,
      warehouseId,
      qty,
      movementId: movement.id,
      exit: 'SALE',
      date: args.date,
    });
    totalCost += consumed.totalCost;
    provisionalQty += consumed.provisionalQty;
  }

  const belowZero: { productId: string; resultingQty: number }[] = [];
  for (const productId of new Set(deductible.map((l) => l.productId!))) {
    const agg = await tx.stockMovement.findMany({ where: { productId, warehouseId }, select: { type: true, qty: true } });
    const resultingQty = agg.reduce((t, m) => t + (m.type === 'OUT' ? -Number(m.qty) : Number(m.qty)), 0);
    if (resultingQty < 0) belowZero.push({ productId, resultingQty: roundTo(resultingQty, 'DERIVED_QUANTITY') });
  }

  return {
    fulfilled: true,
    warehouseId,
    movements: deductible.length,
    belowZero,
    totalCost: roundTo(totalCost, 'LINE_AMOUNT'),
    provisionalQty: roundTo(provisionalQty, 'DERIVED_QUANTITY'),
  };
}

// ---------------------------------------------------------------------------
// المرتجع السليم — `SPEC 30.4` (موجة أ، قرار المالك 2026-09-03)
// ---------------------------------------------------------------------------

export interface ReturnLine {
  id: string;
  productId: string | null;
  quantity: Prisma.Decimal | number;
  /** سطر الفاتورة الأصلية الذي يُردّ — بلا هذا الرابط لا مخزونَ يُمسّ. */
  returnsLineId: string | null;
  returnCondition: 'GOOD' | 'DAMAGED' | 'REPAIRABLE' | null;
}

export interface ReturnArgs {
  companyId: string;
  branchId: string | null;
  date: Date;
  documentNo: string;
  lines: ReturnLine[];
}

export interface ReturnResult {
  /** ما عاد إلى الرفّ فعلاً — بسطره وكميته وتكلفته المستعادة. */
  restored: { lineId: string; qty: number; cost: number }[];
  /** ما لم يمسّ المخزون — **معلَناً بسببه** لا صامتاً. */
  skipped: { lineId: string; reason: 'NO_RETURNS_LINE' | 'NOT_STOCKED' | 'NOT_GOOD' | 'NO_PRODUCT' }[];
  totalCost: number;
  provisionalQty: number;
}

/**
 * **ردُّ البضاعة السليمة إلى المخزون** — من المالك الواحد نفسه لكتابتَي الحركة والتكلفة.
 *
 * لكل سطرٍ في الإشعار الدائن يشير إلى سطر بيعٍ أصليّ وحالته `GOOD`:
 *   ① تُعرف حركةُ البيع الأصلية (`OUT` على `returnsLineId`) — فسطرٌ لم تُخصم له بضاعة
 *      (خدمةٌ · صنفٌ غير متعقَّب) **لا يُعاد له شيء** ويُعلَن ذلك؛
 *   ② يُحسب ما أُرجع سابقاً على السطر نفسه من إشعاراتٍ سابقة، ويُرفض ما يتجاوز المبيع؛
 *   ③ تُكتب حركةُ `IN` بمصدر `SALE` تحمل سطر الإشعار (فالمُشغِّل يرفضها إن خالف الصنف)؛
 *   ④ وتُعاد الكمية إلى **طبقاتها الأصلية** من آخر ما استُهلك (`restoreConsumptionPartial`).
 *
 * `DAMAGED`/`REPAIRABLE` تُحفظ حالةً على السطر ولا تمسّ المخزون هنا — معلَّقةٌ على بحث
 * الضريبة (قرار المالك). والمستدعي يرحّل `totalCost` قيدَ عكسٍ للتكلفة.
 *
 * **على مستوى المنشأة بحقّها**: حركةُ البيع الأصلية وما أُرجع عليها تُقرآن
 * بسطر الفاتورة لا بفرع القارئ — فالمرتجعُ يعود إلى طبقاته حيث بيعت، وإرجاعٌ
 * يُقاس على فرعٍ آخر يُعيد مرّتين.
 */
export async function returnStockedLines(tx: Tx, args: ReturnArgs): Promise<ReturnResult> {
  const restored: ReturnResult['restored'] = [];
  const skipped: ReturnResult['skipped'] = [];
  let totalCost = 0;
  let provisionalQty = 0;

  for (const line of args.lines) {
    if (!line.productId) { skipped.push({ lineId: line.id, reason: 'NO_PRODUCT' }); continue; }
    if (!line.returnsLineId) { skipped.push({ lineId: line.id, reason: 'NO_RETURNS_LINE' }); continue; }
    if ((line.returnCondition ?? 'GOOD') !== 'GOOD') { skipped.push({ lineId: line.id, reason: 'NOT_GOOD' }); continue; }

    const original = await tx.stockMovement.findFirst({
      where: { invoiceLineId: line.returnsLineId, type: 'OUT' },
      select: { id: true, qty: true, warehouseId: true, productId: true },
    });
    if (!original) { skipped.push({ lineId: line.id, reason: 'NOT_STOCKED' }); continue; }
    if (original.productId !== line.productId) {
      throw new Error(`سطر المرتجع ${line.id} يحمل صنفاً غير صنف سطر البيع الأصلي ${line.returnsLineId}`);
    }

    const qty = roundTo(Number(line.quantity), 'DERIVED_QUANTITY');
    const priorReturns = await tx.stockMovement.aggregate({
      where: { type: 'IN', origin: 'SALE', invoiceLine: { returnsLineId: line.returnsLineId } },
      _sum: { qty: true },
    });
    const sold = Number(original.qty);
    const already = Number(priorReturns._sum.qty ?? 0);
    if (roundTo(already + qty, 'DERIVED_QUANTITY') > roundTo(sold, 'DERIVED_QUANTITY')) {
      throw new ReturnExceedsSoldError(line.returnsLineId, sold, already, qty);
    }

    const movement = await tx.stockMovement.create({
      data: {
        companyId: args.companyId,
        productId: line.productId,
        warehouseId: original.warehouseId,
        branchId: args.branchId,
        type: 'IN',
        origin: 'SALE',
        invoiceLineId: line.id,
        qty,
        date: args.date,
        reason: `مرتجع ${args.documentNo}`,
      },
      select: { id: true },
    });
    void movement;

    const back = await restoreConsumptionPartial(tx, args.companyId, original.id, qty);
    restored.push({ lineId: line.id, qty, cost: back.reversedCost });
    totalCost += back.reversedCost;
    provisionalQty += back.provisionalQty;
  }

  return { restored, skipped, totalCost: roundTo(totalCost, 'LINE_AMOUNT'), provisionalQty: roundTo(provisionalQty, 'DERIVED_QUANTITY') };
}

/** يُترجَم في الخدمة إلى `BadRequestException` برسالةٍ مفهومة — الخطأ يحمل أرقامه. */
export class ReturnExceedsSoldError extends Error {
  constructor(
    public readonly returnsLineId: string,
    public readonly sold: number,
    public readonly alreadyReturned: number,
    public readonly requested: number,
  ) {
    super(`مرتجع ${requested} يتجاوز المتاح (${sold} مبيع − ${alreadyReturned} مُرجَع) على السطر ${returnsLineId}`);
  }
}
