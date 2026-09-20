// مسبار القواعد الخمس — بشجرة TypeScript لا بالنصّ. أداةُ قياسٍ لا حارس: لا يعمل في CI.
// يقرأ apps/web/src بمترجم TypeScript ويعدّ المخالفات لكل قاعدة بموضعها.
// تشغيل من جذر المستودع: node docs/ui/probes/rules-probe.mjs apps/web/src
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.argv[2]).split('\\').join('/');
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n)) files.push(p.replace(/\\/g, '/'));
  }
})(ROOT);

const program = ts.createProgram(files, { jsx: ts.JsxEmit.ReactJSX, strict: true, target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, noEmit: true });
const checker = program.getTypeChecker();
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
const line = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const inPages = (f) => f.startsWith('pages/');
const isApiModule = (sym) => { const d = sym?.declarations?.[0]; return d && /[\\/]api[\\/]/.test(d.getSourceFile().fileName); };

const R = { r1: [], r2: [], r3: [], r4: [], r5: [] };

for (const sf of program.getSourceFiles()) {
  if (!files.some((x) => x.toLowerCase() === sf.fileName.toLowerCase())) continue;
  const f = rel(sf.fileName);

  // ما يُستورد من api/ في هذا الملف — بالرمز لا بالاسم
  const apiNames = new Set();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && /['"]\.\.?\/.*api\//.test(st.moduleSpecifier.getText(sf)) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      for (const el of st.importClause.namedBindings.elements) apiNames.add(el.name.text);
    }
  }
  const callsApi = (node) => { let hit = false; (function v(n) { if (hit) return; if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && apiNames.has(n.expression.text)) { hit = true; return; } ts.forEachChild(n, v); })(node); return hit; };

  ts.forEachChild(sf, function visit(node) {
    // ① حساب في الشاشة: reduce على مصفوفة، أو عملية حسابية أحد طرفيها Number(...) على حقل
    if (inPages(f) && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'reduce') {
      R.r1.push(`${f}:${line(sf, node)}  reduce()`);
    }
    if (inPages(f) && ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(node.operatorToken.kind)) {
      const isNumCast = (e) => ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'Number' && e.arguments[0] && ts.isPropertyAccessExpression(e.arguments[0]);
      if (isNumCast(node.left) || isNumCast(node.right)) R.r1.push(`${f}:${line(sf, node)}  ${node.operatorToken.getText(sf)} على Number(حقل)`);
    }
    // ② وعدٌ من api/ داخل useEffect بلا catch ولا try
    if (inPages(f) && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect') {
      const body = node.arguments[0];
      if (body && callsApi(body)) {
        const txt = body.getText(sf);
        const hasCatch = /\.catch\s*\(/.test(txt) || /\btry\s*\{/.test(txt);
        // أو أن الدالّة المستدعاة معرَّفة في الملف وفيها catch
        let innerHandled = false;
        (function v(n) { if (innerHandled) return; if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) { const s = checker.getSymbolAtLocation(n.expression); const d = s?.declarations?.[0]; if (d && d.getSourceFile() === sf && /\.catch\s*\(|\btry\s*\{/.test(d.getText(sf))) innerHandled = true; } ts.forEachChild(n, v); })(body);
        if (!hasCatch && !innerHandled) R.r2.push(`${f}:${line(sf, node)}`);
      }
    }
    // ③ تنسيقٌ يُخفي الغياب: ?? 0 · || 0 · ? x : 0 على قيمةٍ قد تغيب
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken) && ts.isNumericLiteral(node.right) && node.right.text === '0') {
      const t = checker.getTypeAtLocation(node.left);
      const s = checker.typeToString(t);
      if (/undefined|null|string|any/.test(s)) R.r3.push(`${f}:${line(sf, node)}  (${node.left.getText(sf).slice(0, 40)}) ${node.operatorToken.getText(sf)} 0   ← ${s.slice(0, 40)}`);
    }
    if (ts.isConditionalExpression(node) && ts.isNumericLiteral(node.whenFalse) && node.whenFalse.text === '0' && /isFinite|isNaN/.test(node.condition.getText(sf))) {
      R.r3.push(`${f}:${line(sf, node)}  ${node.getText(sf).slice(0, 60)}`);
    }
    // ④ تقسيم في الشاشة: slice على متغيّرٍ نوعُه مصفوفة (لا على نصّ)، أو دالّة قائمة في api تعود T[]
    if (inPages(f) && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'slice') {
      const t = checker.getTypeAtLocation(node.expression.expression);
      if (checker.isArrayType(t) || checker.typeToString(t).endsWith('[]')) R.r4.push(`${f}:${line(sf, node)}  ${node.expression.expression.getText(sf).slice(0, 30)}.slice`);
    }
    if (f.startsWith('api/') && ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && /^list[A-Z]/.test(node.name.text) && node.initializer) {
      const t = checker.getTypeAtLocation(node.name);
      const sig = t.getCallSignatures()[0];
      if (sig) { const rt = checker.typeToString(sig.getReturnType()); if (/Promise<[A-Za-z]+\[\]>/.test(rt)) R.r4.push(`${f}:${line(sf, node)}  ${node.name.text} → ${rt}`); }
    }
    // ⑤ حكمٌ بالصلاحية في الشاشة من غير مصدر الخادم: actorType/role مقارَنةً
    if (inPages(f) && ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)) {
      const l = node.left.getText(sf);
      if (/\.(actorType|role)$/.test(l)) R.r5.push(`${f}:${line(sf, node)}  ${node.getText(sf).slice(0, 50)}`);
    }
    ts.forEachChild(node, visit);
  });
}

for (const [k, v] of Object.entries(R)) {
  console.log(`\n=== ${k} · ${v.length} موضعاً في ${new Set(v.map((x) => x.split(':')[0])).size} ملفاً ===`);
  for (const x of v) console.log('  ' + x);
  if (v.length > 40) console.log(`  … و${v.length - 40} أخرى`);
}
