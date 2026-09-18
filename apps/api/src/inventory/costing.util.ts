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
/**
 * ⭐ **الكتابةُ نقصانٌ ذرّيٌّ مشروط — لا قيمةٌ مطلقة من قراءةٍ قد تقادمت** (ق-٨١٤).
 *
 * الواقعةُ المقيسة (2026-09-15 · ق-٨٠٦): بيعتان متزامنتان بثلاثٍ على طبقةٍ بعشر —
 * قرأ الاثنان `10` وكتب الاثنان `7`، فبقيت الطبقةُ تُعلن `3` وحداتٍ لا وجود لها،
 * **في `20/20` جولة**. (وطبقاتُ التطوير التي بدت مخالفةً للمعادلة قبل القياس كانت مرتجعاتٍ
 * مشروعة — الإعادةُ تزيد الطبقةَ بلا صفّ استهلاكٍ سالب — لا سباقاتٍ صامتة؛ قِيس 2026-09-15.)
 *
 * والعلاج: `updateMany` بشرط `qtyRemaining >= take` ونقصانٍ بالفرق. تحت
 * `READ COMMITTED` تنتظر المعاملةُ الثانية قفلَ الصفّ ثم **تعيد تقويمَ الشرط على
 * القيمة الملتزَمة** — فإن كفى المتبقّي كُتب الفرق، وإلا لم يُكتب شيء
 * (`count = 0`) فتُعاد قراءةُ الطبقات وتُستأنف الدورةُ من الأقدم. فتصحّ الكتابةُ
 * ولو تقادمت القراءة، **والانتظارُ من الكتابة لا من القراءة** — ذيلُ المعاملة
 * وعلى الصنف الواحد، لا كلُّ البيوع (خلاف قفل العدّاد في ق-٣٤٢).
 *
 * ولماذا لا `decrement` بلا شرط: يقود المتبقّي إلى السالب؛ ولا `FOR UPDATE` عند
 * القراءة: يحتاج `SQL` خاماً ويطيل الانتظار إلى القراءة بلا ضمانٍ إضافيّ مقيس.
 */
const MAX_CONSUME_PASSES = 8;

export async function consumeFifo(tx: Tx, companyId: string, args: ConsumeArgs): Promise<ConsumeResult> {
  let outstanding = args.qty;
  let totalCost = 0;
  const consumptionIds: string[] = [];

  // كلُّ دورةٍ تقرأ ما بقي فيه شيء وتأخذ منه بكتابةٍ مشروطة، من الأقدم. كتابةٌ لم تقع
  // (`count = 0`) تعني أن الطبقةَ تغيّرت تحت أيدينا — فتُقطع الدورةُ وتُعاد القراءة
  // كي يبقى الترتيبُ FIFO لا «ما تيسّر». ودورةٌ لم تأخذ شيئاً تعني أن الطبقات نفدت
  // بالتزامن — فيبقى الباقي استهلاكاً مؤقّتاً كما لو أنه بيعٌ سبق استلامه.
  for (let pass = 0; pass < MAX_CONSUME_PASSES && outstanding > 0; pass++) {
    const layers = await tx.inventoryLayer.findMany({
      where: { productId: args.productId, warehouseId: args.warehouseId, qtyRemaining: { gt: 0 } },
      orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (layers.length === 0) break;

    let tookAny = false;
    let raced = false;
    for (const layer of layers) {
      if (outstanding <= 0) break;
      const available = Number(layer.qtyRemaining);
      const take = Math.min(available, outstanding);
      if (take <= 0) continue;

      const { count } = await tx.inventoryLayer.updateMany({
        where: { id: layer.id, qtyRemaining: { gte: take } },
        data: { qtyRemaining: { decrement: take } },
      });
      if (count === 0) {
        raced = true;
        break;
      }

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
      tookAny = true;

      totalCost += take * unitCost;
      outstanding = roundTo(outstanding - take, 'DERIVED_QUANTITY');
    }
    if (!tookAny && !raced) break;
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
    include: { settledBy: { select: { id: true } } },
  });

  let restoredQty = 0;
  let reversedCost = 0;
  let provisionalQty = 0;

  for (const c of consumptions) {
    // ㉘ مؤقّتٌ سُوِّي: صفُّ تسويته — بطبقةٍ حقيقية وتكلفتها — هو الذي يُعاد ويُحسب، لا الأصلُ (ق-١٠٦٣/١).
    if (c.layerId === null && c.settledBy) continue;
    const qty = Number(c.qty);
    reversedCost += qty * Number(c.unitCost);

    if (c.layerId === null) {
      provisionalQty += qty;
      continue;
    }

    // زيادةٌ ذرّية لا قراءةٌ ثم قيمةٌ مطلقة — الموضعُ الثاني من ثلاثة (ق-٨١٤).
    await tx.inventoryLayer.update({
      where: { id: c.layerId },
      data: { qtyRemaining: { increment: qty } },
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
 * إعادةُ **جزءٍ** ممّا استُهلك — للمرتجع الجزئي (`SPEC 30.3` + `30.4`، موجة أ 2026-09-03).
 *
 * نفس قاعدة `restoreConsumption`: **إلى الطبقة الأصلية لا إلى طبقةٍ جديدة**. والجزء يُعاد
 * **من آخر ما استُهلك إلى أوله** (عكس ترتيب الاستهلاك): فبيعُ ٥ استهلك ٣ من طبقةٍ قديمة
 * و٢ من أحدث، ومرتجعُ ٢ يعيد الاثنتين إلى الأحدث — **فتبقى الطبقة الأقدم مستهلَكةً كما
 * كانت**، وتقرير عمر المخزون لا يكذب في أي الاتجاهين.
 *
 * ⚠️ الكمية المطلوبة لا تتجاوز ما استُهلك — والمستدعي يفحص ذلك **قبل** النداء بحساب ما
 * أُعيد سابقاً على نفس الحركة؛ وهنا حارسٌ ثانٍ يرمي إن تجاوزها.
 */
export async function restoreConsumptionPartial(
  tx: Tx,
  companyId: string,
  originalMovementId: string,
  qty: number,
): Promise<{ restoredQty: number; reversedCost: number; provisionalQty: number }> {
  const all = await tx.inventoryConsumption.findMany({
    where: { movementId: originalMovementId },
    orderBy: { createdAt: 'desc' },
    include: { settledBy: { select: { id: true } } },
  });
  // ㉘ المؤقّتُ المُسوَّى لا يُعدّ ولا يُعاد — صفُّ تسويته يمثّله (ق-١٠٦٣/١).
  const consumptions = all.filter((c) => !(c.layerId === null && c.settledBy));
  const consumed = roundTo(consumptions.reduce((s, c) => s + Number(c.qty), 0), 'DERIVED_QUANTITY');
  let remaining = roundTo(qty, 'DERIVED_QUANTITY');
  if (remaining > consumed) throw new Error(`مرتجعٌ (${remaining}) يتجاوز ما استُهلك (${consumed}) على الحركة ${originalMovementId}`);

  let restoredQty = 0;
  let reversedCost = 0;
  let provisionalQty = 0;

  for (const c of consumptions) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(c.qty));
    remaining = roundTo(remaining - take, 'DERIVED_QUANTITY');
    reversedCost += take * Number(c.unitCost);

    if (c.layerId === null) {
      provisionalQty += take;
      continue;
    }
    // زيادةٌ ذرّية — الموضعُ الثالث من ثلاثة (ق-٨١٤).
    await tx.inventoryLayer.update({
      where: { id: c.layerId },
      data: { qtyRemaining: { increment: take } },
    });
    restoredQty += take;
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

/**
 * ㉘ **طبقةٌ من حركةٍ يدوية** (`ق-١٠٦٣`): إدخالٌ يدويّ أو تسويةٌ موجبة تُنشئ طبقةً بتكلفةٍ **مُدخَلة** —
 * لا من البطاقة (`ق-١٠٦٣/٣`: لا صفرَ صامت). كانت الكمّيةُ تتحرّك والقيمةُ لا: `229` إدخالاً يدوياً بلا طبقة
 * على قاعدة التطوير يومَ البناء (`ق-١٠٦٢`).
 */
export async function createLayerFromMovement(
  tx: Tx,
  companyId: string,
  args: { productId: string; warehouseId: string; qty: number; unitCost: number; acquiredAt: Date; sourceType: 'ADJUSTMENT' | 'TRANSFER' | 'OPENING' | 'RETURN'; movementId: string },
): Promise<string> {
  const layer = await tx.inventoryLayer.create({
    data: {
      companyId,
      productId: args.productId,
      warehouseId: args.warehouseId,
      qtyReceived: args.qty,
      qtyRemaining: args.qty,
      unitCost: args.unitCost,
      acquiredAt: args.acquiredAt,
      sourceType: args.sourceType,
      sourceMovementId: args.movementId,
    },
    select: { id: true },
  });
  return layer.id;
}

/**
 * ㉘ **التحويلُ ينقل الطبقةَ لا الكمّيةَ وحدَها** (`ق-١٠٦٣/٢`): يُستهلك من طبقات المصدر `FIFO` — استهلاكاً
 * مسجَّلاً على حركة التحويل — وتُنشأ في المقصِد طبقةٌ لكلِّ شريحةٍ **بتكلفتها وتاريخ اقتناء أصلها**، فلا يشيخ
 * المخزونُ ولا يتجدّد بالنقل. وما لم يجد طبقةً في المصدر (استهلاكٌ مؤقّت) تُنشأ له في المقصِد طبقةٌ بتكلفته
 * المؤقّتة وتاريخ النقل — ويبقى المؤقّتُ مفتوحاً على المصدر حتى يصله استلامُه. (`33` تحويلاً على قاعدة
 * التطوير سبقت هذا فتركت طبقاتِها في المصدر — تُعلَن وتُعدّ ولا تُرحَّل بلا حكم.)
 */
export async function transferLayers(
  tx: Tx,
  companyId: string,
  args: { productId: string; fromWarehouseId: string; toWarehouseId: string; qty: number; movementId: string; date: Date },
): Promise<{ consumed: ConsumeResult; createdLayers: number }> {
  const consumed = await consumeFifo(tx, companyId, { productId: args.productId, warehouseId: args.fromWarehouseId, qty: args.qty, movementId: args.movementId });
  const slices = await tx.inventoryConsumption.findMany({
    where: { id: { in: consumed.consumptionIds } },
    orderBy: { createdAt: 'asc' },
    include: { layer: { select: { acquiredAt: true } } },
  });
  for (const s of slices) {
    await tx.inventoryLayer.create({
      data: {
        companyId,
        productId: args.productId,
        warehouseId: args.toWarehouseId,
        qtyReceived: s.qty,
        qtyRemaining: s.qty,
        unitCost: s.unitCost,
        acquiredAt: s.layer?.acquiredAt ?? args.date,
        sourceType: 'TRANSFER',
        sourceMovementId: args.movementId,
      },
    });
  }
  return { consumed, createdLayers: slices.length };
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
