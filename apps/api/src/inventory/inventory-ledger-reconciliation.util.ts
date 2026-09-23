import { Prisma } from '@prisma/client';
import { round2 } from '../common/money/rounding';
import { INVENTORY_ACCOUNT_CODE } from '../journal/inventory-accounts.util';

type Tx = Prisma.TransactionClient;

/**
 * 🔴 `ق-١٣٤٣` — **مطابقةُ رصيد حساب المخزون بقيمة الطبقات**: ما يقوله الدفترُ عن المخزون مقابل ما على الرفّ بتكلفته.
 *
 * **بنصّ المالك**: «فتحليلُك يقول إن الافتراقَ يتراكم بلا حارس، وكلُّ رفعٍ للتكلفة يزيده. فيُبنى حارسٌ حيٌّ يقارن
 * الرصيدَ بمجموع المتبقّي في تكلفته، ويسقط بفرق.» — وكان مسبارٌ مُصادَق قد وجد **صفرَ مطابقةٍ في الشيفرة**.
 *
 * ## المعادلة — وما يُعلَن بقرارٍ قائم لا يُخفى
 *
 *     الدفتر(1300) = الطبقات − صافي اليدويّ − المؤقّت المفتوح      ⟸   الفرقُ = الدفتر − الطبقات + صافي اليدويّ + المؤقّت
 *
 * - **الطبقات**: `Σ qtyRemaining × unitCost` — قيمةُ ما على الرفّ بتكلفته اليوم.
 * - **صافي اليدويّ** (`manualOneSided`): الحركةُ اليدوية **تُحرّك الطبقاتِ بلا قيد بقرارٍ قائم** («ولا قيدَ في الدفتر —
 *   كما لم يكن للحركة اليدوية قيد» · ㉘ · `ق-١٠٦٣`). فتُعدّ رقماً معلَناً: طبقاتُ الإدخال اليدويّ − ما استهلكه الإخراجُ
 *   اليدويّ + ما أعاده عكسُه. **والتحويلُ خارجه** — يُنقص طبقةً ويُنشئ أخرى بتكلفتها، فيبقى المجموع.
 * - **المؤقّت المفتوح** (`openProvisional`): بيعٌ سبق استلامَه رُحّلت تكلفتُه بآخر تكلفةٍ معروفة **بلا طبقةٍ تُنقَص** حتى
 *   يصل الاستلام (`ق-١٠٦٣/١`: «قائمةُ الدخل قد تحوي تقديراً، ويجب أن يكون مقروءاً»).
 *
 * ⚠️ **وحدُّها معلَن**: الحارسُ يرى **الافتراقَ** بين الحسابين لا **سوءَ التوزيع** بينهما — حصّةُ تكلفةٍ ذهبت إلى `5100`
 * وحقُّها طبقةٌ على رفٍّ آخر (التحويل) لا تُحدث فرقاً بين `1300` والطبقات. فالعيبان «التحويلُ مستهلَك» و«الإتلافُ إلى
 * تكلفة المبيعات» **لا يقيسهما هذا الحارس** — يقيسهما سيناريو حزمته بأرقامٍ مسمّاة (`ق-١٣٤٤`).
 *
 * **على مستوى المنشأة بحقّها**: المطابقةُ بين حسابٍ واحد في دليل المنشأة وطبقاتِها كلِّها — فرعُ القارئ لا يقسم
 * رصيدَ `1300` (سطورُه بلا فرعٍ في أغلبها) فمطابقةُ فرعٍ بعينه فرقٌ مصطنع.
 */
export interface InventoryLedgerReconciliation {
  /** صافي `1300` في الدفتر (مدين − دائن). */
  ledger: number;
  /** قيمةُ ما على الرفّ بتكلفته. */
  layers: number;
  /** ما حرّكته الحركاتُ اليدوية في الطبقات بلا قيد — معلَنٌ بقرار (`ق-١٠٦٣`). */
  manualOneSided: number;
  /** تكلفةُ بيعٍ مؤقّتةٌ رُحّلت بلا طبقة — مفتوحةٌ حتى يُسوّيها الاستلام (`ق-١٠٦٣/١`). */
  openProvisional: number;
  /** **الافتراق** — ما لا يفسّره شيءٌ معلَن: `ledger − layers + manualOneSided + openProvisional`. صفرٌ = مطابق. */
  difference: number;
}

export async function inventoryLedgerReconciliation(tx: Tx): Promise<InventoryLedgerReconciliation> {
  const [ledger] = await tx.$queryRaw<{ v: number }[]>`
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::float8 AS v
    FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId"
    WHERE a.code = ${INVENTORY_ACCOUNT_CODE}`;

  const [layers] = await tx.$queryRaw<{ v: number }[]>`
    SELECT COALESCE(SUM(l."qtyRemaining" * l."unitCost"), 0)::float8 AS v FROM inventory_layers l`;

  // اليدويّ: طبقاتُ الإدخال اليدويّ بقيمتها عند إنشائها − ما استهلكه الإخراجُ اليدويّ من طبقاتٍ (لا التحويل)
  //          + ما أعاده عكسُ إخراجٍ يدويّ إلى طبقاته (يُقاس بما خرج به، فعكسُه يُطفئه).
  const [manual] = await tx.$queryRaw<{ added: number; consumed: number; restored: number }[]>`
    SELECT
      COALESCE((SELECT SUM(l."qtyReceived" * l."unitCost") FROM inventory_layers l JOIN stock_movements m ON m.id = l."sourceMovementId"
                WHERE l."sourceType" = 'ADJUSTMENT' AND m.origin = 'MANUAL'), 0)::float8 AS added,
      COALESCE((SELECT SUM(c.qty * c."unitCost") FROM inventory_consumptions c JOIN stock_movements m ON m.id = c."movementId"
                WHERE c."layerId" IS NOT NULL AND m.origin = 'MANUAL' AND m.type <> 'TRANSFER'), 0)::float8 AS consumed,
      COALESCE((SELECT SUM(c.qty * c."unitCost") FROM inventory_consumptions c JOIN stock_movements m ON m.id = c."movementId"
                WHERE c."layerId" IS NOT NULL AND m.origin = 'MANUAL' AND m.type <> 'TRANSFER'
                  AND EXISTS (SELECT 1 FROM stock_movements r WHERE r."reversalOfId" = m.id AND r.type = 'IN')), 0)::float8 AS restored`;

  // المؤقّتُ المفتوح: استهلاكُ بيعٍ بلا طبقة ولم تصله تسوية.
  const [provisional] = await tx.$queryRaw<{ v: number }[]>`
    SELECT COALESCE(SUM(c.qty * c."unitCost"), 0)::float8 AS v
    FROM inventory_consumptions c JOIN stock_movements m ON m.id = c."movementId"
    WHERE c."layerId" IS NULL AND m.origin = 'SALE'
      AND NOT EXISTS (SELECT 1 FROM inventory_consumptions s WHERE s."settlesId" = c.id)`;

  const manualOneSided = manual.added - manual.consumed + manual.restored;
  return {
    ledger: round2(ledger.v),
    layers: round2(layers.v),
    manualOneSided: round2(manualOneSided),
    openProvisional: round2(provisional.v),
    difference: round2(ledger.v - layers.v + manualOneSided + provisional.v),
  };
}
