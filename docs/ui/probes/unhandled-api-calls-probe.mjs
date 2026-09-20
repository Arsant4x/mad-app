// مسبار القاعدة ② بدقّة الشجرة: كل استدعاءٍ لدالّة من api/ في pages/** — هل يُستهلك رفضُه؟
// handled ⇐ داخل try · أو .catch( في سلسلته · أو .then(a, b) · أو الدالّة الحاوية تُستدعى بأحد ذلك.
// ⚠️ حدٌّ معلَن: `.catch(() => {})` الفارغ يُعدّ هنا «معالَجاً» — والحارس الحقيقي يرفضه (الجولة ٢ §٢).
// أداةُ قياسٍ لا حارس. تشغيل من جذر المستودع: node docs/ui/probes/unhandled-api-calls-probe.mjs apps/web/src
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.argv[2]).split('\\').join('/');
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n)) files.push(p.replace(/\\/g, '/')); } })(ROOT);
const program = ts.createProgram(files, { jsx: ts.JsxEmit.ReactJSX, strict: true, target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, noEmit: true });
const checker = program.getTypeChecker();
const rel = f => relative(ROOT, f).replace(/\\/g, '/');
const ln = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

function isApiCallee(node) {
  if (!ts.isCallExpression(node)) return false;
  const s = checker.getSymbolAtLocation(node.expression);
  const d = s?.declarations?.[0];
  if (!d) return false;
  // الاستيراد يحيل إلى التصريح الأصلي
  const target = (ts.isImportSpecifier(d) || ts.isImportClause(d)) ? checker.getAliasedSymbol(s)?.declarations?.[0] : d;
  return !!target && /\/api\/[^/]+\.ts$/.test(target.getSourceFile().fileName.replace(/\\/g, '/'));
}
function enclosingFn(n) { while (n && !(ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n))) n = n.parent; return n; }
function chainHandled(n) {
  // اصعد عبر .then/.finally/await/Promise.all حتى عبارة؛ إن مررت بـ.catch( أو .then(a,b) فمعالَج
  let cur = n;
  while (cur && !ts.isExpressionStatement(cur) && !ts.isVariableDeclaration(cur) && !ts.isReturnStatement(cur) && !ts.isArrowFunction(cur) && !ts.isBlock(cur)) {
    const p = cur.parent;
    if (p && ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.expression === cur) {
      const m = p.expression.name.text;
      if (m === 'catch') return true;
      if (m === 'then' && p.arguments.length >= 2) return true;
    }
    if (p && ts.isPropertyAccessExpression(p) && p.expression === cur) { cur = p; continue; }
    cur = p;
  }
  return false;
}
function inTry(n) { for (let c = n; c; c = c.parent) { if (ts.isTryStatement(c) && c.tryBlock.pos <= n.pos && n.end <= c.tryBlock.end) return true; if (ts.isFunctionLike(c)) return false; } return false; }
function handled(call, sf, depth = 0) {
  if (inTry(call) || chainHandled(call)) return true;
  if (depth > 3) return false;
  const fn = enclosingFn(call);
  if (!fn) return false;
  // الدالّة الحاوية: إن كانت مسمّاة في الملف، افحص مواضع استدعائها
  let name = null;
  if (ts.isFunctionDeclaration(fn) && fn.name) name = fn.name.text;
  else if (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) name = fn.parent.name.text;
  if (!name) return false; // ردّ نداء مجهول (useEffect · onClick) — رفضُه لا يستهلكه أحد
  const sites = [];
  (function v(n) { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) sites.push(n); ts.forEachChild(n, v); })(sf);
  if (!sites.length) return false;
  return sites.every(s => handled(s, sf, depth + 1));
}

const byFile = new Map();
for (const sf of program.getSourceFiles()) {
  if (!files.some(x => x.toLowerCase() === sf.fileName.toLowerCase())) continue;
  const f = rel(sf.fileName); if (!f.startsWith('pages/')) continue;
  (function v(n) {
    if (isApiCallee(n)) { const ok = handled(n, sf); if (!byFile.has(f)) byFile.set(f, { total: 0, unhandled: [] }); const e = byFile.get(f); e.total++; if (!ok) e.unhandled.push(ln(sf, n)); }
    ts.forEachChild(n, v);
  })(sf);
}
const bad = [...byFile.entries()].filter(([, e]) => e.unhandled.length).sort();
console.log(`ملفات pages/ تستدعي api/: ${byFile.size} · منها بمواضع غير معالَجة: ${bad.length} · مواضع: ${bad.reduce((s, [, e]) => s + e.unhandled.length, 0)}`);
for (const [f, e] of bad) console.log(`  ${f}  (${e.unhandled.length}/${e.total})  أسطر: ${e.unhandled.join(' ')}`);
