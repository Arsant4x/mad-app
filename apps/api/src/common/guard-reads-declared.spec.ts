import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripCommentsAndStrings } from './source-scan.util';

/**
 * **كلُّ حارسٍ يمسح `.ts` يُعلن صنفَه** (`ق-٣٧٥`) — كودٌ يُجرَّد، أو نصٌّ يُقرأ عمداً.
 *
 * ── العطل الذي أنشأ هذه البوّابة ─────────────────────────────────────────
 *
 * ثلاثةُ حرّاسٍ سقطت في يومين لأنها **تُطابق نصَّ الملفّ لا كودَه**: مثالٌ
 * مكتوبٌ في تعليقٍ أو داخل سلسلةٍ نصّية **يُدان كأنه شيفرة**. **وسطحُ السؤال
 * ثلاثون**.
 *
 * 🔴 **لكنّ التجريد الشامل كان سيُعمي سبعةً منها**: `screen-labels` يستخرج
 * التسميات **من داخل السلاسل**، و`spec-tags` يقرأ الوسمَ **من أسماء
 * الاختبارات**. **فتجريدُهما يعيدهما بخريطةٍ فارغة — ويمرّان عمىً**.
 * ⚠️ **وحارسٌ يمرّ عمىً أخطر من كسرٍ يُسقط الحزمة.**
 *
 * ── فالبوّابةُ تفرض الإعلان لا التحويل ───────────────────────────────────
 *
 * **كلُّ حارسٍ يقرأ ملفَّ `.ts` ويُطابق عليه** إمّا:
 *   · يستورد **`stripCommentsAndStrings`** — فهو يبحث عن **نمطٍ برمجيّ**؛
 *   · أو يستدعي **`readsDeclaredStrings()`** — فهو يقرأ **بياناتٍ معلَنة**،
 *     والنصُّ هو بياناتُه.
 *
 * **فيصير الاختيارُ واعياً لا عارضاً** — وهو ما يمنع الحادي والثلاثين، **بدل
 * أن يفرض تحويلاً يكسر**.
 *
 * ⚠️ **وحدُّها معلَن**: تفرض **الإعلان** لا صحّتَه — فحارسٌ أعلن «نصّاً» وهو
 * يبحث عن كودٍ يمرّ. **تمنع الغفلة لا الخطأ المتعمَّد** (كنظيرتها `ق-٣٧٠`).
 */
const SRC = join(__dirname, '..');

/** يقرأ ملفَّ شيفرةٍ ويُطابق عليه — فيلزمه إعلان. */
export function scansTypeScript(source: string): boolean {
  const code = stripCommentsAndStrings(source);
  if (!/\breadFileSync\s*\(/.test(code)) return false;
  // ويُطابق فعلاً — فقراءةٌ بلا مطابقة (مقارنةُ تطابقٍ حرفيّ) ليست مسحاً.
  if (!/\.(?:test|match|matchAll|exec)\s*\(|\bmatchAll\b/.test(code)) return false;
  // وعلى ملفات `.ts` — لا على بياناتٍ أو وثائق.
  return /sourceFiles\s*\(|\.tsx?\b/.test(source);
}

/**
 * ⚠️ **والأصنافُ ثلاثةٌ لا اثنان** — كشفه تشغيلُ البوّابة على الشجرة:
 * `count-numbering` يستورد **`stripComments`** (تعليقاتٌ وحدها) **عمداً**،
 * **لأن كاشفَه يحتاج قوالبَ النصّ سليمة** (`\`C-${seq}\``). **فهو إعلانٌ واعٍ
 * كغيره** — والمقصودُ **اختيارٌ من المصدر الواحد**، لا مُجرِّدٌ بعينه.
 */
export function declaresItsKind(source: string): boolean {
  const code = stripCommentsAndStrings(source);
  return /\bstripComments(?:AndStrings)?\b/.test(code) || /\breadsDeclaredStrings\s*\(/.test(code);
}

describe('كلُّ حارسٍ يمسح الشيفرة يُعلن صنفَه — حارسٌ مشتقّ', () => {
  it('المُكتشِفان مُثبَتان بحالتَين: يمسكان الماسح ويتركان ما ليس منه', () => {
    // ⚠️ **الصياغةُ الواقعية** — منقولةٌ عن حارسٍ قائم.
    const scanner = ['const files = sourceFiles(SRC);', 'const bad = files.filter((f) => /new PrismaClient\\(/.test(readFileSync(f, "utf8")));'].join('\n');
    expect(scansTypeScript(scanner)).toBe(true);

    // 🔴 **وما ليس ماسحاً يُترك**: قراءةُ `JSON` أو مقارنةُ تطابقٍ حرفيّ.
    expect(scansTypeScript('const pkg = JSON.parse(readFileSync(p, "utf8"));')).toBe(false);
    expect(scansTypeScript('expect(readFileSync(p, "utf8")).toContain("assertDbAtLatestMigration()");')).toBe(false);
    // وحارسٌ لا يقرأ ملفّاً أصلاً ليس من السطح.
    expect(scansTypeScript('expect(1 + 1).toBe(2);')).toBe(false);

    // والإعلانُ يُقرأ بالاستيراد أو بالنداء — لا بالتعليق.
    expect(declaresItsKind('import { stripCommentsAndStrings } from "./source-scan.util";')).toBe(true);
    // والصنفُ الثالث: تعليقاتٌ تُجرَّد والنصوصُ تبقى بياناتٍ — إعلانٌ واعٍ كغيره.
    expect(declaresItsKind('import { stripComments } from "./source-scan.util";')).toBe(true);
    expect(declaresItsKind('readsDeclaredStrings();')).toBe(true);
    expect(declaresItsKind('// يقرأ نصوصاً معلَنة\nconst x = 1;')).toBe(false);
  });

  it('السطح غير فارغ — الحرّاسُ تُقرأ فعلاً', () => {
    const scanners = specFiles().filter((f) => scansTypeScript(readFileSync(f, 'utf8')));
    expect(scanners.length).toBeGreaterThan(10);
  });

  it('🔴 كلُّ ماسحٍ يُعلن: يُجرّد أو يُصرّح أنه يقرأ نصّاً', () => {
    const silent = specFiles()
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return scansTypeScript(src) && !declaresItsKind(src);
      })
      .map((f) => relative(SRC, f).split('\\').join('/'));
    expect(silent).toEqual([]);
  });
});

/** ملفاتُ الاختبار — و`sourceFiles` تستثنيها، فتُجمع هنا صراحةً. */
function specFiles(): string[] {
  const all: string[] = [];
  const walk = (dir: string) => {
    for (const f of sourceFiles(dir)) all.push(f);
  };
  walk(SRC);
  // `sourceFiles` تُسقط `.spec.ts` — فتُقرأ الشجرةُ ثانيةً بمرشّحٍ معاكس.
  const specs: string[] = [];
  const { readdirSync, statSync } = require('fs') as typeof import('fs');
  const scan = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules' || name === 'dist') continue;
      if (statSync(full).isDirectory()) scan(full);
      else if (/\.spec\.ts$/.test(name)) specs.push(full);
    }
  };
  scan(SRC);
  return specs;
}
