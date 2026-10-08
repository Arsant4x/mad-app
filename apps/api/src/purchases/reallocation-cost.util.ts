import { Prisma } from '@mad-app/db';
import { round2 } from '../common/money/rounding';
import { purchaseExpenseAccountCode } from '../common/purchase-categories';
import { resolveAccountIds } from '../journal/auto-posting.util';

/**
 * ⚖️ **فرقُ السعر في إعادة توزيع سند صرف المورّد** (توجيه ٢٨٦، حكمُ صاحب المشروع المؤقّت حتى يجيب المحاسب): «**إلى تكلفة
 * المشتريات بسعر يوم الدفعة المقدّمة، فلا فرق صرفٍ لما دُفع مقدّماً**».
 *
 * لكلِّ شراءٍ يمسّه التوزيع:
 * - **ما زيد عليه** من سندٍ **سبق تاريخُه تاريخَ الشراء** دفعةٌ مقدّمة: يُقاس بسعر السند، فالفرقُ بين سعر السند وسعر الشراء
 *   تكلفةٌ له (`زيادة × (سعر السند − سعر الشراء)`). وما زيد من سندٍ لم يسبقه تسويةٌ عادية، فرقُها في `5600` كسند القبض.
 * - **وما نُقص منه** يردّ من التكلفة ما رُحِّل إليها بقدره (`baseCostAdjusted` على التخصيص، بنسبة المنقوص)، والباقي يعود
 *   إلى `5600` الذي حمله يومَ أُنشئ السند.
 *
 * والذمّةُ (`2100`) تتحرّك بفرق الأساس قبل التوزيع وبعده كسند القبض (`baseSettledOf`)، والقيدُ يوازن نفسَه: ما لم يذهب إلى
 * التكلفة يذهب إلى `5600`. فعكسُ السند يردّ ما في التكلفة إلى التكلفة، ولا يبقى في `2100` رصيدٌ ولا في `5600` ربحٌ وهميّ.
 */
export interface ReallocationCostInput {
  paymentRate: number;
  /** يومُ السند `YYYY-MM-DD`. */
  paymentDay: string;
  /** التخصيصاتُ قبل التوزيع: المبلغُ وما رُحِّل منه إلى التكلفة. */
  before: ReadonlyMap<string, { amount: number; cost: number }>;
  /** التخصيصاتُ بعده: المبلغ. */
  after: ReadonlyMap<string, number>;
  /** سعرُ كلِّ شراءٍ ويومُه `YYYY-MM-DD`. */
  purchases: ReadonlyMap<string, { rate: number; day: string }>;
}

/** لكلِّ شراءٍ: ما يحمله تخصيصُه من التكلفة بعد التوزيع، وما يُرحَّل الآن إلى تكلفته (موقَّعاً، الموجبُ مدين). */
export function reallocationCostShifts(i: ReallocationCostInput): Map<string, { cost: number; shift: number }> {
  const out = new Map<string, { cost: number; shift: number }>();
  for (const id of new Set([...i.before.keys(), ...i.after.keys()])) {
    const old = i.before.get(id) ?? { amount: 0, cost: 0 };
    const next = i.after.get(id) ?? 0;
    const purchase = i.purchases.get(id);
    if (!purchase) throw new Error(`شراءٌ بلا سعر في إعادة التوزيع: ${id}`);
    let shift = 0;
    if (next < old.amount) {
      shift = old.amount > 0 ? -round2((old.cost * (old.amount - next)) / old.amount) : 0;
    } else if (next > old.amount && i.paymentDay < purchase.day) {
      shift = round2((next - old.amount) * (i.paymentRate - purchase.rate));
    }
    out.set(id, { cost: round2(old.cost + shift), shift });
  }
  return out;
}

/**
 * حساباتُ تكلفة الشراء لمبلغٍ موقَّع: **حصّةُ البنود المخزنية إلى `5100`** (تكلفةُ المشتريات والمبيعات؛ ولا يُعاد تقويمُ
 * الطبقة، حدٌّ معلَن) **وحصّةُ الخدمات إلى حساب فئة الشراء** كما رحّلها `postPurchaseEntry`، بنسبة صافيهما قبل الضريبة.
 */
export async function purchaseCostLines(
  tx: Prisma.TransactionClient,
  purchase: { categoryCode: string | null; subtotal: number; stockedSubtotal: number },
  amount: number,
): Promise<{ accountId: string; amount: number }[]> {
  const value = round2(amount);
  if (value === 0) return [];
  const expCode = purchaseExpenseAccountCode(purchase.categoryCode);
  const stockedShare = purchase.subtotal > 0 ? Math.min(1, Math.max(0, purchase.stockedSubtotal / purchase.subtotal)) : 0;
  const stocked = round2(value * stockedShare);
  const service = round2(value - stocked);
  const ids = await resolveAccountIds(tx, [...(stocked !== 0 ? ['5100'] : []), ...(service !== 0 ? [expCode] : [])]);
  const lines: { accountId: string; amount: number }[] = [];
  if (stocked !== 0) lines.push({ accountId: ids.get('5100')!, amount: stocked });
  if (service !== 0) lines.push({ accountId: ids.get(expCode)!, amount: service });
  return lines;
}
