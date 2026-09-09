import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripCommentsAndStrings } from './source-scan.util';

/**
 * **كلُّ كاشفٍ يُثبَت بحالتَين على نصٍّ مصنوع** (`ق-٣٧٠` · `ق-٣٨٨`).
 *
 * ── ما تفرضه ─────────────────────────────────────────────────────────────
 *
 * حارسٌ يُصدّر كاشفاً (`fooOffences(source)` أو نظيرَه) يجب أن يستدعيه في
 * توكيدٍ **على نصٍّ مكتوبٍ في الاختبار نفسه** — مرّةً يُتوقَّع فيها التقاطٌ،
 * ومرّةً يُتوقَّع فيها ترك.
 *
 * ⚠️ **ولا يكفي `expect(offences).toEqual([])` على الشجرة**: **ذلك يقيس حالةَ
 * المستودع اليوم، لا الكاشفَ** — **فيخضرّ يوم تفرغ الشجرة من المخالفات، وهو
 * عمىً لا سلامة** (`ق-٣٨٨`).
 *
 * ── الحالتان وما تُثبته كلٌّ منهما ───────────────────────────────────────
 *
 * **السالبةُ تُثبت أن المجسّ يرى ما يبحث عنه** · **والموجبةُ تُثبت أنه لا يرى
 * ما ليس فيه**. **والثانية هي التي تُترك دائماً** — «لأن من يرى مجسَّه أحمر
 * على العطل يظنّ أنه انتهى». **وثلاثةُ مجسّاتٍ سقطت في يومٍ واحد، وكلُّها
 * أُمسكت بالموجبة**.
 *
 * ── ⚠️ وحدُّها معلَن ─────────────────────────────────────────────────────
 *
 * **تفرض الحضورَ لا المعنى**: حالةٌ موجبةٌ تافهة تمرّ. **تمنع الغفلة لا الخطأ
 * المتعمَّد** — ومن أضاف حالةً ليُرضي الحارسَ أفسد الغرض. **والمعنى شرطُ
 * المالك على من يُصلح، لا دعوى هذا الحارس.**
 */
const SRC = join(__dirname, '..');

/**
 * **الكاشفُ الذي يُنتج الحكم وحده** (`ق-٣٨٩`) — لا كلُّ مُصدَّرٍ يقبل نصّاً.
 *
 * ⚠️ **المعيارُ الأوسع سُحب**: «كلُّ `export` يقبل `string`» **شكلٌ لا غرض** —
 * فيطالب **المستخرِجات** (`testBodies` · `citedEngineIds`) **والأسماءَ
 * المستعارة** (`blankNonCode = stripCommentsAndStrings`) بحالتين. **ومطالبةُ
 * الأخيرة إثباتُ المُجرِّد أربع مرات — وهو ما وُحِّد في `ق-٣٨٢`.**
 *
 * **فالمناطُ: ما يُستدعى في التوكيد الذي يُسقط الحزمة** — أي **الاسمُ الذي
 * يظهر داخل `expect(...)` مع حكمٍ نهائيّ**.
 *
 * ⚠️ **والنصوصُ تُجرَّد قبل القراءة**: أوّلُ صياغةٍ استعملت `stripComments`
 * فقرأت **أمثلةَ هذا الملفّ المكتوبة في سلاسل** كأنها تصديراتٌ حقيقية —
 * **فأدانت البوّابةُ نفسها**، وهي `ق-٢٩٠` في أنقى صورها.
 */
export function verdictDetectors(source: string): string[] {
  const code = stripCommentsAndStrings(source);
  const exported = new Set<string>();
  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(\s*\w+\s*:\s*string/g)) exported.add(m[1]);
  for (const m of code.matchAll(/export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*\(\s*\w+\s*:\s*string/g)) exported.add(m[1]);

  // ⚠️ **إحالةٌ محضة ليست كاشفاً**: `export const x = y;` بلا وسيطٍ ولا جسم.
  for (const m of code.matchAll(/export\s+const\s+(\w+)\s*=\s*\w+\s*;/g)) exported.delete(m[1]);

  // والحكمُ: ما يظهر داخل `expect(` في هذا الملفّ.
  const inVerdict = new Set<string>();
  for (const m of code.matchAll(/expect\s*\(([\s\S]{0,200}?)\)\s*\./g)) {
    for (const name of exported) if (new RegExp(`\\b${name}\\s*\\(`).test(m[1])) inVerdict.add(name);
  }
  return [...inVerdict];
}

/**
 * هل استُدعي الكاشفُ على **نصٍّ مصنوعٍ في الاختبار**؟
 *
 * **العلامةُ أن وسيطَه الأول ليس متغيّرَ ملفٍّ مقروء**: سلسلةٌ حرفية، أو قالب،
 * أو مصفوفةٌ تُجمَع (`[...].join('\n')`)، أو متغيّرٌ أُسند إليه أحدُ هذه.
 */
export function calledOnFixture(source: string, detector: string): boolean {
  const lines = source.split(/\r?\n/);
  // أسماءُ المتغيّرات التي تحمل نصّاً مصنوعاً في هذا الملف.
  const fixtures = new Set<string>();
  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:\[[\s\S]*?\]\.join\(|['"`])/g)) fixtures.add(m[1]);

  const call = new RegExp(`\\b${detector}\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!call.test(line)) continue;
    const after = line.slice(line.search(call) + detector.length + 1).trimStart();
    // نصٌّ حرفيّ مباشرةً، أو متغيّرُ نصٍّ مصنوع.
    if (/^['"`]/.test(after) || /^\[/.test(after)) return true;
    const name = after.match(/^(\w+)/)?.[1];
    if (name && fixtures.has(name)) return true;
  }
  return false;
}

/** ملفاتُ الاختبار تحت `src` — و`sourceFiles` تستثنيها، فتُجمع هنا. */
function specFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) specFiles(full, out);
    else if (/\.spec\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('كلُّ كاشفٍ مُثبَتٌ على نصٍّ مصنوع — لا على الشجرة', () => {
  it('المُكتشِفان مُثبَتان بحالتَين: يمسكان ما يجب ويتركان ما ليس منه', () => {
    // ⚠️ **الصياغةُ الواقعية** — منقولةٌ عن `count-numbering`: مُصدَّرٌ **ويظهر
    //    في `expect`** ⇒ كاشفُ حكم.
    const real = ['export function countNumberingOffences(src: string) { return []; }', 'expect(countNumberingOffences(x)).toEqual([]);'].join('\n');
    expect(verdictDetectors(real)).toEqual(['countNumberingOffences']);

    // 🔴 **وما ليس حاكماً يُترك — وهي الحالاتُ الثلاث التي أسقطت المعيارَ الأوسع**:
    // ① **مستخرِجٌ** لا يظهر في حكم.
    const extractor = ['export function testBodies(src: string) { return []; }', 'const bodies = testBodies(source);'].join('\n');
    expect(verdictDetectors(extractor)).toEqual([]);
    // ② **وإحالةٌ محضة** — `blankNonCode` بعد توحيده في `ق-٣٨٢`.
    const alias = ['export const blankNonCode = stripCommentsAndStrings;', 'expect(blankNonCode(x)).toBe(y);'].join('\n');
    expect(verdictDetectors(alias)).toEqual([]);
    // ③ **ودالّةٌ بلا وسيطِ نصّ، أو غيرُ مُصدَّرة**.
    expect(verdictDetectors('export function walk(dir: number) {}\nexpect(walk(1)).toEqual([]);')).toEqual([]);
    expect(verdictDetectors('function localOffences(src: string) {}\nexpect(localOffences(x)).toEqual([]);')).toEqual([]);

    // 🔴 **والاستدعاءُ على نصٍّ مصنوع يُقبل**: حرفيٌّ · قالبٌ · مصفوفةٌ تُجمَع.
    expect(calledOnFixture("expect(fooOffences('const a = 1;')).toEqual([]);", 'fooOffences')).toBe(true);
    const joined = ['const src = ["a", "b"].join("\\n");', 'expect(fooOffences(src)).toHaveLength(1);'].join('\n');
    expect(calledOnFixture(joined, 'fooOffences')).toBe(true);
    // 🔴 **والاستدعاءُ على الشجرة يُرفض** — وهو مناطُ الحارس كلِّه.
    expect(calledOnFixture('files.flatMap((f) => fooOffences(readFileSync(f, "utf8")))', 'fooOffences')).toBe(false);
    expect(calledOnFixture('const src = readFileSync(p, "utf8");\nfooOffences(src);', 'fooOffences')).toBe(false);
  });

  it('السطح غير فارغ — وكم كاشفَ حكمٍ في الشجرة', () => {
    // ⚠️ **صفرُ مخالفاتٍ لا يُصدَّق حتى يُعرف سطحُه** (`ق-٣٦١`): «صفرٌ من مجسٍّ
    //    أعمى أسوأ من لا رقم». **فيُعلَن العددُ الذي فُحص، لا النتيجةُ وحدها.**
    const all = specFiles(SRC).flatMap((f) => verdictDetectors(readFileSync(f, 'utf8')));
    expect(all.length).toBeGreaterThan(8);
  });

  it('🔴 كلُّ كاشفٍ مُصدَّرٍ يُستدعى على نصٍّ مصنوعٍ مرّةً على الأقلّ', () => {
    const silent: string[] = [];
    for (const f of specFiles(SRC)) {
      const src = readFileSync(f, 'utf8');
      for (const d of verdictDetectors(src)) {
        if (!calledOnFixture(src, d)) silent.push(`${relative(SRC, f).split('\\').join('/')} ⟵ ${d}`);
      }
    }
    expect(silent).toEqual([]);
  });
});
