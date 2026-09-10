import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripComments } from '../common/source-scan.util';

/**
 * **مصدرٌ واحد لإيراد الإيجار** (`ق-٤٦٩`).
 *
 * الإيرادُ لم يعد يُكتب لحظةَ القبض كاملاً: **ما مضى من فترة الخدمة إيرادٌ وما
 * بقي التزام**، وتحوّلُه يجري في موضعٍ واحد. **ومسارُ ترحيلٍ ثانٍ يذكر `4200`
 * يتجاوز القاعدةَ كلَّها** — ولا يظهر في اختبارٍ أخضر، **لأن قيدَه متوازنٌ
 * وصحيحُ الشكل وكاذبُ التوقيت**.
 *
 * فهذا الحارس يقرأ **المصدر** (`ق-٣٣١`) ويُدين أيَّ ملفٍّ يذكر الرمزَ خارج
 * موضعَيه: تعريفِه في الدليل، وترحيلِه في `auto-posting.util.ts`.
 *
 * ⚠️ **وحدُّه يُعلَن في وجهه** (`ق-٤٤٩`): **يُدين مساراً برمجياً لا قيداً
 * يدوياً**. **فالتاجر يملك دفترَه** — وقيدٌ يدويٌّ على `4200` حقُّه لا خرقٌ
 * للحارس، ولا يراه هذا الملفّ ولا ينبغي أن يراه.
 *
 * ⚠️ **وحدٌّ ثانٍ**: يقرأ الرمزَ نصّاً. **فمن بناه بالتركيب** (`'42' + '00'`)
 * **أو قرأه من إعدادٍ لا يُدان** — ويُوسَّع بالإشارات لا بقائمةِ ملفّات.
 */
const SRC = join(__dirname, '..');

/** الملفّاتُ المأذونُ لها بذكر الرمز — **بمسارها لا باسمها**. */
const ALLOWED = ['accounts/default-chart.ts', 'journal/auto-posting.util.ts'];

const RENT_REVENUE_CODE = '4200';

/** الملفّاتُ التي تذكر الرمز في **شيفرتها** — لا في تعليقاتها. */
export function filesMentioning(code: string, root = SRC): string[] {
  const needle = new RegExp(`['"\`]${code}['"\`]`);
  return sourceFiles(root)
    .filter((f) => needle.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => relative(root, f).replace(/\\/g, '/'));
}

describe('إيرادُ الإيجار يُكتب من مصدرٍ واحد (ق-٤٦٩)', () => {
  it('🔴 لا ملفَّ يذكر رمزَ إيراد الإيجار خارج موضعَيه', () => {
    const offenders = filesMentioning(RENT_REVENUE_CODE).filter((f) => !ALLOWED.includes(f));
    expect(offenders).toEqual([]);
  });

  it('والسطحُ غيرُ فارغ — الموضعان المأذونان موجودان فعلاً', () => {
    // مجسٌّ للمجسّ: صفرُ مواضعَ يعني أن القراءةَ أخفقت لا أن الرمز اختفى.
    const found = filesMentioning(RENT_REVENUE_CODE);
    expect(found.sort()).toEqual([...ALLOWED].sort());
  });

  it('والقارئُ مُثبَتٌ بحالتَين: يرى الذكرَ في الشيفرة ولا يراه في تعليق', () => {
    const code = `const x = '${RENT_REVENUE_CODE}';`;
    const comment = `// كان هنا '${RENT_REVENUE_CODE}' سابقاً`;
    const needle = new RegExp(`['"\`]${RENT_REVENUE_CODE}['"\`]`);
    expect(needle.test(stripComments(code))).toBe(true);
    expect(needle.test(stripComments(comment))).toBe(false);
  });

  it('وحسابُ الالتزام كذلك — يُكتب من ملفّه وحده', () => {
    const offenders = filesMentioning('2400').filter(
      (f) => !['accounts/default-chart.ts', 'journal/deferred-revenue-account.util.ts'].includes(f),
    );
    expect(offenders).toEqual([]);
  });
});
