import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * **كلُّ بوّابةٍ تُستورد إلى مسار الترحيل تُنادى قبل الكتابة** (`ق-٢٧٨`).
 *
 * الواقعة التي وُلد منها: `assertPeriodOpen` هو الحارسُ الوحيد على التاريخ في
 * مسار الترحيل. **وحذفُ سطرِ النداء لا يكسر بناءً ولا يُنبّه `tsc`** — يبقى
 * الاستيرادُ قائماً والملفُّ يُترجَم، **ويمرّ الترحيلُ في فترةٍ مقفلة بصمت**.
 * فالحمايةُ السلوكية وحدها لا تكفي: مجموعةٌ تُحذف مع الميزة التي تحرسها.
 *
 * **وما يحرسه مشتقٌّ من الاستيراد لا من قائمةٍ بأسماء**: كلُّ ما استُورد إلى
 * `journal-posting.util.ts` باسمٍ يبدأ بـ`assert` **يجب أن يُنادى داخل
 * `createJournalEntry`، وقبل `tx.journalEntry.create`** — فبوّابةٌ تُنادى بعد
 * الكتابة تحرس ما كُتب أصلاً. وبوّابةٌ جديدة تُضاف غداً ترثه بلا سطرٍ يُكتب هنا.
 *
 * ⚠️ **وحدُّه معلَن**: من حذف **الاستيرادَ والنداءَ معاً** لا يراه هذا الحارس —
 * يراه الاختبارُ السلوكيّ. طبقتان لا واحدة، وكلٌّ تسدّ ثغرةَ الأخرى.
 */
const POSTING_UTIL = join(__dirname, '..', 'journal', 'journal-posting.util.ts');

/** يُفرِّغ التعليقات والنصوص من الشيفرة — **فحارسٌ يقرأ نصّاً بلا هذا يُدين أمثلته** (`ق-٢٨١/ب`). */
export function blankNonCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** أسماءُ البوّابات المستوردة — كلُّ `assertX` في جملة `import { … } from …`. */
export function importedGates(code: string): string[] {
  const names = new Set<string>();
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^assert[A-Z]/.test(name)) names.add(name);
    }
  }
  return [...names].sort();
}

/** جسمُ `createJournalEntry` — من توقيعها إلى أول `tx.journalEntry.create`. */
export function bodyBeforeWrite(code: string): string {
  const start = code.indexOf('export async function createJournalEntry');
  if (start < 0) throw new Error('لم يُعثر على `createJournalEntry` — تغيّر اسمُ المسار أو موضعُه');
  const write = code.indexOf('tx.journalEntry.create', start);
  if (write < 0) throw new Error('لم يُعثر على كتابة القيد داخل `createJournalEntry`');
  return code.slice(start, write);
}

describe('بوّابات مسار الترحيل مُلحَقة بموضعها (ق-٢٧٨)', () => {
  const code = blankNonCode(readFileSync(POSTING_UTIL, 'utf8'));

  it('🔴 كلُّ بوّابةٍ مستوردة تُنادى داخل `createJournalEntry` قبل كتابة القيد', () => {
    const gates = importedGates(code);
    // مجسٌّ للمجسّ: صفرُ بوّاباتٍ يعني أن القراءةَ أخفقت لا أن المسارَ نظيف.
    expect(gates.length).toBeGreaterThanOrEqual(1);

    const body = bodyBeforeWrite(code);
    const missing = gates.filter((g) => !new RegExp(`\\b${g}\\s*\\(`).test(body));
    expect(missing).toEqual([]);
  });

  it('ولا يُخدع بذكرٍ في تعليقٍ أو نصّ — حالتان معلومتان', () => {
    // تمرّ: نداءٌ حقيقيّ. وتسقط: ذكرٌ في تعليق فقط.
    const real = 'import { assertX } from "./x";\nexport async function createJournalEntry(){ await assertX(1); tx.journalEntry.create({}); }';
    const commented = 'import { assertX } from "./x";\nexport async function createJournalEntry(){ // assertX(1)\n tx.journalEntry.create({}); }';
    const missingIn = (src: string) => {
      const c = blankNonCode(src);
      return importedGates(c).filter((g) => !new RegExp(`\\b${g}\\s*\\(`).test(bodyBeforeWrite(c)));
    };
    expect(missingIn(real)).toEqual([]);
    expect(missingIn(commented)).toEqual(['assertX']);
  });
});
