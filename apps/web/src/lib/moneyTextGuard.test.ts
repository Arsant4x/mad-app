import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (52.2 ث).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 157_000 });

/**
 * **لا حسابَ على حقلٍ نصّيّ من المرآة** (`ق-١٢٣٥`/③) — حارسٌ **شجريّ لا نصّيّ** (`ق-٣٣١`).
 *
 * ## العطل الذي يمنعه
 *
 * حين يعيد الخادمُ المالَ نصّاً (`"1234.50"`)، يبقى `+` مقبولاً في TypeScript على نصَّين — **وصلاً لا جمعاً**:
 * `"100.00" + "50.00"` يساوي `"100.0050.00"`؛ و`"9.00" > "10.00"` صحيحةٌ لأنها مقارنةُ حروف. **ولا يشكو
 * المترجم** — فالجمعُ يصير وصلاً بصمت (بنصّ المالك: «الأثقل: انقلابُ `number` إلى `string` يكسر الحسابَ صامتاً»).
 *
 * ## ما يقرؤه
 *
 * كلَّ ملفّات `src` بمدقّق الأنواع نفسِه الذي يبني الواجهة (`tsconfig.app.json`)، ويسأل عن كل عمليةٍ حسابية
 * أو مقارنة (`+ - * / % < > <= >= += -= *= /=` والسالبُ الأحادي و`Math.*`): **هل أحدُ طرفيها حقلٌ مُعلَنٌ
 * بأحد أسماء النصّ العشريّ** (`MoneyText` · `QtyText` · `RateText` · `PercentText`)؟ فإن كان، سقط الحارسُ
 * باسم الملفّ والسطر — لأن الطريقَ الوحيد هو `num()` قبل الحساب و`fmt()` للعرض.
 *
 * ## حدُّه معلَن
 *
 * يرى **الاسمَ المُعلَن على الحقل في تعريفه** (`netVat: MoneyText`) لا النوعَ المحلول — فـ`type MoneyText = string`
 * يذوب في المدقّق إلى `string`. فحقلٌ نُسخ إلى متغيّرٍ بلا نوعٍ مُعلَن (`const v = d.netVat`) ثم حُسب عليه
 * **لا يُرى** — ويُرى حين يُعلَن نوعُه (`const v: MoneyText = …`). وهو الحدُّ الذي يُقاس أدناه لا يُخفى.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const TEXT_TYPES = new Set(['MoneyText', 'QtyText', 'RateText', 'PercentText']);
const ARITHMETIC = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
]);

/** برنامجُ الواجهة كما يبنيه `tsconfig.app.json` — وملفّاتٌ إضافية للعيّنات. */
function program(extraFiles: string[] = []): ts.Program {
  const configPath = join(WEB, 'tsconfig.app.json');
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, WEB);
  return ts.createProgram([...parsed.fileNames, ...extraFiles], { ...parsed.options, noEmit: true });
}

/** اسمُ النوع المُعلَن على تعريف الرمز — `netVat: MoneyText` ⟵ `MoneyText`؛ وغيرُه `null`. */
function declaredTextType(checker: ts.TypeChecker, expr: ts.Expression): string | null {
  // الأقواسُ و`as` و`!` أغلفةٌ لا تغيّر ما تحتها — و`as unknown as number` بالذات هو ما يكتبه من يريد أن يتجاوز المترجم.
  let target: ts.Expression = expr;
  while (ts.isParenthesizedExpression(target) || ts.isAsExpression(target) || ts.isTypeAssertionExpression(target) || ts.isNonNullExpression(target)) target = target.expression;
  const nameNode = ts.isPropertyAccessExpression(target) ? target.name : ts.isIdentifier(target) ? target : null;
  if (!nameNode) return null;
  const symbol = checker.getSymbolAtLocation(nameNode);
  const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (!decl) return null;
  const typeNode = (decl as { type?: ts.TypeNode }).type;
  if (!typeNode) return null;
  const name = ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName) ? typeNode.typeName.text : null;
  return name && TEXT_TYPES.has(name) ? name : null;
}

interface Hit {
  file: string;
  line: number;
  text: string;
  type: string;
}

/** كلُّ عمليةٍ حسابية على حقلٍ نصّيّ في الملفّات المعطاة. */
function scan(prog: ts.Program, files: readonly string[]): Hit[] {
  const checker = prog.getTypeChecker();
  const hits: Hit[] = [];
  const wanted = new Set(files.map((f) => f.replace(/\\/g, '/')));
  for (const sf of prog.getSourceFiles()) {
    if (!wanted.has(sf.fileName.replace(/\\/g, '/'))) continue;
    const report = (node: ts.Node, operand: ts.Expression) => {
      const type = declaredTextType(checker, operand);
      if (!type) return;
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push({ file: relative(SRC, sf.fileName).replace(/\\/g, '/'), line: line + 1, text: node.getText(sf).replace(/\s+/g, ' ').slice(0, 80), type });
    };
    const visit = (node: ts.Node) => {
      if (ts.isBinaryExpression(node) && ARITHMETIC.has(node.operatorToken.kind)) {
        // موضعٌ واحد للعملية الواحدة — ولو كان الطرفان معاً نصّيين.
        if (!declaredTextType(checker, node.left)) report(node, node.right);
        else report(node, node.left);
      } else if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)) {
        report(node, node.operand);
      } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Math') {
        for (const arg of node.arguments) report(node, arg);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return hits;
}

describe('المالُ نصّاً — لا حسابَ على حقلٍ نصّيّ من المرآة (ق-١٢٣٥)', () => {
  const prog = program();
  const appFiles = prog.getRootFileNames().filter((f) => f.replace(/\\/g, '/').includes('/src/'));
  // مدقّقُ الأنواع على الواجهة كلِّها: ثانيتان وحدَه، وعشراتٌ حين تتزاحم عمّالُ vitest — فالمهلةُ سقفٌ للتزاحم لا للبطء،
  // **وهي ميزانيةُ الملفّ المعلنةُ أعلاه** (ق-١٣٣٢) لا رقمٌ على كلِّ اختبار: موضعٌ واحدٌ يُقرأ ويُحرَس.
  it('يقرأ الشجرةَ فعلاً: ملفّاتُ المصدر بالعشرات والأنواعُ النصّية مُعلَنة في lib/money.ts', () => {
    expect(appFiles.length).toBeGreaterThan(50);
    const money = readFileSync(join(SRC, 'lib', 'money.ts'), 'utf8');
    for (const t of TEXT_TYPES) expect(money).toContain(`export type ${t} = string`);
  });

  it('⭐ لا عمليةَ حسابية ولا مقارنة على حقلٍ من الأنواع النصّية في الواجهة كلِّها', () => {
    const hits = scan(prog, appFiles);
    expect(hits.map((h) => `${h.file}:${h.line} — ${h.text} (${h.type})`)).toEqual([]);
  });

  it('المُكتشِفُ مُثبَتٌ بحالتين — يمسك الحسابَ والمقارنةَ وMath ويترك fmt وnum والوصلَ في قالب', () => {
    const sample = join(SRC, 'lib', '__money-text-guard-sample__.tsx');
    // العيّنةُ تُكتب بدالّةٍ لا حرفياً (§8.7): حارسٌ قرأ عيّنته من حرفيات ملفّه أمسك نفسه مرّتين.
    const lines = [
      "import { fmt } from './format';",
      "import { num, type MoneyText } from './money';",
      'interface Decl { netVat: MoneyText; count: number; label: string }',
      'export function bad(d: Decl) {',
      '  const a = d.netVat >= 0;',
      '  const b = d.netVat + d.netVat;',
      '  const c = Math.abs(d.netVat as unknown as number);',
      '  const e = -d.netVat;',
      '  return [a, b, c, e];',
      '}',
      'export function good(d: Decl) {',
      '  const a = (num(d.netVat) ?? 0) >= 0;',
      '  const b = fmt(d.netVat);',
      '  const c = d.count + 1;',
      '  const e = `${d.label}: ${d.netVat}`;',
      '  return [a, b, c, e];',
      '}',
    ];
    const source = ts.createSourceFile(sample, lines.join('\n'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    const host = ts.createCompilerHost({ ...prog.getCompilerOptions() });
    const originalGet = host.getSourceFile;
    host.getSourceFile = (fileName, ...rest) => (fileName.replace(/\\/g, '/') === sample.replace(/\\/g, '/') ? source : originalGet.call(host, fileName, ...rest));
    host.fileExists = (fileName) => fileName.replace(/\\/g, '/') === sample.replace(/\\/g, '/') || existsSync(fileName);
    const probe = ts.createProgram([...prog.getRootFileNames(), sample], { ...prog.getCompilerOptions(), noEmit: true }, host);
    const hits = scan(probe, [sample]);
    const byLine = hits.map((h) => h.line).sort((a, b) => a - b);
    // الأربعةُ السيّئة (الأسطر 5–8) تُمسَك — والحسنة (12–15) لا.
    expect(new Set(byLine)).toEqual(new Set([5, 6, 7, 8]));
    expect(hits.every((h) => h.type === 'MoneyText')).toBe(true);
  });
});
