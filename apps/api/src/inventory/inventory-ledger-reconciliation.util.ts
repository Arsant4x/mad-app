import { Prisma } from '@prisma/client';
import { round2, roundTo } from '../common/money/rounding';
import { INVENTORY_ACCOUNT_CODE } from '../journal/inventory-accounts.util';

type Tx = Prisma.TransactionClient;

/**
 * 🔴 `ق-١٣٤٣` — **مطابقةُ رصيد حساب المخزون بقيمة الطبقات**: ما يقوله الدفترُ عن المخزون مقابل ما على الرفّ بتكلفته.
 *
 * **بنصّ المالك**: «فتحليلُك يقول إن الافتراقَ يتراكم بلا حارس، وكلُّ رفعٍ للتكلفة يزيده. فيُبنى حارسٌ حيٌّ يقارن
 * الرصيدَ بمجموع المتبقّي في تكلفته، ويسقط بفرق.» — وكان مسبارٌ مُصادَق قد وجد **صفرَ مطابقةٍ في الشيفرة**.
 *
 * ## المعادلة — صارمةٌ منذ `ق-١٣٦٣`
 *
 *     الدفتر(1300) = الطبقات − المؤقّت المفتوح      ⟸   الفرقُ = الدفتر − الطبقات + المؤقّت
 *
 * **وسقط منها «صافي اليدويّ»** بحكم المالك (`ق-١٣٦٣`): «فحركةٌ تُحرّك قيمةَ المخزون ولا تصل الدفتر تجعل الدفترَ لا يطابق ما
 * على الرفّ، وهذا عينُ ما بُني الحارسُ ليمنعه … ⇒ ويسقط استثناءُ «اليدويّ» من معادلة الحارس، فيصير صارماً.» — فالحركةُ اليدوية
 * صار لها قيدٌ على `5810 فروقات المخزون` (`postManualStockEntry`)، ولا شيءَ يتحرّك في الطبقات بلا أثرٍ في الدفتر إلا ما يُعلَن أدناه.
 *
 * - **الطبقات**: `Σ qtyRemaining × unitCost` — قيمةُ ما على الرفّ بتكلفته اليوم.
 * - **المؤقّت المفتوح** (`openProvisional`): استهلاكٌ بلا طبقةٍ لم تصله تسوية، **غادرت قيمتُه رفَّ المصدر في الدفتر** — بيعٌ سبق
 *   استلامَه (قيدُ التكلفة) · شطبٌ وراء الرصيد (قيدُ الشطب) · إخراجٌ يدويٌّ بعد `ق-١٣٦٣` (قيدُه) — **أو إلى رفِّ المقصِد** (تحويلٌ
 *   وراء الرصيد يُنشئ طبقةَ مقصِدٍ بتكلفته المؤقّتة). `ق-١٠٦٣/١`: «قائمةُ الدخل قد تحوي تقديراً، ويجب أن يكون مقروءاً».
 *
 * ## والقديمُ يُعدّ ولا يُطرح (`ق-١١٧٨`)
 *
 * `legacyManualUnposted`: ما حرّكته في الطبقات حركاتٌ يدويةٌ **سبقت `ق-١٣٦٣` بلا قيد** (وعكوسُها) — **رقمٌ معلَنٌ يفسّر الفرقَ ولا
 * يدخل المعادلة**: فرقٌ يساوي `−legacyManualUnposted` كلُّه قديم. ومؤقّتُها المفتوح خارج `openProvisional` (لم يُقيَّد).
 * ⚠️ **وحدُّه**: لا يرى صفوفَ التسوية (`settlesId`) — فتسويةُ مؤقّتِ إخراجٍ قديمٍ **قبل** البناء (رُحّل فرقُها على `5100` وأصلُها بلا
 * قيد) تبقى في الفرق بلا تفسيرٍ هنا؛ وتسويتُه **بعد** البناء قيدُها كاملاً على `5810` فلا أثر.
 *
 * ⚠️ **وحدُّ الحارس معلَن**: يرى **الافتراقَ** بين الحسابين لا **سوءَ التوزيع** بينهما — حصّةُ تكلفةٍ ذهبت إلى `5100` وحقُّها طبقةٌ
 * على رفٍّ آخر (التحويل) لا تُحدث فرقاً بين `1300` والطبقات (`ق-١٣٤٤`). **فالتوزيعُ يحرسه حارسٌ ثانٍ** (`inventory-distribution.util`
 * — `ق-١٣٦٤`): القسمةُ المسجَّلة تُطابَق بالمشتقّة من الصفوف، و`5800`/`5810` بسجلّهما.
 *
 * **على مستوى المنشأة بحقّها**: المطابقةُ بين حسابٍ واحد في دليل المنشأة وطبقاتِها كلِّها — فرعُ القارئ لا يقسم
 * رصيدَ `1300` (سطورُه بلا فرعٍ في أغلبها) فمطابقةُ فرعٍ بعينه فرقٌ مصطنع.
 */
export interface InventoryLedgerReconciliation {
  /** صافي `1300` في الدفتر (مدين − دائن). */
  ledger: number;
  /** قيمةُ ما على الرفّ بتكلفته. */
  layers: number;
  /** تكلفةٌ مؤقّتةٌ غادرت رفَّ المصدر في الدفتر أو إلى رفِّ المقصِد بلا طبقةٍ تُنقَص — مفتوحةٌ حتى تُسوّيها طبقةٌ تصل (`ق-١٠٦٣/١`). */
  openProvisional: number;
  /** ما حرّكته حركاتٌ يدويةٌ قديمة بلا قيد (سبقت `ق-١٣٦٣`) — **يُعدّ ولا يُطرح**: يفسّر الفرقَ ولا يُخفيه. */
  legacyManualUnposted: number;
  /** **الافتراق** — صارماً: `ledger − layers + openProvisional`. صفرٌ = مطابق. */
  difference: number;
  /**
   * (`ق-١٤٦٩` · التوجيه ٢٦٦ §٤هـ) **المؤقّتُ المفتوح بتكلفة صفر — عدداً وكمّيةً، خارج المعادلة**: قيمتُه صفرٌ فلا تراه
   * `openProvisional` ولا `difference` أبداً — فكان صامتاً في المطابقة. **يُعدّ ولا يُطرح**، كـ`legacyManualUnposted`.
   */
  openProvisionalZeroCost: { count: number; qty: number };
}

export async function inventoryLedgerReconciliation(tx: Tx): Promise<InventoryLedgerReconciliation> {
  const [ledger] = await tx.$queryRaw<{ v: number }[]>`
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::float8 AS v
    FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId"
    WHERE a.code = ${INVENTORY_ACCOUNT_CODE}`;

  const [layers] = await tx.$queryRaw<{ v: number }[]>`
    SELECT COALESCE(SUM(l."qtyRemaining" * l."unitCost"), 0)::float8 AS v FROM inventory_layers l`;

  // المؤقّتُ المفتوح: استهلاكٌ بلا طبقةٍ لم تصله تسوية — إلا إخراجاً يدويّاً قديماً بلا قيد (لم تغادر قيمتُه الدفترَ ولا إلى رفٍّ آخر).
  const [provisional] = await tx.$queryRaw<{ v: number }[]>`
    SELECT COALESCE(SUM(c.qty * c."unitCost"), 0)::float8 AS v
    FROM inventory_consumptions c JOIN stock_movements m ON m.id = c."movementId"
    WHERE c."layerId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM inventory_consumptions s WHERE s."settlesId" = c.id)
      AND NOT (m.origin = 'MANUAL' AND m.type <> 'TRANSFER' AND m."journalEntryId" IS NULL)`;

  // القديمُ بلا قيد: طبقاتُ إدخالٍ يدويٍّ قديم − ما استهلكه إخراجٌ يدويٌّ قديم من طبقات + ما أعاده عكسُه (بما خرج به)؛ والتحويلُ خارجه.
  const [legacy] = await tx.$queryRaw<{ added: number; consumed: number; restored: number }[]>`
    SELECT
      COALESCE((SELECT SUM(l."qtyReceived" * l."unitCost") FROM inventory_layers l JOIN stock_movements m ON m.id = l."sourceMovementId"
                WHERE l."sourceType" = 'ADJUSTMENT' AND m.origin = 'MANUAL' AND m."journalEntryId" IS NULL), 0)::float8 AS added,
      COALESCE((SELECT SUM(c.qty * c."unitCost") FROM inventory_consumptions c JOIN stock_movements m ON m.id = c."movementId"
                WHERE c."layerId" IS NOT NULL AND c."settlesId" IS NULL
                  AND m.origin = 'MANUAL' AND m.type <> 'TRANSFER' AND m."journalEntryId" IS NULL), 0)::float8 AS consumed,
      COALESCE((SELECT SUM(c.qty * c."unitCost") FROM inventory_consumptions c JOIN stock_movements m ON m.id = c."movementId"
                WHERE c."layerId" IS NOT NULL AND c."settlesId" IS NULL
                  AND m.origin = 'MANUAL' AND m.type <> 'TRANSFER' AND m."journalEntryId" IS NULL
                  AND EXISTS (SELECT 1 FROM stock_movements r WHERE r."reversalOfId" = m.id AND r.type = 'IN')), 0)::float8 AS restored`;

  const [zero] = await tx.$queryRaw<{ n: number; q: number }[]>`
    SELECT count(*)::int AS n, COALESCE(SUM(c.qty), 0)::float8 AS q
    FROM inventory_consumptions c
    WHERE c."layerId" IS NULL AND c."unitCost" = 0
      AND NOT EXISTS (SELECT 1 FROM inventory_consumptions s WHERE s."settlesId" = c.id)`;

  return {
    ledger: round2(ledger.v),
    layers: round2(layers.v),
    openProvisional: round2(provisional.v),
    legacyManualUnposted: round2(legacy.added - legacy.consumed + legacy.restored),
    difference: round2(ledger.v - layers.v + provisional.v),
    openProvisionalZeroCost: { count: zero.n, qty: roundTo(zero.q, 'DERIVED_QUANTITY') },
  };
}
