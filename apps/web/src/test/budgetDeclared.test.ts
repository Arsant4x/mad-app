import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.1 ث — ثلاثةُ أضعافه
//    دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه). ⚠️ وكُتب أوّلَ مرّةٍ «أقلُّ من ثانية» **تخميناً** فقِيس وحدَه
//    ثلاثَ ثوانٍ — ثم نُقل التحليلُ إلى الجمع فصار ما يُقاس هنا الأحكامَ وحدَها. معلنةٌ كسائر الملفّات لا مستثناة.
vi.setConfig({ testTimeout: 5_000 });

/**
 * **كلُّ ملفِّ اختبارٍ في الواجهة يُعلن ميزانيتَه — ولا يُرفع السقفُ العامّ** (`ق-١٣٣٢` · التوجيه ٢٥٨).
 *
 * ## الواقعة — مقيسةٌ لا موصوفة
 *
 * سقطت الحزمةُ بـ`Test timed out in 5000ms` في ملفٍّ **يتبدّل بين التشغيلين** (`NetworkSettlementsPanel`
 * ثم `ErrorBoundary`)، ويمرّ كلٌّ وحدَه في ثانية. ثم قِيست الحزمةُ كاملةً ثلاثَ مرّات: **ثمانيةُ ملفّاتٍ فيها
 * اختبارٌ يتجاوز خمسَ ثوانٍ تحت الحِمل** (أبطؤها `13.2 ث` بلا مدقّق أنواع، و`29 ث` بمدقّقٍ على الواجهة كلِّها)
 * — **وما نجا منها نجا برقمٍ مكتوبٍ بيدٍ على اختبارٍ بعينه** (`15000` · `20000` · `90_000`)، وما لم يُكتب له سقط.
 *
 * ## والقاعدة (بنصّ المالك)
 *
 * «**قِس زمنَ كلِّ ملفٍّ تحت حِمل الحزمة كاملةً · والميزانيةُ ثلاثةُ أضعاف المقيس معلنةً في الملفّ · وحارسٌ يمنع
 * ملفّاً بلا ميزانية. ⛔ ولا يُرفع السقفُ العامّ، فرفعُه يُخفي البطيءَ ولا يسمّيه.**»
 *
 * ⇒ **ثلاثةُ أحكام**: ① كلُّ ملفٍّ يُعلن `vi.setConfig({ testTimeout: N })` **في رأسه** (لا داخلَ `describe` —
 * فهناك يُقرأ بعد أن يُجمَع ما قبله)، و`N` لا تنزل عن الافتراضيّ (`5000`: إعلانٌ دونه **يضيّق ولا يسمّي**) ·
 * ② **ولا مهلةَ على اختبارٍ بعينه** — المهلةُ في موضعٍ واحد يُقرأ ويُحرَس؛ ومن احتاج اختبارُه أكثرَ **رفع ميزانيةَ
 * ملفّه فرآها من يقرأ** · ③ **ولا سقفَ عامّاً في الإعداد ولا في سطر الأمر**.
 *
 * ⚠️ **وحدُّه معلَن**: الميزانيةُ المشتقّةُ على **الاختبارات**؛ والخطّافاتُ على افتراضيّها (`10 ث`) — ولم يسقط منها
 * خطّافٌ واحد في التشغيلات الثلاثة. **لكن لا رقمَ على خطّافٍ بعينه كذلك** (②)؛ ومن احتاج أكثر أعلن `hookTimeout`
 * في رأس ملفّه — فيبقى الموضعُ واحداً.
 */

const SRC = join(__dirname, '..');
const WEB = join(SRC, '..');
/** الافتراضيُّ نفسُه — إعلانٌ دونه يضيّق ولا يسمّي. */
export const FLOOR_MS = 5000;
const TEST_FILE = /\.test\.tsx?$/;

export function webTestFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...webTestFiles(full));
    else if (TEST_FILE.test(entry)) out.push(full);
  }
  return out.sort();
}

const numberOf = (node: ts.Node): number | null => (ts.isNumericLiteral(node) ? Number(node.text.replace(/_/g, '')) : null);

/** `vi.setConfig({ testTimeout: N })` — تُعاد `N` أو `null` إن لم يكن هذا النداءَ بعينه. */
function setConfigBudget(node: ts.Node): number | null | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== 'vi' || callee.name.text !== 'setConfig') return undefined;
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
  for (const p of arg.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'testTimeout') return numberOf(p.initializer);
  }
  return null;
}

const TEST_CALLEES = new Set(['it', 'test']);
/**
 * والخطّافاتُ كذلك: رقمٌ على `beforeEach` موضعٌ ثانٍ كرقمٍ على `it`. ⚠️ **أمسكه الإثباتُ العكسيّ لا القراءة**:
 * أوّلُ كسرٍ حُقن ليعيد `}, 15000);` وقع على `beforeEach` لا على `it` فمرّ الحارسُ أخضر — فكان الكسرُ في غير
 * موضعه **وكان في الحارس ثقبٌ حقيقيّ معاً**. ومن احتاج خطّافُه أكثرَ من افتراضيّه أعلن `hookTimeout` في رأس ملفّه.
 */
const HOOK_CALLEES = new Set(['beforeEach', 'afterEach', 'beforeAll', 'afterAll']);

/** اسمُ مُستدعي الاختبار — `it` · `test` · `it.only` · `it.skip` · `it.concurrent` … */
function isTestCall(node: ts.CallExpression): boolean {
  const e = node.expression;
  if (ts.isIdentifier(e)) return TEST_CALLEES.has(e.text);
  return ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && TEST_CALLEES.has(e.expression.text);
}

export interface BudgetReading {
  /** الميزانيةُ المعلَنة في رأس الملفّ — `null` إن غابت. */
  budget: number | null;
  /** `vi.setConfig` في غير رأس الملفّ (داخلَ `describe` أو دالّة) — بأسطرها. */
  misplaced: number[];
  /** مهلةٌ على اختبارٍ بعينه (وسيطٌ ثالثٌ رقميّ أو `{ timeout }`) — بأسطرها. */
  perTest: number[];
}

/** يقرأ الملفَّ **بالمحلّل لا بالنصّ** — فإعلانٌ في تعليقٍ أو سلسلةٍ لا يُعدّ (`§8.24`). */
export function readBudget(fileName: string, text: string): BudgetReading {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, kind);
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  let budget: number | null = null;
  const topLevel = new Set<ts.Node>();
  for (const st of sf.statements) {
    if (!ts.isExpressionStatement(st)) continue;
    const b = setConfigBudget(st.expression);
    if (b !== undefined) {
      topLevel.add(st.expression);
      budget = b;
    }
  }
  const misplaced: number[] = [];
  const perTest: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (setConfigBudget(node) !== undefined && !topLevel.has(node)) misplaced.push(line(node));
      if (isTestCall(node)) {
        const [, second, third] = node.arguments;
        const hasTimeoutOption = (a?: ts.Expression) => !!a && ts.isObjectLiteralExpression(a) && a.properties.some((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'timeout');
        if ((third && !ts.isObjectLiteralExpression(third)) || hasTimeoutOption(second) || hasTimeoutOption(third)) perTest.push(line(node));
      }
      // الخطّافُ: `beforeEach(fn, timeout?)` — أيُّ وسيطٍ ثانٍ مهلةٌ على خطّافٍ بعينه.
      if (ts.isIdentifier(node.expression) && HOOK_CALLEES.has(node.expression.text) && node.arguments.length >= 2) perTest.push(line(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { budget, misplaced, perTest };
}

/** مفاتيحُ السقف العامّ في إعداد vitest — تُقرأ بالمحلّل أيضاً. */
export function globalTimeoutKeys(configText: string): string[] {
  const sf = ts.createSourceFile('vitest.config.ts', configText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && (node.name.text === 'testTimeout' || node.name.text === 'hookTimeout')) found.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('كلُّ ملفِّ اختبارٍ في الواجهة يُعلن ميزانيتَه — ولا يُرفع السقفُ العامّ (ق-١٣٣٢)', () => {
  const files = webTestFiles();
  const rel = (f: string) => relative(WEB, f).replace(/\\/g, '/');
  // يُحلَّل كلُّ ملفٍّ مرّةً واحدة — وكان كلُّ حكمٍ يعيد التحليلَ فتضاعف الزمن (ثلاثُ ثوانٍ وحدَه).
  const readings = files.map((f) => ({ file: rel(f), reading: readBudget(f, readFileSync(f, 'utf8')) }));

  it('السطحُ غيرُ فارغ — وإلا فالحارسُ يفحص العدم', () => {
    // اثنان وثلاثون ملفّاً يومَ بُني (والحارسُ نفسُه ثالثٌ وثلاثون) — والعدُّ الأدنى دونه بهامش.
    expect(files.length).toBeGreaterThanOrEqual(30);
    expect(files.some((f) => rel(f) === 'src/test/budgetDeclared.test.ts')).toBe(true);
  });

  it('⭐ كلُّ ملفٍّ يُعلن ميزانيتَه في رأسه، ولا تنزل عن الافتراضيّ', () => {
    const missing: string[] = [];
    const tooSmall: string[] = [];
    const misplaced: string[] = [];
    for (const { file, reading } of readings) {
      if (reading.budget === null) missing.push(file);
      else if (reading.budget < FLOOR_MS) tooSmall.push(`${file} (${reading.budget})`);
      if (reading.misplaced.length) misplaced.push(`${file}:${reading.misplaced.join(',')}`);
    }
    expect(missing).toEqual([]);
    expect(tooSmall).toEqual([]);
    expect(misplaced).toEqual([]);
  });

  it('⭐ ولا مهلةَ على اختبارٍ بعينه — المهلةُ في موضعٍ واحد يُقرأ ويُحرَس', () => {
    const offenders = readings.flatMap(({ file, reading }) => reading.perTest.map((l) => `${file}:${l}`));
    expect(offenders).toEqual([]);
  });

  it('⛔ ولا سقفَ عامّاً — لا في إعداد vitest ولا في سطر الأمر', () => {
    expect(globalTimeoutKeys(readFileSync(join(WEB, 'vitest.config.ts'), 'utf8'))).toEqual([]);
    const scripts = (JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {};
    const raised = Object.entries(scripts).filter(([, cmd]) => /--(test|hook)Timeout/.test(cmd)).map(([k]) => k);
    expect(raised).toEqual([]);
  });

  it('المُكتشِفُ مُثبَتٌ بحالاتٍ معلومة — يقرأ المعلَنَ ويردّ ما في تعليقٍ أو سلسلةٍ أو داخلَ describe', () => {
    // العيّناتُ تُبنى بدالّةٍ لا حرفياً (§8.7): حارسٌ قرأ عيّنته من حرفيات ملفّه أمسك نفسه.
    const src = (...lines: string[]) => lines.join('\n');
    const call = (n: string) => `vi.setConfig({ testTimeout: ${n} });`;

    expect(readBudget('a.test.ts', src("import { vi } from 'vitest';", call('30_000'))).budget).toBe(30000);
    expect(readBudget('b.test.ts', src(`// ${call('30000')}`, "describe('x', () => {});")).budget).toBeNull();
    expect(readBudget('c.test.ts', src(`const s = '${call('30000')}';`)).budget).toBeNull();

    const inside = readBudget('d.test.ts', src("describe('x', () => {", `  ${call('30000')}`, '});'));
    expect(inside.budget).toBeNull();
    expect(inside.misplaced).toEqual([2]);

    const perTest = readBudget('e.test.ts', src(call('9000'), "it('t', () => {}, 15000);", "test('u', () => {}, { timeout: 1 });", "it('ok', () => {});", 'beforeEach(() => {}, 15000);', 'afterAll(() => {});'));
    expect(perTest.perTest).toEqual([2, 3, 5]);

    expect(globalTimeoutKeys(src('export default { test: { testTimeout: 60000 } };'))).toEqual(['testTimeout']);
    expect(globalTimeoutKeys(src('export default { test: { environment: "jsdom" } };'))).toEqual([]);
  });
});
