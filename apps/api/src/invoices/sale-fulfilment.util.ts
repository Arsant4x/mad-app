import { Prisma } from '@prisma/client';
import { consumeFifo, expiredSaleRefusal, ProvisionalCostSource, readConsumptionView, refusesExpiredSale, restoreConsumptionPartial } from '../inventory/costing.util';
import { roundTo } from '../common/money/rounding';
import { money, qty } from '../common/money/text';

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
      /**
       * (`ق-١٤٦٩` · التوجيه ٢٦٦ §٤هـ) **المؤقّتُ بتكلفة صفر — لكلّ صنفٍ بمصدره**: بيعٌ خرج بلا طبقة ولا تكلفةٍ معروفة لا
       * قيدَ تكلفةٍ له (`postCogsEntry` يتخطّى الصفر) — فيُعلَن هنا ولا يمرّ صامتاً. **ولكلّ صنف**: فاتورةٌ مختلطة
       * مجموعُ تكلفتها غيرُ صفرٍ تُخفيه لو أُعلن على مستوى الفاتورة.
       */
      zeroCostProvisional: { productId: string; qty: number; costSource: ProvisionalCostSource }[];
    }
  | { fulfilled: false; reason: 'NO_WAREHOUSE' | 'NO_TRACKED_PRODUCTS' };

/**
 * **صورةُ الحدّ** (② `ق-١٢٣٥`): ما يخرج في الردّ من التسليم — التكلفةُ مالٌ بخانتين
 * والكمّياتُ بثلاث، نصّاً. والحسابُ داخل الخدمة (قيدُ التكلفة · العدّ) على
 * `FulfilmentResult` الرقميّ كما كان؛ ويُحوَّل هنا لأن المالكَ الواحد لكتابتَي الحركة
 * والتكلفة هو نفسُه من يقول ماذا خرج.
 */
export type FulfilmentReport =
  | {
      fulfilled: true;
      warehouseId: string;
      movements: number;
      belowZero: { productId: string; resultingQty: string }[];
      totalCost: string;
      provisionalQty: string;
      zeroCostProvisional: { productId: string; qty: string; costSource: ProvisionalCostSource }[];
    }
  | { fulfilled: false; reason: 'NO_WAREHOUSE' | 'NO_TRACKED_PRODUCTS' };

export function fulfilmentReport(f: FulfilmentResult): FulfilmentReport {
  if (!f.fulfilled) return f;
  return {
    fulfilled: true,
    warehouseId: f.warehouseId,
    movements: f.movements,
    belowZero: f.belowZero.map((b) => ({ productId: b.productId, resultingQty: qty(b.resultingQty) })),
    totalCost: money(f.totalCost),
    provisionalQty: qty(f.provisionalQty),
    zeroCostProvisional: f.zeroCostProvisional.map((z) => ({ productId: z.productId, qty: qty(z.qty), costSource: z.costSource })),
  };
}

/** ما يُخصم من المستند ومن أيّ مستودع — أو سببُ التخطّي المعلَن. */
type DeductibleResolution<L> = { warehouseId: string; deductible: L[] } | { reason: 'NO_WAREHOUSE' | 'NO_TRACKED_PRODUCTS' };

/**
 * ⚖️ (`ق-١٤٩٠`) **أيُّ السطور يُخصم ومن أيّ مستودع — مصدرٌ واحدٌ للفحص المسبق والتسليم**، فلا يفحص الأوّلُ
 * سطوراً أو مستودعاً غيرَ ما يخصمه الثاني. نُقلت القاعدةُ من `fulfilStockedLines` كما هي لا أُعيدت صياغتُها.
 *
 * **على مستوى المنشأة بحقّها**: «المتعقَّبُ» صنفٌ له حركةٌ في أيّ مستودعٍ وأيّ فرع — فصنفٌ استُلم في فرعٍ
 * آخر مخزنيٌّ هنا أيضاً، وقصرُ هذه القراءة على فروع القارئ يُسقط خصمَه ويجعل الفحصَ يرى غيرَ ما يخصمه التسليم.
 */
async function resolveDeductibleLines<L extends { productId: string | null }>(
  tx: Tx,
  args: { branchId: string | null; warehouseId?: string | null; lines: readonly L[] },
): Promise<DeductibleResolution<L>> {
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
  if (!warehouseId) return { reason: 'NO_WAREHOUSE' };

  const stocked = args.lines.filter((l) => l.productId !== null);
  if (stocked.length === 0) return { reason: 'NO_TRACKED_PRODUCTS' };

  const ids = [...new Set(stocked.map((l) => l.productId!))];
  const tracked = new Set(
    (await tx.stockMovement.findMany({ where: { productId: { in: ids } }, select: { productId: true }, distinct: ['productId'] })).map(
      (m) => m.productId,
    ),
  );
  const deductible = stocked.filter((l) => tracked.has(l.productId!));
  if (deductible.length === 0) return { reason: 'NO_TRACKED_PRODUCTS' };
  return { warehouseId, deductible };
}

export interface SaleExpiryCheckArgs {
  branchId: string | null;
  warehouseId?: string | null;
  /** يومُ المستند — به يقيس التسليمُ الانتهاء (`fulfilStockedLines` ⟵ `consumeFifo`). */
  date: Date;
  /** سطورُ المستند كما ستُكتب — الصنفُ والكمّية. */
  lines: readonly { productId: string | null; quantity: Prisma.Decimal | number }[];
}

/**
 * ⚖️ (`ق-١٤٩٠` · المسار `INV-①`) **الدفعةُ المنتهية تُفحص قبل ترقيم الفاتورة لا بعده.**
 *
 * كان رفضُ البيع من دفعةٍ منتهية (`ق-١٠٨٢`) يقع في `consumeFifo` داخل التسليم — بعد `nextDocumentNumber` —
 * والعدّادُ على منفذٍ مستقلّ يلتزم فوراً (`ق-٣٤٨`)، **فيحترق رقمُ الفاتورة في كلّ رفض**. وهنا يُقرأ ما يقرؤه
 * التسليمُ بعينه: السطورُ والمستودعُ من `resolveDeductibleLines`، والدورةُ الأولى من `readConsumptionView` بيوم
 * المستند — فلا يفترق الفحصُ عن الصرف. ⚠️ **وبمجموع الكمّية لكلّ صنف**: سطران للصنف نفسِه يأخذان من الطبقات
 * نفسِها بالتتابع، فالحكمُ على المجموع لا على كلّ سطرٍ وحدَه (وإلا أجاز الفحصُ ما يرفضه الصرفُ في السطر الثاني).
 *
 * والكمّيةُ تُدوَّر بثلاث خاناتٍ كما تُخزَّن على سطر الفاتورة (`Decimal(18,3)`) — فالصرفُ يقرأ المخزَّن.
 *
 * ⚠️ **وحدُّه معلَن**: يمنع الحرقَ الذي يُعرف قبل الكتابة؛ وبيعٌ متزامنٌ يأخذ غيرَ المنتهي بين الفحص والصرف يبلغ
 * رفضَ `consumeFifo` الباقي طبقةَ سباق — فيحترق رقمُه هو وحدَه، ولا يُباع منتهٍ في الحالين.
 */
export async function assertSaleNotBlockedByExpiry(tx: Tx, args: SaleExpiryCheckArgs): Promise<void> {
  const stock = await resolveDeductibleLines(tx, args);
  if (!('warehouseId' in stock)) return;

  const requested = new Map<string, number>();
  for (const line of stock.deductible) {
    const productId = line.productId!;
    requested.set(productId, roundTo((requested.get(productId) ?? 0) + roundTo(Number(line.quantity), 'DERIVED_QUANTITY'), 'DERIVED_QUANTITY'));
  }
  for (const [productId, qty] of requested) {
    const view = await readConsumptionView(tx, { productId, warehouseId: stock.warehouseId, exit: 'SALE', date: args.date });
    if (refusesExpiredSale(view, qty)) throw expiredSaleRefusal(view.productName, productId, view.unexpiredAvailable, qty);
  }
}

/**
 * **على مستوى المنشأة بحقّها**: تتبُّعُ الصنف ورصيدُه في المستودع يُقرآن من
 * كلّ الحركات — فالمستودعُ وحدةُ المخزون لا الفرع، والخصمُ من رفٍّ لا يرى
 * القارئ نصفَه يُنزل الرصيدَ تحت الصفر بصمت.
 */
export async function fulfilStockedLines(tx: Tx, args: FulfilmentArgs): Promise<FulfilmentResult> {
  const stock = await resolveDeductibleLines(tx, args);
  if (!('warehouseId' in stock)) return { fulfilled: false, reason: stock.reason };
  const { warehouseId, deductible } = stock;

  let totalCost = 0;
  let provisionalQty = 0;
  const zeroCost = new Map<string, { qty: number; costSource: ProvisionalCostSource }>();

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
    if (consumed.zeroCostQty > 0 && consumed.provisionalCostSource) {
      const was = zeroCost.get(line.productId!);
      zeroCost.set(line.productId!, { qty: (was?.qty ?? 0) + consumed.zeroCostQty, costSource: consumed.provisionalCostSource });
    }
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
    zeroCostProvisional: [...zeroCost].map(([productId, z]) => ({ productId, qty: roundTo(z.qty, 'DERIVED_QUANTITY'), costSource: z.costSource })),
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
  /**
   * ⚖️ `ق-١٣٦٤` — **ما رُفع على العائد بعد خروجه** (تكلفةٌ محمَّلة · إشعارُ سعر · ضريبةٌ غيرُ قابلةٍ للخصم وصلت طبقتَه وهو خارجها)،
   * بالعملة الأساسية: كان حصّتُه قد ذهبت إلى `5100` يومَ الرفع، فتعود الآن إلى `1300` معه — والمستدعي يضمّه إلى عكس التكلفة.
   */
  raisedAfterExit: number;
}

/** صورةُ الحدّ لما عاد إلى الرفّ (② `ق-١٢٣٥`): الكمّيةُ بثلاث والتكلفةُ بخانتين، نصّاً. */
export const restoredReport = (restored: ReturnResult['restored']): { lineId: string; qty: string; cost: string }[] =>
  restored.map((r) => ({ lineId: r.lineId, qty: qty(r.qty), cost: money(r.cost) }));

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
  let raisedAfterExit = 0;

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
    raisedAfterExit += back.raisedAfterExit;
  }

  return {
    restored,
    skipped,
    totalCost: roundTo(totalCost, 'LINE_AMOUNT'),
    provisionalQty: roundTo(provisionalQty, 'DERIVED_QUANTITY'),
    raisedAfterExit: roundTo(raisedAfterExit, 'LINE_AMOUNT'),
  };
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
