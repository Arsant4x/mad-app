import { Prisma } from '@prisma/client';
import { roundTo } from '../common/money/rounding';

/**
 * محرّك التكلفة — **الطبقات هي البنية، والمتوسط دالةٌ فوقها**.
 *
 * قرار المالك (ق-١): FIFO بطبقات هو الأساس، والمتوسط المرجّح **دالة استهلاك**
 * تُكتب متى طلبها تاجر. والحجّة: **الأدقّ يُبنى أولاً والأبسط دالةٌ فوقه،
 * والعكس مستحيل** — من بدأ بالمتوسط لا يملك بياناتٍ يبني منها الطبقات.
 *
 * ## ثلاث قواعد تحكم كل ما في هذا الملف
 *
 * **① الطبقة لا تُحذف.** `qtyRemaining` ينقص ويزيد، والصفر لا يعني الفناء —
 *    يعني الاستهلاك الكامل. ومرتجعٌ بعد شهر يجد طبقته حيث تركها.
 *
 * **② الترتيب `acquiredAt` ثم `createdAt`.** والثاني **فاصلٌ حاسم لا
 *    تزيّد**: طبقتان بتاريخ اقتناءٍ واحد تُستهلكان بترتيبٍ ثابت، لا بما
 *    تُعيده القاعدة صدفةً.
 *
 * **③ الاستهلاك يُسجَّل صفّاً.** بلا `InventoryConsumption` لا يُعكس مرتجع،
 *    ولا يُدقَّق COGS، ولا يُعاد إنتاج رقم سنةٍ مضت.
 */

type Tx = Prisma.TransactionClient;

export interface ConsumeArgs {
  productId: string;
  warehouseId: string;
  /** الكمية المطلوبة — بدقّة `Decimal(18,3)`. */
  qty: number;
  /** حركة الإخراج التي تستهلك. */
  movementId: string;
}

export interface ConsumeResult {
  /** تكلفة ما استُهلك فعلاً — مبلغٌ بخانتين، جاهزٌ لقيد COGS. */
  totalCost: number;
  /** كميةٌ لم تجد طبقة — استُهلكت مؤقتاً بآخر تكلفة معروفة. */
  provisionalQty: number;
  /** التكلفة المستعملة للمؤقّت — للإفصاح لا للحساب. */
  provisionalUnitCost: number | null;
  consumptionIds: string[];
}

/**
 * آخر تكلفة معروفة للصنف في المستودع.
 *
 * ⚠️ **الترتيب بـ`acquiredAt` لا `createdAt`**: طبقةٌ أُدخلت اليوم عن شحنةٍ
 * قديمة ليست «الأحدث» — تكلفتها أقدم من طبقةٍ استُلمت الأسبوع الماضي.
 */
async function lastKnownUnitCost(tx: Tx, productId: string, warehouseId: string): Promise<number> {
  const latest = await tx.inventoryLayer.findFirst({
    where: { productId, warehouseId },
    orderBy: [{ acquiredAt: 'desc' }, { createdAt: 'desc' }],
    select: { unitCost: true },
  });
  if (latest) return Number(latest.unitCost);

  // لا طبقة قطّ في هذا المستودع — يُقرأ آخر ما عُرف عن الصنف نفسه، ثم حقل
  // التكلفة على البطاقة. وصفرٌ في الأخير **ليس خطأً يُخفى**: يظهر في تقرير
  // الاستهلاكات المؤقّتة بتكلفة صفر، وهو أوضح من رقمٍ مخترع.
  const anyLayer = await tx.inventoryLayer.findFirst({
    where: { productId },
    orderBy: [{ acquiredAt: 'desc' }, { createdAt: 'desc' }],
    select: { unitCost: true },
  });
  if (anyLayer) return Number(anyLayer.unitCost);

  const product = await tx.product.findUnique({ where: { id: productId }, select: { cost: true } });
  return Number(product?.cost ?? 0);
}

/**
 * استهلاك FIFO.
 *
 * ## والرصيد السالب — قرار المالك، وصياغته تحديداً
 *
 * **الكاشير لا يتوقف**: منعُ البيع لأن الإدخال متأخر يعني أن التاجر يكره
 * النظام في أول يوم ازدحام. **لكن «تحذير ناعم» غير مقبول** — الدفتر لا يعلم
 * أن الرقم تقدير ما لم يُعلَّم.
 *
 * فما لم تجد له طبقةً يُسجَّل **استهلاكاً مؤقّتاً** (`isProvisional`) بآخر
 * تكلفة معروفة، **بلا طبقة** — لأن اختلاق طبقةٍ وهمية يُفسد «كم استلمنا
 * فعلاً»، فتُحصر الكذبة في التكلفة ولا تمتدّ إلى تاريخ الشراء.
 *
 * ويُسوَّى عند وصول الاستلام الحقيقي، ويُسرَد في تقرير المفتوحة — **فما لا
 * يُرى لا يُسوَّى**.
 */
export async function consumeFifo(tx: Tx, companyId: string, args: ConsumeArgs): Promise<ConsumeResult> {
  const layers = await tx.inventoryLayer.findMany({
    where: { productId: args.productId, warehouseId: args.warehouseId, qtyRemaining: { gt: 0 } },
    orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }],
  });

  let outstanding = args.qty;
  let totalCost = 0;
  const consumptionIds: string[] = [];

  for (const layer of layers) {
    if (outstanding <= 0) break;
    const available = Number(layer.qtyRemaining);
    const take = Math.min(available, outstanding);
    if (take <= 0) continue;

    const unitCost = Number(layer.unitCost);
    const created = await tx.inventoryConsumption.create({
      data: {
        companyId,
        layerId: layer.id,
        movementId: args.movementId,
        qty: take,
        unitCost,
      },
      select: { id: true },
    });
    consumptionIds.push(created.id);

    await tx.inventoryLayer.update({
      where: { id: layer.id },
      data: { qtyRemaining: roundTo(available - take, 'DERIVED_QUANTITY') },
    });

    totalCost += take * unitCost;
    outstanding = roundTo(outstanding - take, 'DERIVED_QUANTITY');
  }

  let provisionalUnitCost: number | null = null;
  if (outstanding > 0) {
    provisionalUnitCost = await lastKnownUnitCost(tx, args.productId, args.warehouseId);
    const created = await tx.inventoryConsumption.create({
      data: {
        // ⭐ **`layerId: null` هو التعريف لا الوصف.** ولا علَم `isProvisional`:
        // علَمٌ يستطيع أن يخالف الواقع فيلزم من يحكم أيّهما يكذب — وهو
        // `lineType: SERVICE` بعينه. و«مؤقّت» = **لا طبقة له**، لأنه بيعٌ سبق
        // استلامه.
        companyId,
        layerId: null,
        movementId: args.movementId,
        qty: outstanding,
        unitCost: provisionalUnitCost,
      },
      select: { id: true },
    });
    consumptionIds.push(created.id);
    totalCost += outstanding * provisionalUnitCost;
  }

  return {
    totalCost: roundTo(totalCost, 'LINE_AMOUNT'),
    provisionalQty: outstanding > 0 ? outstanding : 0,
    provisionalUnitCost,
    consumptionIds,
  };
}

/**
 * إعادة ما استُهلك — **إلى طبقته الأصلية** (قرار المالك).
 *
 * ⚠️ **ولماذا لا طبقةٌ جديدة**: الجديدة تحمل **تاريخ اليوم**، فتُستهلك أخيراً
 * في FIFO — أي أن بضاعةً قديمة رجعت تصير في **ذيل الطابور**، وتقرير عمر
 * المخزون يكذب.
 *
 * والاستهلاك المؤقّت **لا يعود إلى شيء** — لا طبقة له. فتكلفته تُعكس في
 * الحساب ولا يُلمس مخزون.
 *
 * ⛔ **ولا يُستدعى هذا للهدر**: بضاعةٌ لا تعود للرفّ (أغذية محضَّرة) مرتجعٌ
 * محاسبيّ لا مخزنيّ — قيدُها غير قيد المرتجع، ولا طبقة تعود.
 */
export async function restoreConsumption(
  tx: Tx,
  companyId: string,
  originalMovementId: string,
): Promise<{ restoredQty: number; reversedCost: number; provisionalQty: number }> {
  const consumptions = await tx.inventoryConsumption.findMany({
    where: { movementId: originalMovementId },
    orderBy: { createdAt: 'asc' },
  });

  let restoredQty = 0;
  let reversedCost = 0;
  let provisionalQty = 0;

  for (const c of consumptions) {
    const qty = Number(c.qty);
    reversedCost += qty * Number(c.unitCost);

    if (c.layerId === null) {
      provisionalQty += qty;
      continue;
    }

    const layer = await tx.inventoryLayer.findUniqueOrThrow({ where: { id: c.layerId }, select: { qtyRemaining: true } });
    await tx.inventoryLayer.update({
      where: { id: c.layerId },
      data: { qtyRemaining: roundTo(Number(layer.qtyRemaining) + qty, 'DERIVED_QUANTITY') },
    });
    restoredQty += qty;
  }

  return {
    restoredQty: roundTo(restoredQty, 'DERIVED_QUANTITY'),
    reversedCost: roundTo(reversedCost, 'LINE_AMOUNT'),
    provisionalQty: roundTo(provisionalQty, 'DERIVED_QUANTITY'),
  };
}

/**
 * المتوسط المرجّح — **دالة قراءة فوق الطبقات، لا مخطَّطٌ بديل**.
 *
 * وهذا هو قرار المالك مطبَّقاً لا موصوفاً: لا جدول، ولا إعداد، ولا موجة —
 * دالةٌ تُقرأ متى طلبها تاجر. ومن بدأ بالمتوسط بنيةً **لا يستطيع اشتقاق
 * الطبقات منه أبداً**؛ والعكس سطرٌ واحد.
 */
/**
 * الاستهلاكات المؤقّتة **المفتوحة** — مشتقّةٌ لا مخزَّنة.
 *
 * «مؤقّت» = `layerId IS NULL`، و«مفتوح» = لا تسويةَ تشير إليه. فلا عمودَ حالةٍ
 * يُحدَّث ولا علَمَ يتقادم — **وقائع لا حالات**، كما في سجل المهام.
 *
 * ⚠️ **وهذا التقرير ليس زينة**: قائمة الدخل قد تحوي تقديراً، ويجب أن يكون
 * **مقروءاً لا مخفياً**. فما لا يُرى لا يُسوَّى.
 */
export function openProvisionalConsumptions(tx: Tx) {
  return tx.inventoryConsumption.findMany({
    where: { layerId: null, settledBy: { is: null } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function weightedAverageCost(tx: Tx, productId: string, warehouseId: string): Promise<number> {
  const layers = await tx.inventoryLayer.findMany({
    where: { productId, warehouseId, qtyRemaining: { gt: 0 } },
    select: { qtyRemaining: true, unitCost: true },
  });
  const qty = layers.reduce((sum, l) => sum + Number(l.qtyRemaining), 0);
  if (qty === 0) return 0;
  const value = layers.reduce((sum, l) => sum + Number(l.qtyRemaining) * Number(l.unitCost), 0);
  return roundTo(value / qty, 'UNIT_COST');
}
