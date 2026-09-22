import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripCommentsAndStrings } from './source-scan.util';

/**
 * **لا مهلةَ صريحةٍ جديدةٍ أصغرُ من ميزانية حزمتها** (`ق-١٢٩٣` · التوجيه ٢٥٣).
 *
 * ## الواقعة
 *
 * `jest.setTimeout(N)` يضبط **الافتراض**، **والمهلةُ الصريحة على النداء تتقدّم عليه**
 * رفعاً وخفضاً. فبعد أن أُعلنت ميزانيةُ كلِّ حزمة (`ق-١٢٨٥`) بقيت **`752`** مهلةً
 * صريحةً في الحزم، **`519`** منها أصغرُ من ميزانية حزمتها — أي أن ذلك النداء وحدَه
 * ما زال تحت سقفٍ أقلّ.
 *
 * ## والحكم (بنصّ المالك)
 *
 * > «تُترك، ويُمنع الجديد — فكنسُها تغييرٌ أعمى لا يُسنده قياس، وما سقط سقط في نداءٍ
 * > بلا مهلةٍ صريحة.»
 *
 * **فالقائمُ في `docs/test-timeouts-below-budget.json` مِسنَنٌ ينقص ولا يزيد**، و**كلُّ
 * حزمةٍ تُلمس تُوافَق مهلاتُها** — فتنقص القائمةُ **بالعمل لا بحملة**.
 *
 * ⚠️ **وحدُّ الكشف معلَن**: النمطُ `}, NNNN)` بأربعة أرقامٍ فأكثر — وهو شكلُ مهلة
 * `jest` على النداء. **والثلاثيُّ مستثنىً بقياس**: مطابقتُه تلتقط موضعين هما
 * `createPurchase({…}, 400)` — رمزُ حالةٍ لا مهلة. ومهلةٌ دون الثانية لا وجود لها ولا
 * معنى. **والقراءةُ من الشيفرة لا النصّ** (تُجرَّد التعليقاتُ والسلاسل — `§8.24`).
 */

const TEST_DIR = join(__dirname, '..', '..', 'test');
const LIST = join(__dirname, '..', '..', '..', '..', 'docs', 'test-timeouts-below-budget.json');

const EXPLICIT = /\}\s*,\s*(\d{4,})\s*\)/g;
const BUDGET = /jest\.setTimeout\(\s*(\d+)\s*\)/;

/** عددُ المهل الصريحة الأصغر من ميزانية الحزمة — **من الشيفرة المجرَّدة**. */
export function belowBudgetCount(source: string): number {
  const code = stripCommentsAndStrings(source);
  const b = BUDGET.exec(code);
  if (!b) return -1;
  const budget = Number(b[1]);
  let m: RegExpExecArray | null;
  let n = 0;
  EXPLICIT.lastIndex = 0;
  while ((m = EXPLICIT.exec(code)) !== null) if (Number(m[1]) < budget) n += 1;
  return n;
}

describe('لا مهلةَ صريحةٍ جديدةٍ دون ميزانية حزمتها — والقائمُ مِسنَنٌ ينقص (ق-١٢٩٣)', () => {
  const suites = readdirSync(TEST_DIR).filter((f) => f.endsWith('.e2e-spec.ts')).sort();
  const declared = JSON.parse(readFileSync(LIST, 'utf8')).below as Record<string, number>;

  it('السطحُ غير فارغ — وإلا فالحارسُ يفحص العدم', () => {
    expect(suites.length).toBeGreaterThanOrEqual(100);
    expect(Object.keys(declared).length).toBeGreaterThan(0);
  });

  it('⭐ لا حزمةَ خارج القائمة تحمل مهلةً دون ميزانيتها، ولا عددَ يزيد', () => {
    const fresh: string[] = [];
    const grown: string[] = [];
    for (const f of suites) {
      const now = belowBudgetCount(readFileSync(join(TEST_DIR, f), 'utf8'));
      expect(now).toBeGreaterThanOrEqual(0); // ‑1 يعني بلا ميزانية، ويمسكه حارسُ ق-١٢٨٥
      const was = declared[f] ?? 0;
      if (was === 0 && now > 0) fresh.push(`${f}: ${now} — مهلةٌ صريحةٌ جديدةٌ دون الميزانية`);
      else if (now > was) grown.push(`${f}: ${was} ⟵ ${now}`);
    }
    expect(fresh).toEqual([]);
    expect(grown).toEqual([]);
  });

  it('⭐ والمِسنَن: ما نقص يُنقَص في القائمة، وما زال يُحذف منها', () => {
    const stale: string[] = [];
    for (const [f, was] of Object.entries(declared)) {
      if (!suites.includes(f)) {
        stale.push(`${f}: لم تعد موجودة — احذفها من القائمة`);
        continue;
      }
      const now = belowBudgetCount(readFileSync(join(TEST_DIR, f), 'utf8'));
      if (now === 0) stale.push(`${f}: لم يبقَ فيها شيء — احذفها من القائمة`);
      else if (now < was) stale.push(`${f}: ${was} ⟵ ${now} — أنقِص العدد في القائمة`);
    }
    expect(stale).toEqual([]);
  });

  it('مُصادَقٌ بأربعٍ على نصٍّ مصنوع: أصغرُ يُعدّ · أكبرُ لا · ورمزُ الحالة الثلاثيُّ لا يُعدّ · وبلا ميزانيةٍ يُعلَن', () => {
    // ⚠️ **النصُّ مصنوعٌ في موضع النداء** (`ق-١٣٦`): كاشفٌ يُستدعى على متغيّرٍ يبنيه
    //    مساعدٌ **لا يُعدّ مُثبَتاً** — والحارسُ `probe-two-cases` أمسكها فعلاً.
    expect(belowBudgetCount(['jest.setTimeout(60000);', 'it("x", async () => {', '}, 30000);'].join('\n'))).toBe(1);
    expect(belowBudgetCount(['jest.setTimeout(60000);', 'it("x", async () => {', '}, 90000);'].join('\n'))).toBe(0);
    expect(belowBudgetCount(['jest.setTimeout(60000);', 'await createPurchase({ a: 1 }, 400);'].join('\n'))).toBe(0);
    // بلا ميزانيةٍ ⟵ `-1`، ويمسكه حارسُ `ق-١٢٨٥` لا هذا.
    expect(belowBudgetCount('it("x", async () => {\n}, 30000);')).toBe(-1);
  });
});
