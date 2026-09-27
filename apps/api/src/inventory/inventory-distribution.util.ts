import { Prisma } from '@mad-app/db';
import { round2 } from '../common/money/rounding';
import { INVENTORY_VARIANCE_ACCOUNT_CODE } from '../journal/inventory-variance-account.util';
import { WRITEOFF_EXPENSE_ACCOUNT_CODE } from '../journal/writeoff-account.util';

type Tx = Prisma.TransactionClient;

/**
 * 🔴 **`ق-١٣٦٤` — الحارسُ الثاني: على التوزيع لا على المجموع.**
 *
 * **بنصّ المالك**: «⚠️ ومعها حارسٌ ثانٍ على التوزيع لا على المجموع، كما أعلنتَ.» — والحارسُ الأوّل (`ق-١٣٤٣`) أعلن حدَّه بنفسه: يرى
 * **الافتراقَ** بين `1300` والطبقات، ولا يرى **سوءَ التوزيع** — حصّةٌ ذهبت إلى `5100` وحقُّها طبقةٌ على رفٍّ آخر لا تُحدث فرقاً.
 *
 * ## ثلاثةُ فحوص — كلُّها من مصادر لا يكتبها الموزِّع وحدَه
 *
 * **① القسمة تُشتقّ من جديد** — لكلِّ حصّةٍ مسجَّلة (`layer_cost_shares`): مخارجُ طبقتها **لحظةَ الحصّة** تُقرأ من صفوف الاستهلاك
 * نفسِها (شطبٌ · يدويٌّ · تحويلٌ بطبقة مقصِده · إعادةُ مورّد · ما لا يُعرف) والبيعُ الباقي — **بتنفيذٍ مستقلّ عن الموزِّع**
 * (استعلامٌ هنا لا دالّتُه) — ثم تُطابَق حصصُ الأنواع المسجَّلة بنسبها. وحصّةُ التسوية: نوعُها نوعُ المخرج الذي أخرج المؤقّت.
 * **② التابعُ يساوي أبناءه**: `baseFollow` = Σ حصص الطبقات التي تبعها — وكلُّ ابنٍ طبقةٌ وُلدت بتحويلٍ من طبقة أبيه.
 * **③ الدفترُ يطابق السجلّ** على الحسابين المخصوصين: `5800` = قيودُ الشطب المعتمَد + Σ حصص الإتلاف · `5810` = قيودُ الحركات اليدوية
 * + Σ حصص الفروقات — **من القيود الآلية وحدَها** (قيدٌ يدويٌّ يكتبه المحاسب على الحسابين شأنُه). و`5100` مشتركٌ مع مصروفات الشراء
 * فلا يُطابَق هنا — يكفيه ① (النوعُ) والحارسُ الأوّل (المجموع).
 *
 * ⚠️ **وحدُّه معلَن**: التسامحُ هللةٌ لكلِّ مخرجٍ في النوع (القسمةُ بالباقي الأكبر تدوّر كلَّ مخرجٍ على حدة)؛ وما سبق `ق-١٣٦٤` بلا
 * حصصٍ مسجَّلة لا يُفحص هنا (يُعدّ في الهجرة).
 */
export interface InventoryDistributionCheck {
  sharesChecked: number;
  /** ① و② — كلُّ مخالفةٍ نصّاً يُقرأ. */
  findings: string[];
  writeOff: { ledger: number; expected: number; difference: number };
  variance: { ledger: number; expected: number; difference: number };
}

interface ShareRow {
  id: string;
  layerId: string;
  parentId: string | null;
  settlementId: string | null;
  event: string;
  amount: number;
  shelf: number;
  cogs: number;
  writeOff: number;
  variance: number;
  follow: number;
  exited: number;
  createdAt: Date;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;

export async function inventoryDistributionCheck(tx: Tx): Promise<InventoryDistributionCheck> {
  const shares = await tx.$queryRaw<ShareRow[]>`
    SELECT s.id, s."layerId", s."parentId", s."settlementId", s.event::text AS event,
           s."baseAmount"::float8 AS amount, s."baseShelf"::float8 AS shelf, s."baseCogs"::float8 AS cogs,
           s."baseWriteOff"::float8 AS "writeOff", s."baseVariance"::float8 AS variance, s."baseFollow"::float8 AS follow,
           s."exitedQtyAt"::float8 AS exited, s."createdAt"
    FROM layer_cost_shares s`;
  const findings: string[] = [];
  const byId = new Map(shares.map((s) => [s.id, s]));

  for (const s of shares) {
    // ② التابعُ = أبناؤه، وكلُّ ابنٍ وُلد بتحويلٍ من طبقة أبيه.
    const children = shares.filter((c) => c.parentId === s.id);
    const childSum = round2(children.reduce((t, c) => t + c.amount, 0));
    if (!near(childSum, s.follow, 0)) findings.push(`② الحصّة ${s.id}: التابعُ ${s.follow} وأبناؤه ${childSum}`);

    const exited = round2(s.amount - s.shelf);
    if (s.event === 'SETTLEMENT' && s.parentId === null) {
      // ① حصّةُ التسوية: نوعُها نوعُ المخرج الذي أخرج المؤقّت — والباقي صفر.
      const [p] = await tx.$queryRaw<{ type: string; origin: string; dest: string | null }[]>`
        SELECT m.type::text AS type, m.origin::text AS origin, d.id AS dest
        FROM inventory_consumptions st
        JOIN inventory_consumptions pr ON pr.id = st."settlesId"
        JOIN stock_movements m ON m.id = pr."movementId"
        LEFT JOIN inventory_layers d ON d."transferConsumptionId" = pr.id
        WHERE st.id = ${s.settlementId}`;
      if (!p) {
        findings.push(`① تسويةٌ ${s.id} بلا مؤقّتٍ يُقرأ`);
        continue;
      }
      const want = p.type === 'TRANSFER' ? (p.dest ? 'follow' : 'cogs') : p.origin === 'WRITEOFF' ? 'writeOff' : p.origin === 'MANUAL' ? 'variance' : 'cogs';
      const got = { cogs: s.cogs, writeOff: s.writeOff, variance: s.variance, follow: s.follow, shelf: s.shelf };
      for (const [k, v] of Object.entries(got)) {
        const expected = k === want ? s.amount : 0;
        if (!near(v, expected, 0)) findings.push(`① تسويةٌ ${s.id} (${p.origin}/${p.type}): ${k} = ${v} والمتوقَّع ${expected}`);
      }
      continue;
    }
    if (exited === 0) continue;

    // ① المخارجُ لحظةَ الحصّة — من الصفوف، مستقلّاً عن الموزِّع.
    const exits = await tx.$queryRaw<{ qty: number; type: string; origin: string; dest: string | null }[]>`
      SELECT c.qty::float8 AS qty, m.type::text AS type, m.origin::text AS origin, d.id AS dest
      FROM inventory_consumptions c
      JOIN stock_movements m ON m.id = c."movementId"
      LEFT JOIN inventory_layers d ON d."transferConsumptionId" = COALESCE(c."settlesId", c.id)
      WHERE c."layerId" = ${s.layerId} AND c."createdAt" <= ${s.createdAt}
        AND m.origin <> 'SALE'
        AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r."reversalOfId" = m.id AND r."createdAt" <= ${s.createdAt})`;
    const group = { writeOff: { qty: 0, rows: 0 }, variance: { qty: 0, rows: 0 }, follow: { qty: 0, rows: 0 }, cogs: { qty: 0, rows: 0 } };
    for (const e of exits) {
      const k = e.type === 'TRANSFER' ? (e.dest ? 'follow' : 'cogs') : e.origin === 'WRITEOFF' ? 'writeOff' : e.origin === 'MANUAL' ? 'variance' : 'cogs';
      group[k].qty += e.qty;
      group[k].rows += 1;
    }
    const known = group.writeOff.qty + group.variance.qty + group.follow.qty + group.cogs.qty;
    const sale = s.exited > known ? s.exited - known : 0;
    const total = sale + known;
    if (total <= 0) {
      findings.push(`① الحصّة ${s.id}: خارجٌ ${exited} على طبقةٍ لم يخرج منها شيءٌ لحظتَها`);
      continue;
    }
    const expected = {
      writeOff: (exited * group.writeOff.qty) / total,
      variance: (exited * group.variance.qty) / total,
      follow: (exited * group.follow.qty) / total,
      cogs: (exited * (group.cogs.qty + sale)) / total,
    };
    const tol = (rows: number) => 0.01 * Math.max(1, rows + 1);
    if (!near(s.writeOff, expected.writeOff, tol(group.writeOff.rows))) findings.push(`① الحصّة ${s.id}: الإتلاف ${s.writeOff} والمشتقّ ${round2(expected.writeOff)}`);
    if (!near(s.variance, expected.variance, tol(group.variance.rows))) findings.push(`① الحصّة ${s.id}: الفروقات ${s.variance} والمشتقّ ${round2(expected.variance)}`);
    if (!near(s.follow, expected.follow, tol(group.follow.rows))) findings.push(`① الحصّة ${s.id}: التابع ${s.follow} والمشتقّ ${round2(expected.follow)}`);
    if (!near(s.cogs, expected.cogs, tol(group.cogs.rows + 1))) findings.push(`① الحصّة ${s.id}: المبيعات ${s.cogs} والمشتقّ ${round2(expected.cogs)}`);

    // ② وكلُّ ابنٍ طبقتُه وُلدت بتحويلٍ من طبقة أبيه (شريحةً منها، أو مؤقّتاً سوّته).
    for (const c of children) {
      const [link] = await tx.$queryRaw<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM inventory_layers d
          JOIN inventory_consumptions src ON src.id = d."transferConsumptionId"
          LEFT JOIN inventory_consumptions st ON st."settlesId" = src.id
          WHERE d.id = ${c.layerId} AND (src."layerId" = ${s.layerId} OR st."layerId" = ${s.layerId})
        ) AS ok`;
      if (!link?.ok) findings.push(`② الحصّة ${c.id}: طبقتُها لم تولد بتحويلٍ من طبقة أبيها`);
    }
  }
  void byId;

  // ③ الدفترُ ⇄ السجلّ على الحسابين المخصوصين — من القيود الآلية وحدَها.
  const ledgerOf = async (code: string) => {
    const [r] = await tx.$queryRaw<{ v: number }[]>`
      SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::float8 AS v
      FROM journal_lines jl JOIN accounts a ON a.id = jl."accountId" JOIN journal_entries je ON je.id = jl."journalEntryId"
      WHERE a.code = ${code} AND je.auto = true`;
    return round2(r.v);
  };
  // الحصصُ الحيّة — وتوزيعٌ أُلغي عُكس قيدُه كلُّه فتخرج حصصُه من المقابلة (وتبقى سجلّاً لما كان).
  const [w] = await tx.$queryRaw<{ docs: number; shares: number }[]>`
    SELECT
      COALESCE((SELECT SUM(jl.debit - jl.credit) FROM inventory_write_offs wo
                 JOIN journal_lines jl ON jl."journalEntryId" = wo."journalEntryId" JOIN accounts a ON a.id = jl."accountId"
                WHERE a.code = ${WRITEOFF_EXPENSE_ACCOUNT_CODE}), 0)::float8 AS docs,
      COALESCE((SELECT SUM(s."baseWriteOff") FROM layer_cost_shares s
                 LEFT JOIN landed_cost_distributions d ON d.id = s."landedCostDistributionId"
                WHERE d."voidedAt" IS NULL), 0)::float8 AS shares`;
  const [v] = await tx.$queryRaw<{ docs: number; shares: number }[]>`
    SELECT
      COALESCE((SELECT SUM(jl.debit - jl.credit) FROM stock_movements m
                 JOIN journal_lines jl ON jl."journalEntryId" = m."journalEntryId" JOIN accounts a ON a.id = jl."accountId"
                WHERE a.code = ${INVENTORY_VARIANCE_ACCOUNT_CODE}), 0)::float8 AS docs,
      COALESCE((SELECT SUM(s."baseVariance") FROM layer_cost_shares s
                 LEFT JOIN landed_cost_distributions d ON d.id = s."landedCostDistributionId"
                WHERE d."voidedAt" IS NULL), 0)::float8 AS shares`;
  const writeOffLedger = await ledgerOf(WRITEOFF_EXPENSE_ACCOUNT_CODE);
  const varianceLedger = await ledgerOf(INVENTORY_VARIANCE_ACCOUNT_CODE);
  const writeOffExpected = round2(w.docs + w.shares);
  const varianceExpected = round2(v.docs + v.shares);

  return {
    sharesChecked: shares.length,
    findings,
    writeOff: { ledger: writeOffLedger, expected: writeOffExpected, difference: round2(writeOffLedger - writeOffExpected) },
    variance: { ledger: varianceLedger, expected: varianceExpected, difference: round2(varianceLedger - varianceExpected) },
  };
}
