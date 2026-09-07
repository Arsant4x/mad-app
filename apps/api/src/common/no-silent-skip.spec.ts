import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * `ق-٢٦٨` — **اختبارٌ لا يستطيع التأكيد يُعلن تخطّيه صراحةً، ولا ينسحب بصمت.**
 *
 * الواقعة (2026-09-07): `if (!companyDefault) return;` في مجسّ الدرج — **اختبارٌ
 * يمرّ بلا أن يحكم**. وحكمُ المالك: **«أخطرُ من اختبارٍ يسقط — فالساقطُ يُرى،
 * والمنسحبُ يُعدّ نجاحاً»**؛ والحزمةُ الخضراء تشهد لتغطيةٍ لم تقع.
 *
 * مشتقٌّ لا قائمة: يقرأ **كل ملفات الاختبار** في الخادم والواجهة، ويستخرج أجسام
 * `it`/`test` بموازنة الأقواس، ويُدين **`return` في جسم الاختبار نفسه**.
 *
 * حدُّه المعلَن — بحدَّين مقصودَين:
 *   ① **العمقُ الأول وحده**: `return` داخل دالةٍ متداخلة أو حلقةٍ بقوسَين لا يُدان
 *      (وهي مواضعُ `continue` المشروعة، وقد قِيست: `locale-gate` · `migration-rls-read`).
 *      فما يُدان هو الانسحابُ من الاختبار نفسه.
 *   ② **والتصريحُ يُعفي**: سطرٌ يحمل `تخطٍّ معلَن:` أو `explicit-skip:` يمرّ — فالقاعدة
 *      «يُعلَن التخطّي» لا «يُمنع التخطّي».
 */
const TEST_ROOTS = [
  join(__dirname, '..'),
  join(__dirname, '..', '..', 'test'),
  join(__dirname, '..', '..', '..', 'web', 'src'),
];
const IS_TEST_FILE = /\.(?:spec|e2e-spec|test)\.(?:ts|tsx)$/;
const SKIP_DECLARED = /تخطٍّ معلَن:|explicit-skip:/;

export interface SilentSkip {
  file: string;
  line: number;
}

/** أجسامُ `it`/`test` — من قوس الجسم إلى مقابله، بموازنةٍ لا بنمط. */
export function testBodies(source: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  // ⚠️ `(?<![.\w])` لا `\b` وحدها: **`\btest\(` تطابق `.test(`** — و`RegExp.test`
  //    مستعملةٌ في كل حارسٍ نصّيّ عندنا، فأولُ صياغةٍ أدانت اثنتين وعشرين موضعاً
  //    كلُّها دوالُّ وحدات لا أجسامَ اختبارات. (الحدُّ يُقاس بالإيجابيات الكاذبة.)
  for (const m of source.matchAll(/(?<![.\w])(?:it|test)(?:\.each\([^)]*\))?\s*\(/g)) {
    // أولُ `{` بعد رأس النداء هو بدايةُ الجسم (سواءٌ `async () => {` أو `function () {`).
    const brace = source.indexOf('{', m.index ?? 0);
    if (brace < 0) continue;
    let depth = 0;
    let i = brace;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ start: brace, end: i });
  }
  return out;
}

/**
 * يُفرَّغ ما ليس شيفرةً تنفَّذ — **مع حفظ المواضع** كي يصدق رقمُ السطر:
 * التعليقاتُ والسلاسل (مفردةً ومزدوجةً وقالبيّة).
 *
 * ⚠️ **لازمٌ لا تجميل**: حرّاسُنا النصّية تحمل شيفرةً **داخل سلاسل** («`return
 * (await tx.invoice.count()) + 1;`»)، وتعليقاتُنا تقتبس العطلَ الذي أُصلح. فبلا
 * هذا التفريغ أدان القارئُ ثمانيةَ مواضع **كلُّها نصٌّ لا تنفيذ**.
 */
export function blankNonCode(src: string): string {
  const keep = (s: string) => s.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, keep)
    .replace(/\/\/[^\n]*/g, keep)
    .replace(/`(?:\\.|[^`\\])*`/g, keep)
    .replace(/'(?:\\.|[^'\\\n])*'/g, keep)
    .replace(/"(?:\\.|[^"\\\n])*"/g, keep);
}

export function silentSkips(source: string, file = '<inline>'): SilentSkip[] {
  const code = blankNonCode(source)
    .split(/\r?\n/)
    .map((l, i) => (SKIP_DECLARED.test(source.split(/\r?\n/)[i] ?? '') ? '' : l)) // السطرُ المصرَّح يُحيَّد
    .join('\n');
  const lineOf = (index: number) => code.slice(0, index).split('\n').length;
  const out: SilentSkip[] = [];

  for (const body of testBodies(code)) {
    let depth = 0;
    for (let i = body.start; i <= body.end; i += 1) {
      const ch = code[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (depth === 1 && code.startsWith('return', i) && /[\s;]/.test(code[i + 6] ?? '')) {
        const before = code[i - 1] ?? ' ';
        if (/[A-Za-z0-9_$.]/.test(before)) continue; // جزءٌ من كلمةٍ أطول
        // ⚠️ **`return` عاريةً وحدها انسحاب**؛ و`return waitFor(…)` **إعادةُ وعدٍ
        //    ينتظره المُشغِّل** — اصطلاحٌ قائم، فإدانتُه إيجابيّةٌ كاذبة تُعطِّل
        //    الحارس (قِيست: موضعٌ واحدٌ حقيقيّ في الواجهة).
        const after = code.slice(i + 6).match(/^\s*/)?.[0].length ?? 0;
        const next = code[i + 6 + after] ?? '';
        if (next !== ';' && next !== '}') continue;
        out.push({ file, line: lineOf(i) });
      }
    }
  }
  return out;
}

function testFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) testFiles(full, out);
    else if (IS_TEST_FILE.test(name)) out.push(full);
  }
  return out;
}

describe('لا تخطٍّ صامت: `return` في جسم اختبارٍ يُعلَن أو يسقط (ق-٢٦٨)', () => {
  it('القارئ مُثبَت بستّ حالاتٍ معروفة النتيجة — والأربعُ الأخيرة من إيجابياتٍ كاذبة وقعت فعلاً', () => {
    // ① انسحابٌ من جسم الاختبار — يُدان.
    expect(silentSkips("it('x', async () => { const a = await f(); if (!a) return; expect(a).toBe(1); });")).toHaveLength(1);
    // ② و`return` داخل دالةٍ متداخلة أو حلقةٍ — لا يُدان (وهي مواضعُ `continue`).
    expect(silentSkips("it('x', () => { rows.forEach((r) => { if (!r) return; use(r); }); expect(1).toBe(1); });")).toEqual([]);
    // ③ والتصريحُ يُعفي — فالقاعدة «يُعلَن» لا «يُمنع».
    expect(silentSkips("it('x', async () => { if (!a) return; // تخطٍّ معلَن: لا قاعدة\n expect(1).toBe(1); });")).toEqual([]);
    // ④ وكلمةٌ تحوي `return` لا تُدان.
    expect(silentSkips("it('x', () => { const returnValue = 1; expect(returnValue).toBe(1); });")).toEqual([]);
    // ⑤ و`return waitFor(…)` إعادةُ وعدٍ ينتظره المُشغِّل — اصطلاحٌ لا انسحاب.
    expect(silentSkips("it('x', () => { render(<C />); return waitFor(() => expect(1).toBe(1)); });")).toEqual([]);
    // ⑥ و`return` داخل سلسلةٍ أو تعليقٍ نصٌّ لا تنفيذ (حرّاسُنا النصّية مليئةٌ به).
    expect(silentSkips("it('x', () => { expect(f('return (await tx.x.count()) + 1;')).toEqual([]); });")).toEqual([]);
    expect(silentSkips("it('x', () => { // كان: if (!a) return;\n expect(1).toBe(1); });")).toEqual([]);
  });

  it('السطح غير فارغ — ملفاتُ الاختبار تُقرأ فعلاً في الخادم والواجهة', () => {
    const files = TEST_ROOTS.flatMap((r) => testFiles(r));
    expect(files.length).toBeGreaterThan(80);
    expect(files.some((f) => f.endsWith('.test.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('.e2e-spec.ts'))).toBe(true);
  });

  it('🔴 لا اختبارَ ينسحب بصمتٍ في أيّ ملف', () => {
    const offences = TEST_ROOTS.flatMap((root) =>
      testFiles(root).flatMap((f) => silentSkips(readFileSync(f, 'utf8'), relative(join(__dirname, '..', '..', '..', '..'), f).split('\\').join('/'))),
    );
    expect(offences.map((o) => `${o.file}:${o.line}`)).toEqual([]);
  });
});
