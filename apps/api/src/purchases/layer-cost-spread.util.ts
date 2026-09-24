import { roundTo } from '../common/money/rounding';

/**
 * ⚖️ **فرقُ تكلفةٍ يصل طبقةً بعد أن استُهلك منها — دالّةٌ واحدة لإشعار السعر وللتكلفة المحمَّلة** (`٧` · `ق-١١٤٦`/ج).
 *
 * الحكمُ المبنيّ في إشعار المورّد (`ق-٩٩٠`): **ما بقي على الرفّ يتبع الطبقةَ** (تكلفةُ وحدتها تتغيّر ويُقيَّد على
 * `1300`)، **وما استُهلك بيع بتكلفته القديمة فأثرُه تكلفةُ مبيعاتٍ في فترة الحدث** (`5100`) — لا في فترة البيع،
 * فلا يُعاد كتابةُ تاريخ. والتكلفةُ المحمَّلة (شحنٌ · تخليصٌ · رسوم) الحكمُ نفسُه بلا نسخة: الوحداتُ المتأثّرة
 * هي كلُّ ما استُلم في الطبقة، ونصيبُ الوحدة هو المبلغُ مقسوماً عليها.
 *
 * ⚖️ **وحصّةُ ما خرج لم تعد كلُّها `5100`** (`ق-١٣٦٤`): هذه الدالّةُ تقسم الرفَّ من الخارج وحدَها، وقسمةُ الخارج على مخارجه
 * (البيعُ · الشطبُ `5800` · اليدويُّ `5810` · والتحويلُ يتبع طبقةَ مقصِده) في `layer-cost-allocation.util` — مستدعيها الوحيد.
 *
 * **نقيّةٌ عمداً** — لا تقرأ ولا تكتب: القارئُ يقرّر الوحداتِ المتأثّرة ونصيبَها، والكاتبُ يكتب الطبقةَ بشرطٍ
 * (كتابةٌ مشروطة بالمتبقّي المقروء — `ق-٨١٤`) ويقيّد الحصّتين. والمبالغُ تُعاد **غيرَ مدوَّرة** لأن مواضعَ
 * التدوير تختلف: الإشعارُ يجمع سطورَه ثم يدوّر، والتوزيعُ يدوّر لكلِّ طبقة ويجبر الحصّتين على المجموع.
 */
export interface LayerCostSpreadArgs {
  /** الوحداتُ التي يقع عليها الفرق — كمّيةُ الإشعار، أو كلُّ ما استُلم في الطبقة للتكلفة المحمَّلة. */
  unitsAffected: number;
  /** نصيبُ الوحدة الواحدة من الفرق، موجباً (الاتجاهُ في `direction`). */
  perUnitAmount: number;
  /** `1` زيادةٌ في التكلفة (إشعارٌ مدين · تكلفةٌ محمَّلة) · `-1` نقصٌ (إشعارٌ دائن). */
  direction: 1 | -1;
  qtyRemaining: number;
  unitCost: number;
}

export interface LayerCostSpread {
  /** ما يقع من الوحدات المتأثّرة على الرفّ (لا يتجاوز المتبقّي). */
  onShelfQty: number;
  /** وما استُهلك منها قبل الحدث. */
  consumedQty: number;
  /** حصّةُ الرفّ من الفرق — غيرَ مدوَّرة وغيرَ موقَّعة. */
  baseInventory: number;
  /** حصّةُ المستهلَك — غيرَ مدوَّرة وغيرَ موقَّعة. */
  baseCogs: number;
  /** تكلفةُ الوحدة بعد الحدث — مدوَّرةً بسياسة `UNIT_COST`؛ وكما هي حين لا شيءَ على الرفّ. */
  newUnitCost: number;
}

/** تكلفةُ الوحدة بعد أن يُضاف (أو يُطرح) فرقٌ على ما بقي في الطبقة — وطبقةٌ فارغة تبقى على تكلفتها. */
export function unitCostAfterShelfDelta(qtyRemaining: number, unitCost: number, shelfDelta: number): number {
  if (qtyRemaining <= 0) return unitCost;
  return roundTo((qtyRemaining * unitCost + shelfDelta) / qtyRemaining, 'UNIT_COST');
}

export function spreadCostOverLayer(a: LayerCostSpreadArgs): LayerCostSpread {
  const onShelfQty = Math.max(0, Math.min(a.unitsAffected, a.qtyRemaining));
  const consumedQty = roundTo(a.unitsAffected - onShelfQty, 'DERIVED_QUANTITY');
  const baseInventory = onShelfQty * a.perUnitAmount;
  const baseCogs = consumedQty * a.perUnitAmount;
  const newUnitCost = onShelfQty > 0 ? unitCostAfterShelfDelta(a.qtyRemaining, a.unitCost, a.direction * baseInventory) : a.unitCost;
  return { onShelfQty, consumedQty, baseInventory, baseCogs, newUnitCost };
}
