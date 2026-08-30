import { Prisma } from '@prisma/client';
import { consumeFifo } from '../inventory/costing.util';
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

    const consumed = await consumeFifo(tx, args.companyId, {
      productId: line.productId!,
      warehouseId,
      qty,
      movementId: movement.id,
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
