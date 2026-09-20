import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import legacyJson from './legacy-allowlist.json';
import unpagedJson from './unpaged-lists.json';

/**
 * حرّاسُ القواعد الخمس — **بشجرة TypeScript ومدقّق أنواعه، لا بالنصّ** (`ق-٣٣١`).
 *
 * ## لماذا شجرة
 *
 * حارسٌ نصّي في هذا المجلد نفسه (`routes/guardsMatchServer.test.ts`) تسجّل تعليقاتُه
 * عطلَين من النصّ: `\r\n` أبطل فاصلاً، ونافذةٌ منزلقة ابتلعت حارسَ ما بعدها. والفرقُ
 * مقيس (الجولة ٢): `.slice(` **٤٠** بالنصّ و**٠** على مصفوفة بالشجرة — كلُّها تواريخ.
 *
 * ## ما يحرسه — القواعد الخمس (`docs/ui/rounds/01-rules-enforcement.md`)
 *
 * ① لا حسابَ في الشاشة على رقمٍ يُقرأ حقيقةً عن العمل (مالٌ · كمّية · عددُ أشياء) —
 *   ويُسمح حسابُ آليّة العرض في `components/Pager.tsx` وحده (تحرير المالك 2026-09-20).
 * ② لا `api/` في الصفحات والمكوّنات؛ والاستدعاءُ في `hooks/` داخل `useResource`/`useMutation`
 *   وحدَهما؛ و`.catch(() => {})` الفارغ ليس معالجة.
 * ③ لا `?? 0` ولا `|| 0` ولا `isFinite ? : 0` على ما قد يغيب، ولا مُنسِّقٌ يقبل `null`.
 * ④ كلُّ `list*` في `api/` تعود `Page<T>` أو تكون في `unpaged-lists.json` (تنكمش ولا تتّسع)؛
 *   ولا `.slice(` على مصفوفةٍ في الشاشة.
 * ⑤ لا حكمَ بـ`actorType`/`status` في الشاشة — المنحةُ من `can()`؛ والمقارنةُ للعرض مسموحة بموضعها.
 *
 * ## النطاق والاستثناء
 *
 * النطاق `pages/` · `components/` · `hooks/` (+ عيّناتُ الكسر). ما سبق الحرّاسَ مسمّىً في
 * `legacy-allowlist.json` — **يُطبع عددُه ولا يزيد**، وإدخالٌ زال من القرص يُسقط الحزمة.
 *
 * ## مُثبَتٌ بالعكس
 *
 * لكل قاعدةٍ عيّنةُ كسرٍ في `test/fixtures/guards/bad-*.tsx` **بصياغةٍ يكتبها مطوّرٌ فعلاً**
 * (`§8.8` الوجه الثاني)، وعيّنةٌ سليمة `good-slice.tsx` يجب أن تمرّ — فحارسٌ يسقط على
 * كل شيء يسقط على الكسر أيضاً ويبدو عاملاً (`§8.15`).
 */

const SRC = resolve(__dirname, '..').split('\\').join('/');
const FIXTURES = 'test/fixtures/guards';
const rel = (f: string) => relative(SRC, f).split('\\').join('/');

const LEGACY = new Set<string>(legacyJson.files);
const UNPAGED = new Set<string>(unpagedJson.names);
/** الموضعُ الوحيد المأذونُ له بحساب آليّة العرض (عددُ الصفحات). */
const ARITHMETIC_ALLOWED = new Set(['components/Pager.tsx']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(p.split('\\').join('/'));
  }
  return out;
}

const ALL = walk(SRC).filter((f) => {
  const r = rel(f);
  if (r.startsWith('test/')) return r.startsWith(FIXTURES + '/');
  return true;
});

const isFixture = (r: string) => r.startsWith(FIXTURES + '/');
const inScreenScope = (r: string) => /^(pages|components|hooks)\//.test(r) || (isFixture(r) && !r.endsWith('bad-4-api-unpaged.ts'));
const inApiScope = (r: string) => /^api\/[^/]+\.ts$/.test(r) || r.endsWith('bad-4-api-unpaged.ts');
const isLegacy = (r: string) => LEGACY.has(r);

interface Finding {
  rule: 1 | 2 | 3 | 4 | 5;
  file: string;
  line: number;
  note: string;
}

let program: ts.Program;
let checker: ts.TypeChecker;
let findings: Finding[] = [];
let unpagedActual: string[] = [];

const ARITH = new Set([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken]);

function typeText(node: ts.Node): string {
  try {
    return checker.typeToString(checker.getTypeAtLocation(node));
  } catch {
    return '';
  }
}
const isWireMoney = (t: string) => /\b(Money|Qty)\b/.test(t);
const isNumCast = (n: ts.Node): n is ts.CallExpression => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(Number|parseFloat|parseInt)$/.test(n.expression.text) && n.arguments.length > 0;

/** هل هذه الخاصيةُ حقيقةٌ من الخادم؟ — مُعرَّفةٌ في `api/` أو في أنماط العرض في `hooks/`. */
function isServerFact(n: ts.Node): boolean {
  if (!ts.isPropertyAccessExpression(n)) return false;
  const sym = checker.getSymbolAtLocation(n.name);
  const decl = sym?.declarations?.[0];
  if (!decl) return false;
  const file = rel(decl.getSourceFile().fileName.split('\\').join('/'));
  if (!/^(api|hooks)\//.test(file)) return false;
  const t = typeText(n);
  return /^(number|string)( \| (null|undefined))*$/.test(t) || isWireMoney(t);
}

/** يصعد من العقدة: هل هي داخل وسيطٍ لاستدعاء `useResource`/`useMutation`/`useCallback`؟ */
function insideResourceBoundary(n: ts.Node): boolean {
  for (let c: ts.Node | undefined = n.parent; c; c = c.parent) {
    if (ts.isCallExpression(c) && ts.isIdentifier(c.expression) && /^(useResource|useMutation|useCallback)$/.test(c.expression.text)) {
      return c.arguments.some((a) => a.pos <= n.pos && n.end <= a.end);
    }
  }
  return false;
}

/** هل يحيل هذا الاستدعاءُ إلى دالّةٍ معرَّفة في `api/`؟ — بالرمز لا بالاسم. */
function callsApi(n: ts.CallExpression): boolean {
  const s = checker.getSymbolAtLocation(n.expression);
  if (!s) return false;
  const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
  const d = target.declarations?.[0];
  if (!d) return false;
  const file = rel(d.getSourceFile().fileName.split('\\').join('/'));
  return /^api\/[^/]+\.ts$/.test(file) && !/^api\/(wire|page)\.ts$/.test(file);
}

function scanFile(sf: ts.SourceFile, out: Finding[]) {
  const file = rel(sf.fileName.split('\\').join('/'));
  const screen = inScreenScope(file) && !isLegacy(file);
  const api = inApiScope(file);
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const push = (rule: Finding['rule'], n: ts.Node, note: string) => out.push({ rule, file, line: line(n), note });

  // ④ — جهةُ api/: كلُّ list* تعود Page<T> أو تكون مسمّاةً في القائمة
  if (api) {
    for (const st of sf.statements) {
      const exported = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      const names: { name: string; node: ts.Node }[] = [];
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push({ name: d.name.text, node: d.name });
      if (ts.isFunctionDeclaration(st) && st.name) names.push({ name: st.name.text, node: st.name });
      for (const { name, node } of names) {
        if (!/^list[A-Z]/.test(name)) continue;
        const t = checker.getTypeAtLocation(node);
        const sig = t.getCallSignatures()[0];
        if (!sig) continue;
        const ret = sig.getReturnType();
        const inner = ret.symbol?.name === 'Promise' ? (checker.getTypeArguments(ret as ts.TypeReference)[0] ?? ret) : ret;
        const paged = !!inner.getProperty('items') && !!inner.getProperty('total') && !!inner.getProperty('page') && !!inner.getProperty('pageSize');
        if (!paged) {
          unpagedActual.push(name);
          if (!UNPAGED.has(name)) push(4, node, `${name} تعود ${checker.typeToString(ret)} — ليست Page<T> وليست في unpaged-lists.json`);
        } else if (UNPAGED.has(name)) {
          push(4, node, `${name} صارت مقسَّمة — إدخالٌ ميّت في unpaged-lists.json يُحذف`);
        }
      }
    }
  }

  if (!screen) return;
  const isPage = /^pages\//.test(file) || /^components\//.test(file) || (isFixture(file) && !/^hooks\//.test(file));
  const isHook = /^hooks\//.test(file);

  // ② — الاستيراد
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (!/\/api\/[^/]+$/.test(spec) || /\/api\/(wire|page)$/.test(spec)) continue;
    const clause = st.importClause;
    if (!clause) continue;
    const allTypes = clause.isTypeOnly || (clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((e) => e.isTypeOnly) && !clause.name);
    if (isPage && !allTypes) push(2, st, `استيرادٌ مباشر من ${spec} في صفحة/مكوّن — يمرّ عبر hooks/`);
  }

  ts.forEachChild(sf, function visit(node) {
    // ① الحساب على حقيقةٍ من الخادم
    if (!ARITHMETIC_ALLOWED.has(file)) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'reduce') {
        push(1, node, 'reduce() في الشاشة — المجموعُ يأتي من الخادم أو من <ColumnSum>');
      }
      if (ts.isBinaryExpression(node) && ARITH.has(node.operatorToken.kind)) {
        for (const side of [node.left, node.right]) {
          const t = typeText(side);
          if (isWireMoney(t)) push(1, node, `${node.operatorToken.getText(sf)} على ${t}`);
          else if (isNumCast(side) && isWireMoney(typeText(side.arguments[0]))) push(1, node, `${node.operatorToken.getText(sf)} على Number(${typeText(side.arguments[0])})`);
          else if (isServerFact(side)) push(1, node, `${node.operatorToken.getText(sf)} على حقيقةٍ من الخادم: ${side.getText(sf)}`);
        }
      }
      if (isNumCast(node) && isWireMoney(typeText(node.arguments[0]))) push(1, node, `${node.expression.getText(sf)}() يفكّ وسمَ ${typeText(node.arguments[0])}`);
      if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.PlusToken && isWireMoney(typeText(node.operand))) push(1, node, `+x يفكّ وسمَ ${typeText(node.operand)}`);
    }

    // ② catch فارغ · واستدعاءُ api خارج الحدّ في hooks/
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'catch' && node.arguments[0]) {
      const cb = node.arguments[0];
      if ((ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && ts.isBlock(cb.body) && cb.body.statements.length === 0) push(2, node, '.catch(() => {}) يبتلع الخطأ — الخطأُ حالةٌ تُعرض');
    }
    if (isHook && ts.isCallExpression(node) && callsApi(node) && !insideResourceBoundary(node)) push(2, node, 'استدعاءُ api/ خارج useResource/useMutation');

    // ③ الصفرُ للغائب
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      const r = node.right;
      const zero = (ts.isNumericLiteral(r) && Number(r.text) === 0) || (ts.isStringLiteral(r) && /^0(\.0+)?$/.test(r.text));
      if (zero) {
        const t = typeText(node.left);
        if (/\b(undefined|null|string)\b/.test(t)) push(3, node, `${node.left.getText(sf)} ${node.operatorToken.getText(sf)} 0 على ${t} — الغائبُ ليس صفراً`);
      }
    }
    if (ts.isConditionalExpression(node) && ts.isNumericLiteral(node.whenFalse) && Number(node.whenFalse.text) === 0 && /\b(isFinite|isNaN)\b/.test(node.condition.getText(sf))) push(3, node, 'isFinite ? x : 0 — الغائبُ ليس صفراً');
    if (ts.isFunctionDeclaration(node) && node.name && /^(fmt|format)/.test(node.name.text)) {
      for (const p of node.parameters) {
        const t = typeText(p);
        if (/\b(undefined|null)\b/.test(t)) push(3, node, `${node.name.text}() يقبل ${t} — المُنسِّق لا يقبل الغائب؛ المستدعي يفرز`);
      }
    }

    // ④ تقسيمٌ في الشاشة
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'slice') {
      try {
        if (checker.isArrayType(checker.getTypeAtLocation(node.expression.expression))) push(4, node, `.slice() على مصفوفة ${node.expression.expression.getText(sf)} — الصفحاتُ من الخادم`);
      } catch {
        /* نوعٌ لا يُقرأ — لا حكم */
      }
    }

    // ⑤ الحكمُ بالفاعل
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)) {
      const actor = [node.left, node.right].some((s) => /\b(ActorType|AccountStatus)\b/.test(typeText(s)));
      if (actor) {
        const p = node.parent;
        const isText = (n: ts.Node) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n);
        const displayOnly = ts.isConditionalExpression(p) && p.condition === node && isText(p.whenTrue) && isText(p.whenFalse);
        if (!displayOnly) push(5, node, `${node.getText(sf)} — الحكمُ بالفاعل في الشاشة؛ المنحةُ من can()`);
      }
    }

    ts.forEachChild(node, visit);
  });
}

beforeAll(() => {
  program = ts.createProgram(ALL, {
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    noEmit: true,
    skipLibCheck: true,
  });
  checker = program.getTypeChecker();
  findings = [];
  unpagedActual = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    if (!ALL.some((f) => f.toLowerCase() === sf.fileName.split('\\').join('/').toLowerCase())) continue;
    scanFile(sf, findings);
  }
}, 180_000);

const byRule = (rule: Finding['rule'], filter: (f: Finding) => boolean = () => true) => findings.filter((f) => f.rule === rule && filter(f));
const fmt = (fs: Finding[]) => fs.map((f) => `  ${f.file}:${f.line}  ${f.note}`).join('\n');
const inFixture = (name: string) => (f: Finding) => f.file === `${FIXTURES}/${name}`;
const inTree = (f: Finding) => !isFixture(f.file);

describe('حرّاس القواعد الخمس — الشجرة لا النصّ', () => {
  it('يقرأ الملفات فعلاً — المصدرُ الذي وقعت عليه عينُه', () => {
    const screen = ALL.map(rel).filter((r) => inScreenScope(r) && !isLegacy(r) && !isFixture(r));
    const legacy = ALL.map(rel).filter(isLegacy);
    const api = ALL.map(rel).filter(inApiScope);
    console.log(`النطاق: ${screen.length} ملفاً محروساً · ${legacy.length} قديماً مستثنى (baseline ${legacyJson.baseline}) · ${api.length} ملف api · ${ALL.length} إجمالاً`);
    expect(screen.length).toBeGreaterThanOrEqual(8);
    expect(api.length).toBeGreaterThanOrEqual(40);
  });

  it('قائمة القديم: كلُّ إدخالٍ موجودٌ على القرص، والعددُ لا يزيد عن baseline', () => {
    const missing = legacyJson.files.filter((f) => !existsSync(join(SRC, f)));
    expect(missing, `إدخالاتٌ ميّتة في legacy-allowlist.json:\n${missing.join('\n')}`).toEqual([]);
    expect(legacyJson.files.length).toBeLessThanOrEqual(legacyJson.baseline);
  });

  it('① مثالُ الكسر يسقط: reduce · Number(Money) · + على Money', () => {
    const f = byRule(1, inFixture('bad-1-arithmetic.tsx'));
    expect(f.length, fmt(f)).toBeGreaterThanOrEqual(4);
    expect(f.some((x) => /reduce/.test(x.note))).toBe(true);
    expect(f.some((x) => /Number\(Money\)|يفكّ وسمَ Money/.test(x.note))).toBe(true);
    expect(f.some((x) => /\+ على Money/.test(x.note))).toBe(true);
  });

  it('② مثالُ الكسر يسقط: استيرادٌ مباشر من api/ في صفحة · catch فارغ', () => {
    const f = byRule(2, inFixture('bad-2-direct-api.tsx'));
    expect(f.length, fmt(f)).toBeGreaterThanOrEqual(2);
    expect(f.some((x) => /استيرادٌ مباشر/.test(x.note))).toBe(true);
    expect(f.some((x) => /catch/.test(x.note))).toBe(true);
  });

  it('③ مثالُ الكسر يسقط: ?? 0 على قد يغيب · isFinite ? : 0 · مُنسِّقٌ يقبل undefined', () => {
    const f = byRule(3, inFixture('bad-3-zero-for-absent.tsx'));
    expect(f.length, fmt(f)).toBeGreaterThanOrEqual(3);
    expect(f.some((x) => /amount \?\? 0/.test(x.note))).toBe(true);
    expect(f.some((x) => /isFinite/.test(x.note))).toBe(true);
    expect(f.some((x) => /fmtBad/.test(x.note))).toBe(true);
  });

  it('④ مثالُ الكسر يسقط: slice على مصفوفة في الشاشة · list* تعود مصفوفةً وليست في القائمة', () => {
    const page = byRule(4, inFixture('bad-4-client-paging.tsx'));
    expect(page.length, fmt(page)).toBeGreaterThanOrEqual(1);
    const api = byRule(4, inFixture('bad-4-api-unpaged.ts'));
    expect(api.length, fmt(api)).toBeGreaterThanOrEqual(1);
    expect(api[0].note).toContain('listFixtureThings');
  });

  it('⑤ مثالُ الكسر يسقط: canManage = actorType === · actorType === && <button>', () => {
    const f = byRule(5, inFixture('bad-5-actor-gate.tsx'));
    expect(f.length, fmt(f)).toBeGreaterThanOrEqual(2);
  });

  it('العيّنةُ السليمة تمرّ من الخمسة — الحارسُ لا يسقط على كل شيء', () => {
    const f = findings.filter(inFixture('good-slice.tsx'));
    expect(f, fmt(f)).toEqual([]);
  });

  it('① الشجرةُ المحروسة بلا حسابٍ على حقيقةٍ من الخادم', () => {
    const f = byRule(1, inTree);
    expect(f, fmt(f)).toEqual([]);
  });

  it('② الشجرةُ المحروسة: لا api/ في الصفحات · لا catch فارغ · الاستدعاءُ داخل الحدّ', () => {
    const f = byRule(2, inTree);
    expect(f, fmt(f)).toEqual([]);
  });

  it('③ الشجرةُ المحروسة بلا صفرٍ للغائب', () => {
    const f = byRule(3, inTree);
    expect(f, fmt(f)).toEqual([]);
  });

  it('④ القوائمُ من الخادم — والقائمةُ المسمّاة تنكمش ولا تتّسع', () => {
    const listed = [...UNPAGED].filter((n) => !n.startsWith('listFixture'));
    const actual = unpagedActual.filter((n) => !n.startsWith('listFixture'));
    console.log(`④ قوائمُ بلا ترقيم: ${actual.length} فعلاً · ${listed.length} مسمّاة · baseline ${unpagedJson.baseline}`);
    const f = byRule(4, (x) => inTree(x) && !x.file.startsWith('pages/') && !x.file.startsWith('components/') && !x.file.startsWith('hooks/'));
    expect(f, fmt(f)).toEqual([]);
    expect(listed.length).toBeLessThanOrEqual(unpagedJson.baseline);
    const slices = byRule(4, (x) => inTree(x) && /^(pages|components|hooks)\//.test(x.file));
    expect(slices, fmt(slices)).toEqual([]);
  });

  it('⑤ الشجرةُ المحروسة بلا حكمٍ بالفاعل', () => {
    const f = byRule(5, inTree);
    expect(f, fmt(f)).toEqual([]);
  });
});
