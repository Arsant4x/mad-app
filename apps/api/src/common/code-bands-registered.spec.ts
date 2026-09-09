import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { stripCommentsAndStrings } from './source-scan.util';
import { CODE_BAND_GROUPS } from '../accounts/code-bands';

/**
 * **كلُّ نطاقِ ترقيمٍ يُنذر قبل جداره — ولا نطاقَ يُولد خارج السجلّ** (`ق-٢٩٥`).
 *
 * الواقعة: نطاقُ رموز البنوك **نفد بلا إنذار**، وظهر رفضُه بـ`409` بدا رفضاً
 * آخر (`ق-٢٩٤`). **والعلّةُ عامّةٌ لا بنكية**: `MAX+1` يمشي في اتجاهٍ واحد،
 * **فكلُّ نطاقٍ يقع فيها** — والأدراجُ عند `1082` من `1099`.
 *
 * فهذا الحارس يثبت اثنين **مشتقَّين من السجلّ لا من قائمةِ أسماء**:
 *
 *   ① **لا نطاقَ يُعرَّف خارج `accounts/code-bands.ts`** — فثابتٌ اسمُه
 *      `X_CODE_MIN/MAX` في خدمةٍ ما هو نطاقٌ **بلا إنذار**، وهو بالضبط ما كان.
 *   ② **وكلُّ مجموعةٍ في السجلّ لها مسارٌ يعرضها** (`code-band`) **في وحدةٍ
 *      يملك صاحبُ الشأن شاشتَها** — فإنذارٌ لا يصل شاشةً لا يُنذر أحداً.
 *
 * ⚠️ **وحدُّه معلَن**: يثبت أن المسار موجود، **لا أن الواجهة تعرضه**. عرضُ
 * الواجهة يثبته اختبارُها.
 */
const SRC = join(__dirname, '..');
const BANDS_FILE = join(SRC, 'accounts', 'code-bands.ts');

/** يُفرِّغ التعليقات والنصوص — **فحارسٌ يقرأ نصّاً بلا هذا يُدين أمثلته** (`ق-٢٨١/ب`). */
/**
 * ⚠️ **كانت نسخةً خامسة — سليمةً هذه المرّة** (`ق-٣٧٥`): تُفرِّغ التعليقاتِ
 * والنصوصَ بفراغٍ فتحفظ السطرَ والعمود، **مطابقةً للمصدر الواحد سلوكاً**.
 * **فوُحِّدت لا لأنها معطوبة بل لئلّا تنحدر** — فأربعُ نسخٍ من الخمس حملت
 * عطلاً، وواحدةٌ نجت بالمصادفة.
 *
 * **والاسمُ يبقى** لأن كاشفَ هذا الحارس واختبارَه يستعملانه.
 */
export const blankNonCode = stripCommentsAndStrings;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !/\.spec\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** ملفاتٌ تُعرِّف ثابتَ نطاقٍ (`X_CODE_MIN` أو `X_CODE_MAX`) بقيمةٍ رقمية. */
export function bandConstantDefiners(files: string[]): string[] {
  return files.filter((f) => /\b(?:const|let|var)\s+\w*_CODE_(?:MIN|MAX)\s*=\s*\d/.test(blankNonCode(readFileSync(f, 'utf8'))));
}

describe('كلُّ نطاقِ ترقيمٍ مسجَّلٌ ويُنذر قبل جداره (ق-٢٩٥)', () => {
  const files = walk(SRC);

  it('🔴 ① لا نطاقَ يُعرَّف خارج سجلّ النطاقات', () => {
    // مجسٌّ للمجسّ: صفرُ ملفاتٍ يعني أن القراءةَ أخفقت لا أن النظام بلا نطاقات.
    expect(files.length).toBeGreaterThan(50);
    const outside = bandConstantDefiners(files).filter((f) => f !== BANDS_FILE);
    expect(outside.map((f) => f.replace(SRC, '').replace(/\\/g, '/'))).toEqual([]);
  });

  it('🔴 ② وكلُّ مجموعةٍ في السجلّ لها مسارٌ يعرضها في وحدتها', () => {
    expect(CODE_BAND_GROUPS.length).toBeGreaterThanOrEqual(2);

    const missing = CODE_BAND_GROUPS.filter((group) => {
      const users = files.filter((f) => hasCodeLine(f, `bandGroup('${group.key}')`, 'bandGroup('));
      if (!users.length) return true;
      // ومسارُ العرض في الوحدة نفسها — لا في شاشةٍ أخرى.
      return !users.some((f) =>
        readdirSync(dirname(f)).some(
          (sibling) => sibling.endsWith('.controller.ts') && hasCodeLine(join(dirname(f), sibling), `'code-band'`, '@Get('),
        ),
      );
    });
    expect(missing.map((g) => g.key)).toEqual([]);
  });

  it('ولا يُخدع بذكرٍ في تعليقٍ أو نصّ — حالتان معلومتان', () => {
    const real = 'const BANK_CODE_MIN = 1100;';
    const commented = '// const BANK_CODE_MIN = 1100;';
    expect(/\b(?:const|let|var)\s+\w*_CODE_(?:MIN|MAX)\s*=\s*\d/.test(blankNonCode(real))).toBe(true);
    expect(/\b(?:const|let|var)\s+\w*_CODE_(?:MIN|MAX)\s*=\s*\d/.test(blankNonCode(commented))).toBe(false);
  });
});

/**
 * **ما يُبحث عنه نصٌّ داخل علامات النصّ** — والتفريغُ يمحوه. فيُقرأ السطرُ
 * **خاماً** للنصّ، **ومفرَّغاً** لمرساةٍ شيفرية تُثبت أنه ليس تعليقاً.
 * (وهو الفخُّ نفسُه الذي أوقع حارسَ المجدوِل — `ق-٢٩٢`.)
 */
function hasCodeLine(file: string, rawNeedle: string, codeAnchor: string): boolean {
  const source = readFileSync(file, 'utf8');
  const raw = source.split(/\r?\n/);
  const blanked = blankNonCode(source).split(/\r?\n/);
  return raw.some((line, i) => line.includes(rawNeedle) && (blanked[i] ?? '').includes(codeAnchor));
}
