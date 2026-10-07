import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from './source-scan.util';

// يقرأ نصوصاً معلَنة عمداً: الرسائلُ وثائق، والاسمُ الممنوع نصٌّ فيها لا شيفرة.
readsDeclaredStrings();

/**
 * ⚖️ **القاعدةُ الدائمة ٤٣** (`ق-١٦٥١`، بحكم صاحب المشروع): لا يُكتب اسمُ المنصّة ولا ما يدلّ عليها
 * بعينها (الاسمُ بالعربية أو الإنجليزية، والنطاق، والشعار) في رسائل الاستفسار للأطراف الخارجية،
 * وتُسمّى «منصّة سحابية للمحاسبة وإدارة الأعمال» أو «المنصّة»، «ولها بوّابةٌ تُسقط أيَّ ملفٍّ في
 * docs/رسائل-الجهات/ فيه الاسم». والطلباتُ الرسمية (التسجيلُ لدى جهة، والتقديمُ على برنامج، والتعاقد)
 * يُكتب فيها الاسم (`ق-١٦٥٢`)، ولا توضع في هذا المجلّد؛ فالحارسُ كما هو.
 *
 * ── ما يُمسك ─────────────────────────────────────────────────────────────
 * · الاسمُ بالعربية بعد نزع الحركات والتطويل، كلمةً مستقلّة أو بسوابقها (و ف ب ل ك)، فلا تُصاب «مركز»
 *   ولا «تركيز»، والصيغةُ الممدودة كذلك.
 * · الاسمُ بالإنجليزية بصيغتيه، ومعه النطاقُ لأنه يبدأ بالاسم.
 * · ملفٌّ غيرُ `md` في المجلّد (صورةٌ يكون فيها الشعار).
 *
 * ⚠️ **وحدُّها**: لا ترى ما يُكتب خارج المجلّد (البريدُ ومذكّرةُ المحاسب خارج المستودع)،
 * ولا شعاراً مرسوماً داخل نصّ، ولا تميّز الاستفسارَ من الطلب الرسميّ. فيُراجَع ذلك باليد قبل كلِّ إرسال.
 */
const DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'رسائل-الجهات');

const AR_LETTER = '\\u0621-\\u064A';
const strip = (s: string): string => s.replace(/[ً-ْٰـ]/g, '');
const AR_NAME = new RegExp(`(^|[^${AR_LETTER}])[وفبلك]{0,2}(?:ركز|ركاز)(?![${AR_LETTER}])`);
const EN_NAME = /\brika?z/i;

/** يعيد أسطرَ النصّ التي فيها الاسم، بأرقامها. */
export function nameHits(text: string): string[] {
  const hits: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const bare = strip(line);
    if (AR_NAME.test(bare) || EN_NAME.test(bare)) hits.push(`${i + 1}: ${line.trim().slice(0, 120)}`);
  });
  return hits;
}

describe('لا اسمَ للمنصّة في رسائل الجهات (القاعدة ٤٣ · ق-١٦٥١)', () => {
  it('⓪ المسبارُ يرى: يُصيب الاسمَ بصيغه، ولا يُصيب «مركز» و«تركيز»', () => {
    // مصادقةُ المسبار بحالتين (القاعدة ٢٩): ما يجب أن يُصاب، وما يجب ألّا يُصاب.
    const name = ['ر', 'ِ', 'كز'].join('');
    for (const must of [`نحن «${name}»، منصّة`, `ل${name} وحدها`, `و${name}`, `منصّة ${name}.`, ['Ri', 'kaz'].join(''), ['RI', 'KZ'].join(''), `https://test-app.${['rik', 'zapp'].join('')}.com`]) {
      expect(nameHits(must)).toHaveLength(1);
    }
    for (const mustNot of ['المركز الوطني للبيانات', 'مع التركيز على الضريبة', 'مركز البيانات في الرياض', 'brick zone']) {
      expect(nameHits(mustNot)).toHaveLength(0);
    }
  });

  it('① المجلّدُ يُقرأ فعلاً، وكلُّ ما فيه نصّ', () => {
    const files = readdirSync(DIR);
    expect(files).toEqual(expect.arrayContaining(['sdaia.md', 'zatca.md', 'lawyer_memo.md']));
    const notText = files.filter((f) => !/\.md$/i.test(f));
    expect(notText).toEqual([]);
  });

  it('② لا ملفَّ في رسائل الجهات فيه اسمُ المنصّة أو نطاقُها', () => {
    const offenders = readdirSync(DIR)
      .filter((f) => /\.md$/i.test(f))
      .flatMap((f) => nameHits(readFileSync(join(DIR, f), 'utf8')).map((h) => `${f}:${h}`));
    expect(offenders).toEqual([]);
  });
});
