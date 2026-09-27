import { LayerCostEvent, Prisma } from '@mad-app/db';
import { round2, roundTo } from '../common/money/rounding';
import { spreadCostOverLayer, unitCostAfterShelfDelta } from './layer-cost-spread.util';

type Tx = Prisma.TransactionClient;

/**
 * ⚖️ **`ق-١٣٦٤` — رفعُ تكلفة طبقةٍ وقسمةُ حصّة ما خرج منها على مخارجه.**
 *
 * **بنصّ المالك** (⑤): «التحويل: ما رُفع من تكلفة الطبقة يتبع الوحدةَ إلى طبقة المقصِد، ولا يُعدّ مستهلكاً. والإتلاف: حصّتُه إلى
 * حساب خسائر الإتلاف لا تكلفة المبيعات. ومرتجعُ البيع بعد الرفع: الدفترُ والطبقةُ يتطابقان بعده، والوحدةُ تعود بالتكلفة التي خرجت
 * بها، وما رُفع عليها بعد خروجها يُعاد من تكلفة المبيعات إلى المخزون.»
 *
 * ## ما كان — والعيوبُ الثلاثة (`ق-١٣٤٤`)
 * قاعدةُ الانتشار (`layer-cost-spread.util`) تقسم الرفعَ قسمين: ما على الرفّ يرفع تكلفةَ الطبقة، **وكلُّ ما خرج إلى `5100`**.
 * فالوحدةُ المحوَّلة — وهي على رفٍّ آخر — عُدّت «مبيعة»، والمشطوبةُ ذهبت حصّتُها إلى تكلفة المبيعات، والعائدةُ بعد الرفع عادت
 * إلى طبقةٍ مرفوعة بتكلفةٍ لم ترتفع في الدفتر.
 *
 * ## ما صار
 * 1. **الرفّ أولاً** كما كان (القاعدةُ نفسُها بلا نسخة) — حصّتُه ترفع تكلفةَ الطبقة بكتابةٍ مشروطة بما قُرئ (`ق-٨١٤`).
 * 2. **وحصّةُ ما خرج تُقسَم على مخارج الطبقة بكمّياتها** — من صفوف الاستهلاك نفسِها لا من تقدير:
 *    الشطبُ `5800` · الإخراجُ اليدويّ `5810` (`ق-١٣٦٣`) · **التحويلُ يتبع إلى طبقة المقصِد** (الطبقةُ التي وُلدت من الشريحة —
 *    `transferConsumptionId` — فترتفع هي بالقاعدة نفسِها، ومخارجُها تُقسَم كذلك: تتبّعٌ لا حدَّ له إلا السلسلة) · وإعادةُ المورّد
 *    وما لا يُعرف مخرجُه (تحويلٌ سبق الوصلة) `5100` كما كانا · **والبيعُ الصافي هو الباقي** (المرتجعُ يعيد الوحدةَ بلا صفٍّ —
 *    `ق-٨١٧` — فالبيعُ يُقرأ طرحاً لا جمعاً). وحركةٌ عُكست عادت وحداتُها فلا تُعدّ خارجة.
 * 3. **وما رُفع على الوحدة الخارجة يُحفظ على الطبقة تراكميّاً** (`exitedRaise` += حصّةُ الخارج ÷ كمّيتِه) — فالعائدُ يستردّه
 *    (`restoreConsumption*`): الفرقُ بينه وبين ما حُفظ على استهلاكه لحظةَ خروجه (مُشغِّلٌ في القاعدة يكتبه).
 * 4. **ويُسجَّل كلُّ ريال** صفّاً في `layer_cost_shares` (الطبقةُ وأبناؤها) — مادّةُ الحارس الثاني.
 *
 * ⚠️ **وحدُّه معلَن**: إشعارُ سعرٍ على **جزءٍ** من كمّية الطبقة يرفع الرفَّ أولاً (القاعدةُ القائمة `ق-٩٩٠`)، فوحداتُ الرفّ
 * ووحداتُ الخارج لا تحمل الرفعَ نفسَه — والعائدُ يعود بما حمله هو، والطبقةُ تمزج (`restoreConsumption*`)؛ لا خطأَ في المجموع.
 *
 * **في النواة** (المشتريات) لا في المحرّك: تُكتب الطبقاتُ بالمخطَّط مباشرةً كما يكتبها `purchase-return.util` (`§3`).
 */

/** ما يُقيَّد من رفعٍ (أو من فرق تسوية): الرفُّ — طبقةُ الأصل وطبقاتُ المقصِد — إلى `1300`، وكلُّ مخرجٍ إلى حسابه. */
export interface CostAllocation {
  shelf: number;
  cogs: number;
  writeOff: number;
  variance: number;
}

/** حصّةٌ على طبقة — صفٌّ في `layer_cost_shares` وأبناؤه (ما تبع الوحدةَ إلى طبقة المقصِد). */
export interface CostShareNode {
  layerId: string;
  qtyReceived: number;
  qtyRemainingAt: number;
  baseAmount: number;
  baseShelf: number;
  baseCogs: number;
  baseWriteOff: number;
  baseVariance: number;
  baseFollow: number;
  unitCostBefore: number;
  unitCostAfter: number;
  exitedRaiseBefore: number;
  exitedRaiseAfter: number;
  children: CostShareNode[];
}

/** نوعُ المخرج — ومنه حسابُه. */
export type ExitKind = 'SALE' | 'WRITEOFF' | 'MANUAL' | 'SUPPLIER_RETURN' | 'UNLINKED_TRANSFER' | 'OTHER';

interface ExitRow {
  id: string;
  qty: number;
  kind: ExitKind | 'TRANSFER';
  /** طبقةُ المقصِد للتحويل — `null` لتحويلٍ سبق الوصلة. */
  destLayerId: string | null;
}

/** حدُّ السلسلة — تحويلٌ من تحويلٍ من تحويل…؛ ولا دورةَ ممكنة (كلُّ تحويلٍ يُنشئ طبقةً جديدة)، والحدُّ حارسٌ لا قاعدة. */
const MAX_FOLLOW_DEPTH = 32;

/**
 * مخارجُ الطبقة الفعلية — صفوفُ استهلاكٍ بطبقتها وحركتُها لم تُعكس (العكسُ يعيد الوحدات). والبيعُ لا يُقرأ هنا: هو الباقي.
 * التحويلُ بطبقة مقصِده: الشريحةُ نفسُها، أو المؤقّتُ الذي سوّته (`settlesId`) — فالمقصِدُ وُلد من المؤقّت.
 */
export async function exitRowsOf(tx: Tx, layerId: string): Promise<ExitRow[]> {
  const rows = await tx.$queryRaw<{ id: string; qty: number; type: string; origin: string; reversed: boolean; destLayerId: string | null }[]>`
    SELECT c.id, c.qty::float8 AS qty, m.type::text AS type, m.origin::text AS origin,
           EXISTS (SELECT 1 FROM stock_movements r WHERE r."reversalOfId" = m.id) AS reversed,
           d.id AS "destLayerId"
    FROM inventory_consumptions c
    JOIN stock_movements m ON m.id = c."movementId"
    LEFT JOIN inventory_layers d ON d."transferConsumptionId" = COALESCE(c."settlesId", c.id)
    WHERE c."layerId" = ${layerId}`;
  const out: ExitRow[] = [];
  for (const r of rows) {
    if (r.reversed) continue;
    const kind: ExitRow['kind'] =
      r.type === 'TRANSFER'
        ? r.destLayerId
          ? 'TRANSFER'
          : 'UNLINKED_TRANSFER'
        : r.origin === 'WRITEOFF'
          ? 'WRITEOFF'
          : r.origin === 'MANUAL'
            ? 'MANUAL'
            : r.origin === 'RECEIPT'
              ? 'SUPPLIER_RETURN'
              : r.origin === 'SALE'
                ? 'SALE'
                : 'OTHER';
    // البيعُ يُقرأ طرحاً (الباقي) — صفوفُه لا تُجمع هنا لأن مرتجعَه يعيد الوحدةَ بلا صف.
    if (kind === 'SALE') continue;
    out.push({ id: r.id, qty: Number(r.qty), kind, destLayerId: r.destLayerId });
  }
  return out;
}

/**
 * قسمةُ مبلغٍ مدوَّر على أوزان — **بالباقي الأكبر**، فالمجموعُ يساوي المبلغَ حرفاً ولا هللةَ تضيع (وكلُّ نصيبٍ على بُعد هللةٍ من
 * نسبته). المبلغُ بإشارته؛ والأوزانُ غيرُ سالبة.
 */
export function splitByWeights(amount: number, weights: readonly number[]): number[] {
  const total = weights.reduce((t, w) => t + w, 0);
  if (total <= 0 || amount === 0) return weights.map(() => 0);
  const cents = Math.round(Math.abs(amount) * 100);
  const exact = weights.map((w) => (cents * w) / total);
  const floors = exact.map((e) => Math.floor(e + 1e-9));
  let left = cents - floors.reduce((t, f) => t + f, 0);
  const order = exact.map((e, i) => ({ i, frac: e - floors[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] += 1;
    left -= 1;
  }
  const sign = amount < 0 ? -1 : 1;
  return floors.map((f) => (sign * f) / 100);
}

export interface RaiseLayerArgs {
  layerId: string;
  /** الوحداتُ التي يقع عليها الرفع — كلُّ ما استُلم (التكلفةُ المحمَّلة · الضريبةُ غيرُ القابلة للخصم) أو كمّيةُ إشعار السعر. */
  unitsAffected: number;
  /** الرفعُ مدوَّراً بإشارته (موجبٌ زيادة · سالبٌ نقص). */
  amount: number;
  /** الخطأُ حين تغيّرت الطبقةُ تحت الأيدي (`ق-٨١٤`) — رسالةُ المسار المستدعي. */
  onConflict: (layerId: string) => Error;
}

/**
 * يرفع طبقةً (أو يخفضها) ويقسم حصّةَ ما خرج منها على مخارجه — ويتبع التحويلَ إلى طبقة المقصِد بالقاعدة نفسِها. يكتب الطبقات
 * (تكلفةً وما رُفع على الخارج) ويعيد شجرةَ الحصص ليُسجّلها المستدعي بحدثه (`recordCostShares`).
 */
export async function raiseLayerCost(tx: Tx, a: RaiseLayerArgs, depth = 0): Promise<CostShareNode> {
  if (depth > MAX_FOLLOW_DEPTH) throw new Error(`سلسلةُ تحويلٍ أعمقُ من ${MAX_FOLLOW_DEPTH} من الطبقة ${a.layerId} — لا تُتبع`);
  const layer = await tx.inventoryLayer.findUniqueOrThrow({
    where: { id: a.layerId },
    select: { qtyReceived: true, qtyRemaining: true, unitCost: true, exitedRaise: true },
  });
  const qtyReceived = Number(layer.qtyReceived);
  const qtyRemaining = Number(layer.qtyRemaining);
  const unitCost = Number(layer.unitCost);
  const exitedRaise = Number(layer.exitedRaise);
  const amount = round2(a.amount);

  const node: CostShareNode = {
    layerId: a.layerId,
    qtyReceived,
    qtyRemainingAt: qtyRemaining,
    baseAmount: amount,
    baseShelf: 0,
    baseCogs: 0,
    baseWriteOff: 0,
    baseVariance: 0,
    baseFollow: 0,
    unitCostBefore: unitCost,
    unitCostAfter: unitCost,
    exitedRaiseBefore: exitedRaise,
    exitedRaiseAfter: exitedRaise,
    children: [],
  };
  if (amount === 0) return node;
  // لا وحداتٍ يقع عليها (لا يقع بعد البناء): الحصّةُ كلُّها تكلفةُ مبيعاتٍ كما كانت قاعدةُ الانتشار تفعل بنصيبٍ صفريّ للوحدة.
  if (a.unitsAffected <= 0) {
    node.baseCogs = amount;
    return node;
  }

  // ① الرفُّ أولاً — القاعدةُ القائمة بلا نسخة.
  const direction: 1 | -1 = amount > 0 ? 1 : -1;
  const spread = spreadCostOverLayer({ unitsAffected: a.unitsAffected, perUnitAmount: Math.abs(amount) / a.unitsAffected, direction, qtyRemaining, unitCost });
  const shelf = round2(direction * spread.baseInventory);
  const exited = round2(amount - shelf);
  node.baseShelf = shelf;
  node.unitCostAfter = unitCostAfterShelfDelta(qtyRemaining, unitCost, shelf);

  // ② ما رُفع على الخارج يُحفظ تراكميّاً — لكلِّ وحدةٍ خرجت نصيبٌ واحد (الحصّةُ ÷ كلِّ ما خرج).
  const exitedQty = roundTo(qtyReceived - qtyRemaining, 'DERIVED_QUANTITY');
  if (exited !== 0 && exitedQty > 0) node.exitedRaiseAfter = roundTo(exitedRaise + exited / exitedQty, 'UNIT_COST');

  if (node.unitCostAfter !== unitCost || node.exitedRaiseAfter !== exitedRaise) {
    const { count } = await tx.inventoryLayer.updateMany({
      where: { id: a.layerId, qtyRemaining: layer.qtyRemaining, unitCost: layer.unitCost, exitedRaise: layer.exitedRaise },
      data: { unitCost: node.unitCostAfter, exitedRaise: node.exitedRaiseAfter },
    });
    if (count === 0) throw a.onConflict(a.layerId);
  }
  if (exited === 0) return node;

  // ③ القسمةُ على المخارج بكمّياتها — والبيعُ الباقي.
  const exits = await exitRowsOf(tx, a.layerId);
  const known = exits.reduce((t, e) => t + e.qty, 0);
  // ⚠️ بياناتٌ سبقت ㉘ قد تجعل المعروفَ أكثرَ مما خرج (استهلاكٌ بلا أثرٍ في المتبقّي) — فيُقسَم على المعروف وحدَه ولا بيعَ سالب.
  const saleQty = exitedQty > known ? roundTo(exitedQty - known, 'DERIVED_QUANTITY') : 0;
  const weights = [saleQty, ...exits.map((e) => e.qty)];
  const shares = splitByWeights(exited, weights);
  node.baseCogs = shares[0];
  for (let i = 0; i < exits.length; i++) {
    const e = exits[i];
    const share = shares[i + 1];
    if (share === 0) continue;
    if (e.kind === 'WRITEOFF') node.baseWriteOff = round2(node.baseWriteOff + share);
    else if (e.kind === 'MANUAL') node.baseVariance = round2(node.baseVariance + share);
    else if (e.kind === 'TRANSFER') {
      // ④ التحويلُ يتبع: الوحداتُ التي وصلت المقصِدَ من هذه الشريحة تحمل نصيبَها — رفعٌ كاملٌ على طبقتها بالقاعدة نفسِها.
      const child = await raiseLayerCost(tx, { layerId: e.destLayerId!, unitsAffected: e.qty, amount: share, onConflict: a.onConflict }, depth + 1);
      node.baseFollow = round2(node.baseFollow + share);
      node.children.push(child);
    } else node.baseCogs = round2(node.baseCogs + share);
  }
  return node;
}

/** مجموعُ ما يُقيَّد من شجرة حصص — الرفوفُ كلُّها إلى `1300`، والتابعُ لا يُعدّ مرّتين (أبناؤه يحملونه). */
export function allocationOf(nodes: readonly CostShareNode[]): CostAllocation {
  const acc: CostAllocation = { shelf: 0, cogs: 0, writeOff: 0, variance: 0 };
  const walk = (n: CostShareNode) => {
    acc.shelf += n.baseShelf;
    acc.cogs += n.baseCogs;
    acc.writeOff += n.baseWriteOff;
    acc.variance += n.baseVariance;
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return { shelf: round2(acc.shelf), cogs: round2(acc.cogs), writeOff: round2(acc.writeOff), variance: round2(acc.variance) };
}

/** الحدثُ بمفتاحه — واحدٌ لا غير (قيدُ `CHECK` في القاعدة). */
export type CostShareEventRef =
  | { event: 'LANDED_COST'; landedCostDistributionId: string }
  | { event: 'PRICE_NOTE'; purchaseId: string }
  | { event: 'NON_DEDUCTIBLE_VAT'; nonDeductibleVatEventId: string }
  | { event: 'SETTLEMENT'; settlementId: string };

/** يُسجّل شجرةَ الحصص بحدثها — الأبُ قبل أبنائه. والحصّةُ الصفريّة بلا أبناء لا تُكتب. */
export async function recordCostShares(tx: Tx, companyId: string, ref: CostShareEventRef, nodes: readonly CostShareNode[]): Promise<number> {
  let written = 0;
  const eventCols = {
    event: ref.event as LayerCostEvent,
    landedCostDistributionId: ref.event === 'LANDED_COST' ? ref.landedCostDistributionId : null,
    purchaseId: ref.event === 'PRICE_NOTE' ? ref.purchaseId : null,
    nonDeductibleVatEventId: ref.event === 'NON_DEDUCTIBLE_VAT' ? ref.nonDeductibleVatEventId : null,
    settlementId: ref.event === 'SETTLEMENT' ? ref.settlementId : null,
  };
  const write = async (n: CostShareNode, parentId: string | null) => {
    if (n.baseAmount === 0 && n.children.length === 0) return;
    const row = await tx.layerCostShare.create({
      data: {
        companyId,
        layerId: n.layerId,
        parentId,
        ...eventCols,
        qtyReceived: n.qtyReceived,
        qtyRemainingAt: n.qtyRemainingAt,
        exitedQtyAt: roundTo(n.qtyReceived - n.qtyRemainingAt, 'DERIVED_QUANTITY'),
        baseAmount: n.baseAmount,
        baseShelf: n.baseShelf,
        baseCogs: n.baseCogs,
        baseWriteOff: n.baseWriteOff,
        baseVariance: n.baseVariance,
        baseFollow: n.baseFollow,
        unitCostBefore: n.unitCostBefore,
        unitCostAfter: n.unitCostAfter,
        exitedRaiseBefore: n.exitedRaiseBefore,
        exitedRaiseAfter: n.exitedRaiseAfter,
      } as unknown as Prisma.LayerCostShareUncheckedCreateInput,
      select: { id: true },
    });
    written += 1;
    for (const c of n.children) await write(c, row.id);
  };
  for (const n of nodes) await write(n, null);
  return written;
}
