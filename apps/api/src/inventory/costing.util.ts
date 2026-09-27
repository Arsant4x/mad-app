import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isExpiredOn } from '../common/batches/stock-batch.util';
import { formatMessage, MSG } from '../common/i18n/messages';
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

/** ٥+٦ نوعُ الإخراج: **البيعُ وحدَه** يُرفض منه المنتهي (`ق-١٠٨٢`)؛ وما عداه — شطبٌ · إعادةٌ إلى المورّد · تحويلٌ · تسويةٌ · إخراجٌ يدويّ — يمرّ، وهو المخرجُ الوحيد لمنتهٍ على الرفّ. */
export type ExitKind = 'SALE' | 'OTHER';

/** ٥+٦ سياسةُ الصرف — **تُقرأ من بطاقة الصنف لا ثابت** (`ق-١٠٧٦`/٢): `FEFO` للمعلَن تتبّعُه، و`FIFO` لغيره ولما لم يُعلَن بعد. */
export type ConsumptionPolicy = 'FIFO' | 'FEFO';

export interface ConsumeArgs {
  productId: string;
  warehouseId: string;
  /** الكمية المطلوبة — بدقّة `Decimal(18,3)`. */
  qty: number;
  /** حركة الإخراج التي تستهلك. */
  movementId: string;
  /** نوعُ الإخراج — افتراضُه `OTHER`؛ والبيعُ يسمّي نفسَه. */
  exit?: ExitKind;
  /** يومُ الحركة — به يُقاس انتهاءُ الدفعة؛ افتراضُه الآن. */
  date?: Date;
}

interface OrderableLayer {
  acquiredAt: Date;
  createdAt: Date;
  batch: { expiryDate: Date } | null;
}

/**
 * ٥+٦ **ترتيبُ الطبقات للاستهلاك بالسياسة** — دالةٌ نقيّة تُختبر وحدَها.
 *
 * `FIFO`: `acquiredAt` ثم `createdAt` كما كان. `FEFO`: الدفعاتُ **بالأقرب انتهاءً** فالعمر أوّلاً، **ثم ما لا دفعةَ له
 * بعمره** — بحكم المالك `ق-١١٠٢` (الموجزُ `§٣.٤` أصحّ): الطبقةُ بلا دفعةٍ **مجهولةُ الانتهاء لا قديمةٌ فحسب**، فإخراجُها
 * أوّلاً قد يبيع منتهياً لا نعرف أنه منتهٍ بينما ما له انتهاءٌ معلومٌ باقٍ صالحاً؛ وغرضُ `FEFO` أن يُصرَف ما يقرب انتهاؤه،
 * وما لا انتهاءَ له لا يقرب فيؤخَّر. (كانت تخرج أوّلاً بعمرها حتى الحكم — مخالفةٌ للموجز أُعلنت فعُكست.) ولا تُخمَّن
 * دفعتُها (`ق-١٠٧٦`/٣). والمنتهيةُ أقربُ الكلّ فتتصدّر: وهو المطلوبُ للشطب والإعادة، ويُستثنى منه البيعُ في `consumeFifo`.
 */
export function orderLayersForConsumption<L extends OrderableLayer>(layers: readonly L[], policy: ConsumptionPolicy): L[] {
  const byAge = (a: L, b: L) => a.acquiredAt.getTime() - b.acquiredAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime();
  if (policy === 'FIFO') return [...layers].sort(byAge);
  return [...layers].sort((a, b) => {
    if (!a.batch && !b.batch) return byAge(a, b);
    // ما لا انتهاءَ له يُصرَف بعد ما له انتهاء (ق-١١٠٢).
    if (!a.batch) return 1;
    if (!b.batch) return -1;
    return a.batch.expiryDate.getTime() - b.batch.expiryDate.getTime() || byAge(a, b);
  });
}

export interface ConsumeResult {
  /** تكلفة ما استُهلك فعلاً — مبلغٌ بخانتين، جاهزٌ لقيد COGS. */
  totalCost: number;
  /** كميةٌ لم تجد طبقة — استُهلكت مؤقتاً بآخر تكلفة معروفة. */
  provisionalQty: number;
  /** التكلفة المستعملة للمؤقّت — للإفصاح لا للحساب. */
  provisionalUnitCost: number | null;
  /** (`ق-١٤٦٩`) من أين جاءت تكلفةُ المؤقّت — و`NONE` صفرٌ بلا مصدر: لا طبقةَ قطّ وبطاقةُ الصنف صفر. */
  provisionalCostSource: ProvisionalCostSource | null;
  /** (`ق-١٤٦٩`) ما استُهلك مؤقّتاً **بتكلفة صفر** — يُعلَن ولا يمرّ صامتاً. */
  zeroCostQty: number;
  consumptionIds: string[];
}

/**
 * (`ق-١٤٦٩` · التوجيه ٢٦٦ §٤هـ) **مصدرُ تكلفة المؤقّت** — بالدرجة التي أعطتها:
 *   `WAREHOUSE_LAYER` آخرُ طبقةٍ للصنف في المستودع · `PRODUCT_LAYER` في أيّ مستودع · `PRODUCT_CARD` بطاقةُ الصنف بقيمة ·
 *   `NONE` لا طبقةَ قطّ **والبطاقةُ صفر** — فالصفرُ هنا مجهولٌ لا معروف. ⚠️ **وحدُّه**: البطاقةُ افتراضُها `0`، فلا يُفرَّق
 *   بين «صفرٍ أُدخل» و«لم يُدخَل» — وكلاهما يُعلَن.
 */
export type ProvisionalCostSource = 'WAREHOUSE_LAYER' | 'PRODUCT_LAYER' | 'PRODUCT_CARD' | 'NONE';

/**
 * آخر تكلفة معروفة للصنف في المستودع.
 *
 * ⚠️ **الترتيب بـ`acquiredAt` لا `createdAt`**: طبقةٌ أُدخلت اليوم عن شحنةٍ
 * قديمة ليست «الأحدث» — تكلفتها أقدم من طبقةٍ استُلمت الأسبوع الماضي.
 */
async function lastKnownUnitCost(tx: Tx, productId: string, warehouseId: string): Promise<{ unitCost: number; source: ProvisionalCostSource }> {
  const latest = await tx.inventoryLayer.findFirst({
    where: { productId, warehouseId },
    orderBy: [{ acquiredAt: 'desc' }, { createdAt: 'desc' }],
    select: { unitCost: true },
  });
  if (latest) return { unitCost: Number(latest.unitCost), source: 'WAREHOUSE_LAYER' };

  // لا طبقة قطّ في هذا المستودع — يُقرأ آخر ما عُرف عن الصنف نفسه، ثم حقل
  // التكلفة على البطاقة. وصفرٌ في الأخير **ليس خطأً يُخفى**: يظهر في تقرير
  // الاستهلاكات المؤقّتة بتكلفة صفر، وهو أوضح من رقمٍ مخترع.
  const anyLayer = await tx.inventoryLayer.findFirst({
    where: { productId },
    orderBy: [{ acquiredAt: 'desc' }, { createdAt: 'desc' }],
    select: { unitCost: true },
  });
  if (anyLayer) return { unitCost: Number(anyLayer.unitCost), source: 'PRODUCT_LAYER' };

  const product = await tx.product.findUnique({ where: { id: productId }, select: { cost: true } });
  const card = Number(product?.cost ?? 0);
  return { unitCost: card, source: card === 0 ? 'NONE' : 'PRODUCT_CARD' };
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

/** طبقةٌ مرشَّحةٌ للصرف كما تُقرأ — بدفعتها، فيُقاس انتهاؤها. */
type CandidateLayer = Prisma.InventoryLayerGetPayload<{ include: { batch: { select: { expiryDate: true } } } }>;

/**
 * ⚖️ (`ق-١٤٩٠`) **ما تقرؤه الدورةُ الأولى من `consumeFifo` — قراءةً واحدةً يشترك فيها الفحصُ المسبق والتنفيذ.**
 *
 * ٥+٦ السياسةُ تُقرأ من البطاقة (`ق-١٠٧٦`/٢): المعلَنُ تتبّعُه يُصرَف بالأقرب انتهاءً، وغيرُه بالأقدم كما كان.
 * وفي **البيع** وحدَه (`ق-١٠٨٢`) تُستبعد الدفعاتُ المنتهية يومَ الحركة من المرشَّحات؛ فإن لم يكفِ غيرُ المنتهي
 * **وكان على الرفّ منتهٍ** رُفض البيعُ باسمه بدل أن يُباع منتهٍ أو يُقيَّد مؤقّتاً وهو موجود. أمّا نقصٌ بلا منتهٍ
 * على الرفّ فبيعٌ سبق استلامَه كما كان: يُقيَّد مؤقّتاً ويُسوَّى حين يصل.
 *
 * **ولماذا دالّةٌ واحدة لا نسخةٌ في الفحص** (`ق-١٤٩٠` · المسار `INV-①`): رفضُ المنتهي كان يقع داخل الصرف — **بعد
 * ترقيم الفاتورة** — فيحترق رقمُها (العدّادُ على منفذٍ مستقلّ لا يرتدّ مع المعاملة، `sequence-allocator.ts`). والفحصُ
 * المسبق الذي يمنع الحرق **لا يصدق إلا إن قرأ ما يقرؤه الصرفُ بعينه**: السياسةَ نفسَها، والطبقاتِ نفسَها بمتبقٍّ، والانتهاءَ
 * بيوم الحركة نفسِه. فنسختان تفترقان يوماً — فحصٌ يرفض ما يُباع، أو يُجيز ما يُرفض بعد الترقيم فيعود الحرقُ صامتاً —
 * **ودالّةٌ واحدة لا تفترق عن نفسها**.
 */
export interface ConsumptionView {
  /** اسمُ الصنف لرسالة الرفض — `null` إن لم يوجد صفُّه. */
  productName: string | null;
  policy: ConsumptionPolicy;
  /** البيعُ لصنفٍ معلَنٍ تتبّعُه وحدَه يرفض المنتهي (`ق-١٠٨٢`). */
  refuseExpired: boolean;
  /** اليومُ الذي قيس به الانتهاء — يومُ الحركة، وافتراضُه الآن. */
  on: Date;
  /** المرشَّحاتُ بترتيب الصرف — بعد استبعاد المنتهي حين يُرفض المنتهي. */
  layers: CandidateLayer[];
  /** غيرُ المنتهي على الرفّ — يُحسب حين يُرفض المنتهي وحدَه، وإلا صفرٌ كما كان. */
  unexpiredAvailable: number;
  /** المنتهي على الرفّ — كذلك. */
  expiredOnShelf: number;
}

/** المرشَّحاتُ بمتبقٍّ في المستودع، مرتّبةً بالسياسة، والمنتهي مستبعَداً حين يُرفض — تقرؤها كلُّ دورة. */
async function readCandidateLayers(
  tx: Tx,
  args: { productId: string; warehouseId: string; policy: ConsumptionPolicy; refuseExpired: boolean; on: Date },
): Promise<{ ordered: CandidateLayer[]; layers: CandidateLayer[] }> {
  const all = await tx.inventoryLayer.findMany({
    where: { productId: args.productId, warehouseId: args.warehouseId, qtyRemaining: { gt: 0 } },
    orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }],
    include: { batch: { select: { expiryDate: true } } },
  });
  const ordered = orderLayersForConsumption(all, args.policy);
  const layers = args.refuseExpired ? ordered.filter((l) => !l.batch || !isExpiredOn(l.batch.expiryDate, args.on)) : ordered;
  return { ordered, layers };
}

/** قراءةُ الدورة الأولى — انظر `ConsumptionView`. لا تكتب شيئاً. */
export async function readConsumptionView(
  tx: Tx,
  args: { productId: string; warehouseId: string; exit?: ExitKind; date?: Date },
): Promise<ConsumptionView> {
  const product = await tx.product.findUnique({ where: { id: args.productId }, select: { expiryTracked: true, name: true } });
  const policy: ConsumptionPolicy = product?.expiryTracked === true ? 'FEFO' : 'FIFO';
  const exit: ExitKind = args.exit ?? 'OTHER';
  const on = args.date ?? new Date();
  const refuseExpired = policy === 'FEFO' && exit === 'SALE';
  const { ordered, layers } = await readCandidateLayers(tx, { productId: args.productId, warehouseId: args.warehouseId, policy, refuseExpired, on });
  return {
    productName: product?.name ?? null,
    policy,
    refuseExpired,
    on,
    layers,
    unexpiredAvailable: refuseExpired ? roundTo(layers.reduce((s, l) => s + Number(l.qtyRemaining), 0), 'DERIVED_QUANTITY') : 0,
    expiredOnShelf: refuseExpired ? roundTo(ordered.reduce((s, l) => s + (layers.includes(l) ? 0 : Number(l.qtyRemaining)), 0), 'DERIVED_QUANTITY') : 0,
  };
}

/**
 * ⚖️ (`ق-١٤٩٠`) **حكمُ الفحص المسبق على قراءة الدورة الأولى**: يُرفض البيعُ متى كان المطلوبُ أكثرَ من غير المنتهي
 * وعلى الرفّ منتهٍ — وهو ما ينتهي إليه الصرفُ بلا تزامن: الدورةُ الأولى تأخذ غيرَ المنتهي كلَّه حتى المطلوب، فيبقى
 * `المطلوبُ − غيرُ المنتهي` والمرشَّحاتُ بعده خاليةٌ من غير المنتهي. ⚠️ **والمطلوبُ مجموعُ الصنف في المستند**: سطران
 * للصنف نفسِه يأخذان من الطبقات نفسِها بالتتابع، فيُرفض الثاني متى جاوز المجموعُ غيرَ المنتهي.
 */
export function refusesExpiredSale(view: Pick<ConsumptionView, 'refuseExpired' | 'unexpiredAvailable' | 'expiredOnShelf'>, requested: number): boolean {
  return view.refuseExpired && view.expiredOnShelf > 0 && roundTo(requested, 'DERIVED_QUANTITY') > view.unexpiredAvailable;
}

/** رسالةُ الرفض الواحدة — يرميها الفحصُ المسبق والصرفُ بالمفتاح نفسِه (`expired_stock_sale_refused`). */
export function expiredSaleRefusal(productName: string | null, productId: string, available: number, requested: number): ConflictException {
  return new ConflictException(formatMessage(MSG.expired_stock_sale_refused, { product: productName ?? productId, available, requested }));
}

export async function consumeFifo(tx: Tx, companyId: string, args: ConsumeArgs): Promise<ConsumeResult> {
  let outstanding = args.qty;
  let totalCost = 0;
  const consumptionIds: string[] = [];

  // الدورةُ الأولى تقرأ بالدالّة التي يقرأ بها الفحصُ المسبق (`ق-١٤٩٠`) — فلا يفترق ما فُحص عمّا يُصرَف.
  const first = await readConsumptionView(tx, { productId: args.productId, warehouseId: args.warehouseId, exit: args.exit, date: args.date });
  const { policy, refuseExpired, on, unexpiredAvailable, expiredOnShelf } = first;

  // كلُّ دورةٍ تقرأ ما بقي فيه شيء وتأخذ منه بكتابةٍ مشروطة، من الأقدم. كتابةٌ لم تقع
  // (`count = 0`) تعني أن الطبقةَ تغيّرت تحت أيدينا — فتُقطع الدورةُ وتُعاد القراءة
  // كي يبقى الترتيبُ FIFO لا «ما تيسّر». ودورةٌ لم تأخذ شيئاً تعني أن الطبقات نفدت
  // بالتزامن — فيبقى الباقي استهلاكاً مؤقّتاً كما لو أنه بيعٌ سبق استلامه.
  for (let pass = 0; pass < MAX_CONSUME_PASSES && outstanding > 0; pass++) {
    const layers = pass === 0 ? first.layers : (await readCandidateLayers(tx, { productId: args.productId, warehouseId: args.warehouseId, policy, refuseExpired, on })).layers;
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

  // ٥+٦ رفضٌ مسمًّى في البيع وحدَه (`ق-١٠٨٢`): ما بقي مطلوباً ولا يغطّيه إلا منتهٍ على الرفّ لا يُباع ولا يُقيَّد مؤقّتاً.
  // ⚖️ (`ق-١٤٩٠`) **ويبقى هنا طبقةَ السباق**: الفاتورةُ تفحص قبل ترقيمها (`assertSaleNotBlockedByExpiry`)، وهذا الرفضُ
  //    لا يبلغه إلا ما تغيّر بين الفحص والصرف — بيعٌ متزامنٌ أخذ غيرَ المنتهي — أو مسارٌ لم يفحص؛ فيحترق رقمُه ولا يُباع منتهٍ.
  if (refuseExpired && outstanding > 0 && expiredOnShelf > 0) {
    throw expiredSaleRefusal(first.productName, args.productId, unexpiredAvailable, args.qty);
  }

  let provisionalUnitCost: number | null = null;
  let provisionalCostSource: ProvisionalCostSource | null = null;
  if (outstanding > 0) {
    const known = await lastKnownUnitCost(tx, args.productId, args.warehouseId);
    provisionalUnitCost = known.unitCost;
    provisionalCostSource = known.source;
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
    provisionalCostSource,
    zeroCostQty: outstanding > 0 && provisionalUnitCost === 0 ? outstanding : 0,
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
): Promise<{ restoredQty: number; reversedCost: number; provisionalQty: number; restoredCost: number; raisedAfterExit: number }> {
  const consumptions = await tx.inventoryConsumption.findMany({
    where: { movementId: originalMovementId },
    orderBy: { createdAt: 'asc' },
    include: { settledBy: { select: { id: true } } },
  });

  let restoredQty = 0;
  let reversedCost = 0;
  let provisionalQty = 0;
  // ق-١٣٦٣ — ما عاد إلى الطبقات فعلاً بتكلفته (بلا المؤقّت الذي لم يأخذ من طبقة) — قيمةُ قيد عكس الحركة اليدوية.
  let restoredCost = 0;
  // ق-١٣٦٤ — وما رُفع على العائد بعد خروجه: يعود معه إلى الطبقة، ويُعاد في القيد من حيث ذهب.
  let raisedAfterExit = 0;

  for (const c of consumptions) {
    // ㉘ مؤقّتٌ سُوِّي: صفُّ تسويته — بطبقةٍ حقيقية وتكلفتها — هو الذي يُعاد ويُحسب، لا الأصلُ (ق-١٠٦٣/١).
    if (c.layerId === null && c.settledBy) continue;
    const qty = Number(c.qty);
    reversedCost += qty * Number(c.unitCost);

    if (c.layerId === null) {
      provisionalQty += qty;
      continue;
    }

    raisedAfterExit += await restoreIntoLayer(tx, c.layerId, qty, c);
    restoredQty += qty;
    restoredCost += qty * Number(c.unitCost);
  }

  return {
    restoredQty: roundTo(restoredQty, 'DERIVED_QUANTITY'),
    reversedCost: roundTo(reversedCost, 'LINE_AMOUNT'),
    provisionalQty: roundTo(provisionalQty, 'DERIVED_QUANTITY'),
    restoredCost: roundTo(restoredCost, 'LINE_AMOUNT'),
    raisedAfterExit: roundTo(raisedAfterExit, 'LINE_AMOUNT'),
  };
}

/**
 * ⚖️ **`ق-١٣٦٤` — إعادةُ وحداتٍ إلى طبقتها بما رُفع عليها بعد خروجها** — والعائدُ هو ما يحدّد، لا تكلفةُ الطبقة اليوم.
 *
 * بنصّ المالك: «ومرتجعُ البيع بعد الرفع: الدفترُ والطبقةُ يتطابقان بعده، والوحدةُ تعود بالتكلفة التي خرجت بها، وما رُفع عليها
 * بعد خروجها يُعاد من تكلفة المبيعات إلى المخزون.» فالوحدةُ تحمل `تكلفةَ خروجها + (exitedRaise الطبقة الآن − ما كان لحظةَ خروجها)`،
 * ويُعاد الفرقُ (المُعاد) إلى المستدعي ليقيّده. **وحين تساوي تكلفةَ الطبقة** — وهو الغالب: رفعٌ كاملٌ وصل الرفَّ والخارجَ معاً —
 * **زيادةٌ ذرّية كما كانت** (`ق-٨١٤`)؛ وحين تخالفها (إشعارُ سعرٍ على جزء · طبقةٌ فرغت ثم رُفعت) تُمزج تكلفةُ الطبقة بكتابةٍ مشروطة
 * تُعاد عند التزاحم — فقيمةُ الرفّ بعدها = ما كان + ما عاد بتكلفته، حرفاً كما في الدفتر.
 */
async function restoreIntoLayer(tx: Tx, layerId: string, qty: number, row: { unitCost: Prisma.Decimal | number; exitedRaiseAtExit: Prisma.Decimal | number }): Promise<number> {
  for (let pass = 0; pass < MAX_CONSUME_PASSES; pass++) {
    const layer = await tx.inventoryLayer.findUniqueOrThrow({ where: { id: layerId }, select: { qtyRemaining: true, unitCost: true, exitedRaise: true } });
    const extraPerUnit = Number(layer.exitedRaise) - Number(row.exitedRaiseAtExit);
    const effective = roundTo(Number(row.unitCost) + extraPerUnit, 'UNIT_COST');
    const current = Number(layer.unitCost);
    if (effective === current) {
      // زيادةٌ ذرّية لا قراءةٌ ثم قيمةٌ مطلقة — الموضعُ الثاني من ثلاثة (ق-٨١٤).
      await tx.inventoryLayer.update({ where: { id: layerId }, data: { qtyRemaining: { increment: qty } } });
      return qty * extraPerUnit;
    }
    const remaining = Number(layer.qtyRemaining);
    const blended = roundTo((remaining * current + qty * effective) / (remaining + qty), 'UNIT_COST');
    const { count } = await tx.inventoryLayer.updateMany({
      where: { id: layerId, qtyRemaining: layer.qtyRemaining, unitCost: layer.unitCost },
      data: { qtyRemaining: { increment: qty }, unitCost: blended },
    });
    if (count === 1) return qty * extraPerUnit;
  }
  throw new Error(`الطبقةُ ${layerId} تتغيّر تحت الأيدي ولم تستقبل عائدَها بعد ${MAX_CONSUME_PASSES} محاولات`);
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
): Promise<{ restoredQty: number; reversedCost: number; provisionalQty: number; raisedAfterExit: number }> {
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
  // ق-١٣٦٤ — ما رُفع على العائد بعد خروجه (يعود معه؛ والمستدعي يعيده من تكلفة المبيعات إلى المخزون).
  let raisedAfterExit = 0;

  for (const c of consumptions) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(c.qty));
    remaining = roundTo(remaining - take, 'DERIVED_QUANTITY');
    reversedCost += take * Number(c.unitCost);

    if (c.layerId === null) {
      provisionalQty += take;
      continue;
    }
    // الموضعُ الثالث من ثلاثة (ق-٨١٤) — ذرّيٌّ حين يعود بتكلفة الطبقة، ومشروطٌ حين يمزجها.
    raisedAfterExit += await restoreIntoLayer(tx, c.layerId, take, c);
    restoredQty += take;
  }

  return {
    restoredQty: roundTo(restoredQty, 'DERIVED_QUANTITY'),
    reversedCost: roundTo(reversedCost, 'LINE_AMOUNT'),
    provisionalQty: roundTo(provisionalQty, 'DERIVED_QUANTITY'),
    raisedAfterExit: roundTo(raisedAfterExit, 'LINE_AMOUNT'),
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
  args: { productId: string; warehouseId: string; qty: number; unitCost: number; acquiredAt: Date; sourceType: 'ADJUSTMENT' | 'TRANSFER' | 'OPENING' | 'RETURN'; movementId: string; batchId?: string | null },
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
      // ٥+٦ الدفعةُ على الطبقة — كيانٌ حُلّ قبل النداء (`resolveReceiptBatch`)، أو `null` لما لا دفعةَ له.
      batchId: args.batchId ?? null,
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
  // التحويلُ ليس بيعاً: المنتهي ينتقل مع طبقته (`ق-١٠٨٢`) — ولا يُباع في مقصِده أيضاً.
  const consumed = await consumeFifo(tx, companyId, { productId: args.productId, warehouseId: args.fromWarehouseId, qty: args.qty, movementId: args.movementId, exit: 'OTHER', date: args.date });
  const slices = await tx.inventoryConsumption.findMany({
    where: { id: { in: consumed.consumptionIds } },
    orderBy: { createdAt: 'asc' },
    include: { layer: { select: { acquiredAt: true, batchId: true } } },
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
        // ٥+٦ الدفعةُ تنتقل مع الطبقة (`ق-١٠٨٦`) — فالمقصِدُ يعرف انتهاءَها كما عرفه المصدر.
        batchId: s.layer?.batchId ?? null,
        // ⚖️ ق-١٣٦٤ الشريحةُ التي وُلدت منها — فما رُفع من تكلفة المصدر بعد التحويل يتبع الوحدةَ إلى هنا.
        transferConsumptionId: s.id,
      },
    });
  }
  return { consumed, createdLayers: slices.length };
}

/**
 * ㉙ **إقفالُ طبقةٍ بعينها عند عكس إدخالها** (`ق-١٠٦٣`): عكسُ إدخالٍ يدويّ لم تُستهلك طبقتُه يُقفل تلك الطبقةَ
 * هي — لا `FIFO` من غيرها — بنقصانٍ ذرّيٍّ مشروط (`ق-٨١٤`) وصفِّ استهلاكٍ على حركة العكس بتكلفتها.
 * والمستدعي يفحص قبلُ أن الطبقةَ كاملة؛ وهنا حارسٌ ثانٍ يرمي إن كانت الكتابةُ لم تقع.
 */
export async function closeLayerExactly(tx: Tx, companyId: string, args: { layerId: string; movementId: string }): Promise<{ qty: number; unitCost: number }> {
  const layer = await tx.inventoryLayer.findUniqueOrThrow({ where: { id: args.layerId }, select: { qtyRemaining: true, qtyReceived: true, unitCost: true } });
  const qty = Number(layer.qtyRemaining);
  if (qty !== Number(layer.qtyReceived)) throw new Error(`الطبقةُ ${args.layerId} استُهلك منها — لا تُقفل بعكس إدخالها`);
  const { count } = await tx.inventoryLayer.updateMany({ where: { id: args.layerId, qtyRemaining: { gte: qty } }, data: { qtyRemaining: { decrement: qty } } });
  if (count === 0) throw new Error(`الطبقةُ ${args.layerId} تغيّرت تحت أيدينا — لم تُقفل`);
  const unitCost = Number(layer.unitCost);
  await tx.inventoryConsumption.create({ data: { companyId, layerId: args.layerId, movementId: args.movementId, qty, unitCost } });
  return { qty, unitCost };
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
