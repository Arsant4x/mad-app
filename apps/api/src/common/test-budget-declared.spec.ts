import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripCommentsAndStrings } from './source-scan.util';

/**
 * **كلُّ حزمةِ طرفٍ إلى طرف تُعلن ميزانيتها** (`ق-١٢٨٥` · التوجيه ٢٥٢).
 *
 * ## الواقعة — مقيسةٌ على الشجرة الحاضرة لا منقولةٌ عن سجلّ
 *
 * `jest` يعطي الاختبارَ والخطّافَ **خمسَ ثوانٍ افتراضاً**، والتهيئةُ والتنظيفُ في
 * حزمِنا تُنشئان مستنداتٍ وتمحوانها بمسارٍ يعكس قيودَه: **عملٌ يكبر بما أنشأته
 * الحزمة**. وفي قياس زمن الحزم (٢٥٢) سقطت في **دفعةٍ واحدة** خمسُ حزمٍ بهذه المهلة
 * وحدَها — `opening-stock` (في اختبارٍ وخطّاف) و`pos` و`pos-offline` و`pos-split`
 * و`pos-offline-incidents` (في خطّافٍ، **واختباراتُها كلُّها خضراء**).
 *
 * **والسقوطُ الكاذب يُخفي الصادق ويُنفق الوقت** (بنصّ المالك) — فحزمةٌ تسقط في
 * خطّافها تُقرأ انحداراً، ويُبحث في المنتَج عن علّةٍ ليست فيه.
 *
 * ## والقاعدة
 *
 * **ميزانيةُ كلِّ حزمةٍ ثلاثةُ أضعاف زمنها المقيس، معلنةً في الحزمة نفسِها** —
 * `jest.setTimeout(N)` في أوّلها. وهذا الحارسُ يمنع **حزمةً جديدة بلا ميزانية**.
 *
 * ⚠️ **ومهلةُ معاملة `Prisma` (خمسُ ثوانٍ) عائلةٌ أخرى لا تُمسّ هنا** — تلك تسقط
 * بـ`Transaction already closed` من **داخل الخدمة**، وعلاجُها عملٌ أقلُّ في المعاملة
 * لا ميزانيةُ خطّاف (عائلةُ `property-kpis`). وقد سقطت بها `note-outbox` في الدفعة
 * نفسِها — **فبقيت حمراءَ بعد الميزانيات، وهذا هو الصواب**.
 *
 * ⚠️ **وحدُّ نطاقه معلَن**: حزمُ `apps/api/test/*.e2e-spec.ts` وحدَها. والمجسّاتُ
 * الحيّة (`*.live.spec.ts` — **ثمانيةَ عشرَ ملفّاً**) خارجه: أزمنتُها أقصرُ بمرتبة،
 * ولم تسقط منها واحدةٌ بهذه المهلة في قياس ٢٥٢.
 */

const TEST_DIR = join(__dirname, '..', '..', 'test');
/** أدنى ميزانيةٍ مقبولة — فحزمةٌ تُعلن ثانيتين لم تُعلن شيئاً. */
export const MIN_BUDGET_MS = 30000;
const DECLARATION = /jest\.setTimeout\(\s*(\d+)\s*\)/;

export function e2eSuites(dir = TEST_DIR): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.e2e-spec.ts')).sort();
}

/** الميزانيةُ المعلَنة — **تُقرأ من الشيفرة لا من تعليقٍ ولا نصّ** (`§8.24`). */
export function declaredBudgetMs(source: string): number | null {
  const m = DECLARATION.exec(stripCommentsAndStrings(source));
  return m ? Number(m[1]) : null;
}

describe('كلُّ حزمةِ e2e تُعلن ميزانيتها — ولا حزمةَ جديدة بلا إعلان (ق-١٢٨٥)', () => {
  const suites = e2eSuites();

  it('السطحُ غير فارغ — وإلا فالحارسُ يفحص العدم', () => {
    expect(suites.length).toBeGreaterThanOrEqual(100);
  });

  it('⭐ كلُّ حزمةٍ تُعلن jest.setTimeout بثلاثين ثانيةً فأكثر', () => {
    const missing: string[] = [];
    const tooSmall: string[] = [];
    for (const f of suites) {
      const budget = declaredBudgetMs(readFileSync(join(TEST_DIR, f), 'utf8'));
      if (budget === null) missing.push(f);
      else if (budget < MIN_BUDGET_MS) tooSmall.push(`${f} (${budget})`);
    }
    expect(missing).toEqual([]);
    expect(tooSmall).toEqual([]);
  });

  it('مُصادَقٌ بثلاثٍ: بلا إعلانٍ يُدان · وإعلانٌ في تعليقٍ يُدان · والمعلَنُ يُقرأ', () => {
    expect(declaredBudgetMs('describe("x", () => {});')).toBeNull();
    expect(declaredBudgetMs('// jest.setTimeout(60000);\ndescribe("x", () => {});')).toBeNull();
    expect(declaredBudgetMs('jest.setTimeout(60000);\ndescribe("x", () => {});')).toBe(60000);
  });
});
