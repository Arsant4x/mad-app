import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { sourceFiles } from './source-scan.util';

/**
 * **يومٌ يُقاس بمنطقة العملية يُصلَح أو يُعلَن** (`ق-١١٩٠`).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * عمودُ `@db.Date` يُقرأ **UTC حصراً** (`document-year.util.ts` · `ق-١٨٥`)، **ويومُ الآن كان
 * يُشتقّ في أربعةَ عشرَ موضعاً من منطقة العملية** (`setHours(0,0,0,0)` · `new Date(y, m, d)` ·
 * `getFullYear()` …): فعلى خادمٍ بتوقيت الرياض تصير الفاتورةُ «متأخّرة» عند `21:00 UTC`، وعلى
 * خادمٍ غربَ غرينتش بعد منتصف الليل بساعات — **والحكمُ يقرؤه التاجر ويبني عليه** (بنصّ المالك:
 * «ثلاثُ ساعاتٍ تنقل فاتورةً من «مستحقّة» إلى «متأخّرة» كذباً»). وهي عائلةُ «يومُ الرياض ويومُ
 * `UTC`» التي أسقطت `rejected-replacement ④` ثم `unit-of-measure ③` في نافذة `21:00–24:00 UTC`.
 *
 * ── القاعدة ───────────────────────────────────────────────────────────────
 *
 * **يومُ الآن من `wall-clock.util` بإزاحةٍ معلَنة** (`dayStartOf` · `dayEndOf` · `localYearOf` —
 * وبلا إزاحةٍ يومُ `UTC` **حدّاً معلَناً لا مفترَضاً**)، **واليومُ المخزَّن بدوالّ `UTC`**
 * (`getUTCFullYear` …). **فلا تُستدعى دوالُّ اليوم المحلّية** على `Date` في الشيفرة إلا في
 * حالتين:
 *
 * **① حسابُ الأيام في الإطار نفسِه** — `d.setDate(d.getDate() + n)` ونحوُه (`setMonth`/`getMonth`
 * · `setFullYear`/`getFullYear`): القراءةُ والكتابةُ في إطارٍ واحد، فالناتجُ اللحظةُ نفسُها في كلّ
 * منطقةٍ بلا توقيتٍ صيفيّ (والمملكةُ بلا توقيتٍ صيفيّ) — **مستثنًى بشكله لا بقائمةِ مواضع**.
 *
 * **② ما أُعلن في موضعه**: تعليقٌ فوق التابع يحمل العلامةَ وسبباً — **لمن ليس رقماً يقرؤه التاجر**
 * (قسمةُ المالك: ما يُنتج رقماً يقرؤه التاجر يُصلَح، وما عداه يُعلَن بحجّته ولا يُصلَح).
 *
 * ── لماذا شجرةٌ لا نصّ ────────────────────────────────────────────────────
 *
 * القياسُ النصّي (`timing-surface.mjs` · `ق-١١٨٧`) **جرّد القوالبَ النصّية كاملةً** فعمي عن
 * `${d.getFullYear()}` داخلها — **وثلاثةُ أسطرٍ من هذا الشكل فاتته** (`monthLabel` · `dayLabel` · `todayIso`).
 * الشجرةُ ترى الاستدعاءَ حيث كان، ولا ترى ما في تعليقٍ أو سلسلة (`ق-٣٣١`).
 *
 * ⚠️ **و`test/` خارج نطاقه** (`sourceFiles` تستثني `.spec.ts`): مساعداتُ الاختبار التي تبني يومَ الآن من
 * منطقة العملية أسقطت ثلاثةَ ملفّاتٍ في `test:clean` داخل نافذة `21:00–24:00 UTC` يومَ بُني هذا الحارس —
 * وأُصلحت إلى اليوم المعلَن كما `ق-١٠٥٦`؛ **وحارسٌ على `test/` بابٌ يُفتح بأمر**.
 *
 * ── حدودُه المعلَنة ───────────────────────────────────────────────────────
 *
 * ⚠️ **يحرس الاسمَ لا النوع**: `x.getDate()` على غير `Date` يُدان — ولا مكتبةَ تواريخَ في الشيفرة
 * (مقيس)، فالاسمُ هنا يعني `Date`. ⚠️ **ولا يفرض صحّةَ الإعلان** — تمنع الغفلةَ لا الخطأ المتعمَّد
 * (كأخواتها `ق-٣٧٥` · `ق-٥١٧`). ⚠️ **و`toLocaleString` خارجه**: تُستعمل على الأرقام للتنسيق،
 * والحارسُ بلا مدقّقِ أنواعٍ لا يفرّق — فبقيت خارجَ القائمة بحدٍّ معلَن.
 */
const SRC = join(__dirname, '..');

/** دوالُّ اليوم المحلّية — ما يقرأ يوماً أو يكتبه بمنطقة العملية. */
export const LOCAL_DAY_METHODS = [
  'setHours',
  'setDate',
  'setMonth',
  'setFullYear',
  'getHours',
  'getDate',
  'getDay',
  'getMonth',
  'getFullYear',
  'toLocaleDateString',
  'toLocaleTimeString',
  // `new Date(d.toDateString())` صياغةٌ شائعة لمنتصف الليل المحلّي — وقعت في `payments.e2e-spec` (قِيس).
  'toDateString',
  'toTimeString',
] as const;

/** أزواجُ حساب الأيام المستثناة بشكلها: `setX(… getX() ± n …)`. */
const ARITHMETIC_PAIRS: Record<string, string> = { setDate: 'getDate', setMonth: 'getMonth', setFullYear: 'getFullYear' };

/** علامةُ الإعلان — تُكتب في تعليق التابع، ويليها السبب. */
export const LOCAL_DAY_DECLARATION = 'يومُ منطقة العملية بحقّه';

/** أقصرُ سببٍ يُقبل — حدٌّ ضدّ الفراغ لا حكمٌ على المعنى. */
export const MIN_REASON_LENGTH = 20;

export interface LocalDayCall {
  line: number;
  /** `d.setHours(…)` أو `new Date(y, m, …)`. */
  call: string;
  scope: string;
  /** مستثنًى بشكله — حسابُ أيامٍ في الإطار نفسِه. */
  arithmetic: boolean;
  /** السببُ المعلَن في تعليق التابع — `null` إن لم يُعلَن. */
  reason: string | null;
}

/** أقربُ تابعٍ حاوٍ يُحاسَب: تابعُ صنفٍ أو دالّةٌ مسمّاة أو متغيّرٌ في رأس الملف. */
function enclosingScope(node: ts.Node): ts.Node {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isConstructorDeclaration(p) || ts.isGetAccessorDeclaration(p)) return p;
    if (ts.isVariableStatement(p) && ts.isSourceFile(p.parent)) return p;
    if (ts.isSourceFile(p)) return p;
    p = p.parent;
  }
  return node.getSourceFile();
}

function scopeName(scope: ts.Node): string {
  if (ts.isMethodDeclaration(scope) || ts.isGetAccessorDeclaration(scope)) {
    const cls = scope.parent && ts.isClassDeclaration(scope.parent) ? scope.parent.name?.text ?? 'class' : 'class';
    return `${cls}.${scope.name.getText()}`;
  }
  if (ts.isConstructorDeclaration(scope)) return `${(scope.parent as ts.ClassDeclaration).name?.text ?? 'class'}.constructor`;
  if (ts.isFunctionDeclaration(scope)) return `function ${scope.name?.text ?? '(anonymous)'}`;
  if (ts.isVariableStatement(scope)) return `const ${scope.declarationList.declarations[0]?.name.getText() ?? '?'}`;
  return '<module>';
}

/** السببُ المعلَن في التعليق الملاصق فوق التابع — بعد العلامة حتى نهاية التعليق. */
function declaredReason(scope: ts.Node, text: string): string | null {
  const pos = ts.isSourceFile(scope) ? 0 : scope.getFullStart();
  const ranges = ts.getLeadingCommentRanges(text, pos) ?? [];
  const doc = ranges.map((r) => text.slice(r.pos, r.end)).join('\n');
  const at = doc.indexOf(LOCAL_DAY_DECLARATION);
  if (at === -1) return null;
  return doc
    .slice(at + LOCAL_DAY_DECLARATION.length)
    .replace(/\*\/[\s\S]*$/, '')
    .replace(/^\s*\*+\s?/gm, '')
    .replace(/^[\s*:：—-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** هل الوسيطُ تعبيرُ حساب أيامٍ يبدأ بالقارئ المقابل: `getX() ± n`. */
function arithmeticGetter(arg: ts.Expression, getter: string): ts.CallExpression | null {
  let e: ts.Expression = arg;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (!ts.isBinaryExpression(e)) return null;
  const op = e.operatorToken.kind;
  if (op !== ts.SyntaxKind.PlusToken && op !== ts.SyntaxKind.MinusToken) return null;
  const left = e.left;
  if (ts.isCallExpression(left) && ts.isPropertyAccessExpression(left.expression) && left.expression.name.text === getter && left.arguments.length === 0) {
    return left;
  }
  return null;
}

/** كلُّ استدعاءٍ لدالّةِ يومٍ محلّية في نصٍّ واحد — بحاله لا بحكمه. */
export function localDayCalls(source: string, file = 'inline.ts'): LocalDayCall[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: LocalDayCall[] = [];
  const exempt = new Set<ts.Node>();
  const cache = new Map<ts.Node, string | null>();
  const methods = new Set<string>(LOCAL_DAY_METHODS);

  const record = (n: ts.Node, call: string, arithmetic: boolean): void => {
    const scope = enclosingScope(n);
    if (!cache.has(scope)) cache.set(scope, declaredReason(scope, source));
    out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, call, scope: scopeName(scope), arithmetic, reason: cache.get(scope)! });
  };

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && methods.has(n.expression.name.text)) {
      const name = n.expression.name.text;
      const getter = ARITHMETIC_PAIRS[name];
      const inner = getter && n.arguments.length === 1 ? arithmeticGetter(n.arguments[0], getter) : null;
      if (inner) exempt.add(inner);
      record(n, `${n.expression.expression.getText(sf).slice(0, 24)}.${name}(…)`, !!inner || exempt.has(n));
    } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Date' && (n.arguments?.length ?? 0) >= 2) {
      record(n, `new Date(${n.arguments!.length} args)`, false);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** ما لا يُستثنى بشكله ولا يُعلَن بسببٍ كافٍ — **وهو الحكم**. */
export function undeclaredLocalDayCalls(source: string, file = 'inline.ts'): LocalDayCall[] {
  return localDayCalls(source, file).filter((c) => !c.arithmetic && (c.reason === null || c.reason.length < MIN_REASON_LENGTH));
}

function treeCalls(): (LocalDayCall & { file: string })[] {
  const out: (LocalDayCall & { file: string })[] = [];
  for (const f of sourceFiles(SRC)) {
    const file = relative(SRC, f).replace(/\\/g, '/');
    for (const c of localDayCalls(readFileSync(f, 'utf8'), f)) out.push({ ...c, file });
  }
  return out;
}

describe('يومٌ يُقاس بمنطقة العملية يُصلَح أو يُعلَن (ق-١١٩٠)', () => {
  const FILES = sourceFiles(SRC);
  const CALLS = treeCalls();

  it('يقرأ الشجرةَ فعلاً — ملفّاتٌ بالمئات، وحسابُ الأيام المستثنى موجودٌ فيها', () => {
    expect(FILES.length).toBeGreaterThan(200);
    // ثلاثةَ عشرَ موضعَ حسابٍ مقيسة (`ق-١١٨٧`) — فحارسٌ لا يرى واحداً منها لا يقرأ الشجرة.
    expect(CALLS.filter((c) => c.arithmetic).length).toBeGreaterThan(0);
  });

  it('🔴 لا استدعاءَ لدالّةِ يومٍ محلّيةٍ بلا استثناءِ شكلٍ ولا إعلان', () => {
    const bad = CALLS.filter((c) => !c.arithmetic && (c.reason === null || c.reason.length < MIN_REASON_LENGTH));
    if (bad.length > 0) {
      throw new Error(
        [
          `⛔ ${bad.length} استدعاءً لدالّةِ يومٍ محلّيةٍ بلا استثناءٍ ولا إعلان:`,
          ...bad.map((c) => `   ${c.file}:${c.line}  ${c.scope}  ${c.call}${c.reason !== null ? '  (سببٌ أقصرُ من الحدّ)' : ''}`),
          '',
          'يومُ الآن: `dayStartOf(now)` · `dayEndOf(now)` · `localYearOf(now)` من `common/wall-clock.util` —',
          '   بإزاحةٍ معلَنة، وبلا إزاحةٍ يومُ UTC حدّاً معلَناً (ق-١١٩٠).',
          'واليومُ المخزَّن (`@db.Date`): بدوالّ UTC — `getUTCFullYear()` · `Date.UTC(…)` · `toISOString().slice(0, 10)`.',
          `وما ليس رقماً يقرؤه التاجر يُعلَن في تعليق التابع: **${LOCAL_DAY_DECLARATION}**: <لماذا يكفي يومُ العملية هنا>.`,
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });

  it('والإعلانُ آليةٌ تعمل — الشجرةُ تحمل موضعاً معلَناً واحداً على الأقلّ يقرؤه الحارس', () => {
    // `resolveSubStart` (قسمةُ المالك ②: رفضٌ يقرؤه مديرُ المنصّة لا التاجر) — فإن زال الإعلانُ
    // من الشجرة كلِّها فالآليةُ لم تعد مُثبَتةً بحالةٍ حيّة.
    expect(CALLS.filter((c) => c.reason !== null && c.reason.length >= MIN_REASON_LENGTH).length).toBeGreaterThan(0);
  });

  describe('مصادقةُ المسبار بحالاتٍ معلومة (ق-٢٦٢)', () => {
    it('يُدين `setHours` و`new Date(y, m, d)` و`getFullYear` — ولو داخل قالبٍ نصّي', () => {
      const src = [
        'function a(d: Date) { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }',
        'function b(y: number) { return new Date(y, 0, 1); }',
        'function c(d: Date) { return `${d.getFullYear()}-${d.getMonth() + 1}`; }',
      ].join('\n');
      const bad = undeclaredLocalDayCalls(src);
      expect(bad.map((c) => `${c.line}:${c.call}`)).toEqual(['1:t.setHours(…)', '2:new Date(3 args)', '3:d.getFullYear(…)', '3:d.getMonth(…)']);
    });

    it('لا يُدين حسابَ الأيام في الإطار نفسِه — ولا الذِّكرَ في تعليقٍ أو سلسلة', () => {
      const src = [
        '// كان هنا d.setHours(0, 0, 0, 0)',
        'const msg = "لا تستعمل setHours(0,0,0,0)";',
        'function a(d: Date) { d.setDate(d.getDate() + 30); d.setMonth(d.getMonth() - 1); d.setFullYear(d.getFullYear() + 1); return d; }',
        'function b(d: Date) { return new Date(Date.UTC(2026, 0, 1)); }',
        'function c(d: Date) { return d.getUTCDate(); }',
      ].join('\n');
      expect(undeclaredLocalDayCalls(src)).toEqual([]);
      // والمستثنى يُرى لا يُتجاهَل: ستّةُ استدعاءاتٍ كلُّها حسابٌ.
      expect(localDayCalls(src).filter((c) => c.arithmetic).length).toBe(6);
    });

    it('يقبل الإعلانَ بسببٍ كافٍ فوق التابع — ويرفض الفارغَ والقصير', () => {
      const declared = ['/** يومُ منطقة العملية بحقّه: رفضٌ يقرؤه مديرُ المنصّة عند التأريخ الرجعي لا التاجر. */', 'function a() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }'].join('\n');
      expect(undeclaredLocalDayCalls(declared)).toEqual([]);
      const short = ['/** يومُ منطقة العملية بحقّه: كذا. */', 'function a() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }'].join('\n');
      expect(undeclaredLocalDayCalls(short).length).toBe(1);
      const other = ['/** تعليقٌ آخر بلا علامة. */', 'function a() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }'].join('\n');
      expect(undeclaredLocalDayCalls(other).length).toBe(1);
    });

    it('`setDate` بوسيطٍ ليس حساباً على `getDate` يُدان — فالاستثناءُ بالشكل لا بالاسم', () => {
      const src = 'function a(d: Date, n: number) { d.setDate(n); d.setDate(1); d.setMonth(d.getDate() + 1); }';
      expect(undeclaredLocalDayCalls(src).map((c) => c.call)).toEqual(['d.setDate(…)', 'd.setDate(…)', 'd.setMonth(…)', 'd.getDate(…)']);
    });
  });
});
