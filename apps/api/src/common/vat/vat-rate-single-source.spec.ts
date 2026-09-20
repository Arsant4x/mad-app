import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { stripCommentsAndStrings } from '../source-scan.util';
import { STANDARD_VAT_RATE } from './standard-rate';

/**
 * ⑧ **مصدرٌ واحد للنسبة الأساسية** — حارسٌ شجريّ (`ق-١٢١٢` · `ق-١٢٢٥`/①).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * الرقمُ `15` كان مكتوباً حرفياً في **أحدَ عشرَ موضعاً** من شيفرة الإنتاج (مقيسٌ قبل الكنس: الكاشير
 * `POS_TAX_RATE` · `RENT_VAT_RATE` · `VAT_RATE` في المشتريات وثلاثةُ افتراضاتٍ `?? 15` · وسبعةٌ في
 * الواجهة بين شاشتي الفاتورة والكاشير ونافذة العقد ومعاينة الشراء). والنسبةُ نظاميةٌ **قابلةٌ للتغيير
 * بقرار** (تغيّرت من `5` إلى `15` في 2020) — فتغييرُها كان سيقع في بعض المواضع لا كلِّها.
 *
 * ── القاعدة ───────────────────────────────────────────────────────────────
 *
 * النسبةُ تعيش في `common/vat/standard-rate.ts` (الخادم) ونسختِها `lib/vat.ts` (الواجهة) — **ويُثبَت
 * تطابقُهما هنا**. وأيُّ حرفيٍّ عدديّ من عائلة النسبة (`15` · `0.15` · `1.15` · `115`) **في سياق ضريبة**
 * خارجهما يُسقط الحزمة. والسياقُ ثلاثةُ أشكال — مقيسةٌ على الشجرة قبل قبول الحارس، فلا يُدين رقماً
 * بريئاً (`NOTE_DEADLINE_DAYS = 15` أيامٌ لا نسبة — ولم يُدَن):
 *
 *   ① **عاملٌ في ضربٍ أو قسمة** (`a * 0.15` · `(a * 15) / 115`) — الاستعمالُ الحسابيّ للرقم نسبةٌ بلا كلمة.
 *   ② **اسمٌ في سياقه** يذكر الضريبة (`tax` · `vat` · `rate` · `percent` · `ضريب` · `نسب`) في الأجداد الثلاثة.
 *   ③ **عرضٌ في JSX** يليه علامةُ النسبة (`{15}٪`).
 *
 * ── لماذا شجرةٌ لا نصّ ────────────────────────────────────────────────────
 *
 * النصُّ يرى `15` في تعليقٍ وسلسلةٍ ورقمِ قرار؛ والشجرةُ ترى **الحرفيَّ العدديّ** وحدَه وموضعَه من
 * التعبير (`ق-٣٣١`). والاختباراتُ خارج نطاقه: `taxRate: 15` فيها إعلانٌ لـ`S` لا مصدرٌ للنسبة
 * (`ق-١٢١١`/③ — الأربعةُ والأربعون لا تُمسّ).
 *
 * ── حدودُه المعلَنة ───────────────────────────────────────────────────────
 *
 * ⚠️ لا يرى نسبةً مكتوبةً نصّاً (`'15%'` في ترجمة) ولا `15n` — لم يُقَس لهما موضعٌ في الشيفرة.
 * ⚠️ الهجراتُ (`.sql`) خارجه: الرقمُ فيها تاريخُ ما كُتب على السطور القائمة لا مصدرٌ (`20260920150000`).
 */
const REPO = join(__dirname, '..', '..', '..', '..', '..');
const ROOTS = [join(REPO, 'apps', 'api', 'src'), join(REPO, 'apps', 'web', 'src')];
const SOURCES = [join(REPO, 'apps', 'api', 'src', 'common', 'vat', 'standard-rate.ts'), join(REPO, 'apps', 'web', 'src', 'lib', 'vat.ts')];

/** عائلةُ النسبة كما تُكتب حرفياً: النسبةُ · كسرُها · معاملُ الإجمالي · مقامُ الشمول. */
const RATE_LITERALS = new Set(['15', '0.15', '1.15', '115']);
const TAX_CONTEXT = /tax|vat|rate|percent|ضريب|نسب/i;

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) productionFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.(spec|test|e2e-spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

export interface RateOffence {
  line: number;
  literal: string;
  context: string;
}

function isArithmeticOperand(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.AsteriskToken || p.operatorToken.kind === ts.SyntaxKind.SlashToken)) return true;
  // `(a * 15)` — الحرفيُّ داخل قوسٍ هو عاملُ الضرب المحيط.
  if (ts.isParenthesizedExpression(p)) return isArithmeticOperand(p);
  return false;
}

/** كاشفُ الحكم — يقبل نصّاً (لإثباته بحالتين) ويعيد المخالفات بسطرها. */
export function rateLiteralOffences(source: string, fileName = 'fixture.tsx'): RateOffence[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const offences: RateOffence[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isNumericLiteral(node) && RATE_LITERALS.has(node.text)) {
      const ancestors: string[] = [];
      let n: ts.Node | undefined = node.parent;
      for (let i = 0; i < 3 && n; i++, n = n.parent) ancestors.push(n.getText(sf));
      // السياقُ كودٌ لا نصّ: تعليقٌ يذكر الضريبة بجانب رقمٍ بريء لا يُدينه (`ق-٣٣١`).
      const context = stripCommentsAndStrings(ancestors.join(' '));
      const jsx = ts.isJsxExpression(node.parent) && /[%٪]/.test(node.parent.parent?.getText(sf) ?? '');
      if (isArithmeticOperand(node) || TAX_CONTEXT.test(context) || jsx) {
        offences.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, literal: node.text, context: ancestors[0].replace(/\s+/g, ' ').slice(0, 80) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offences;
}

/** قيمةُ المصدر كما كُتبت في ملفّه — تُقرأ من الشجرة لا بنمط. */
function declaredRate(file: string): number | null {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let value: number | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'STANDARD_VAT_RATE' && node.initializer && ts.isNumericLiteral(node.initializer)) value = Number(node.initializer.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return value;
}

describe('⑧ النسبةُ الأساسية من مصدرٍ واحد — لا رقمَ حرفيّاً في سياق ضريبة', () => {
  it('المُكتشِف مُثبَت بحالتين على نصٍّ مصنوع: يمسك ما يجب ويترك البريء', () => {
    // ما يجب أن يُمسَك — كما قد يكتبه مطوّرٌ فعلاً (`§8.8` الوجه الثاني)، لا كسرٌ على مقاس النمط.
    const GUILTY_POS = `const POS_TAX_RATE = 15;`;
    const GUILTY_RENT = `const RENT_VAT_RATE = 0.15;`;
    const GUILTY_MULTIPLY = `const tax = round2(sub * 0.15);`;
    const GUILTY_INCLUSIVE = `const t = round2((a * 15) / 115);`;
    const GUILTY_GROSS = `const gross = a * 1.15;`;
    const GUILTY_LINE = `lines.push({ description: '', quantity: 1, unitPrice: 0, taxRate: 15 });`;
    const GUILTY_JSX = `const el = <option value={15}>{15}٪</option>;`;
    expect(rateLiteralOffences(GUILTY_POS)).toHaveLength(1);
    expect(rateLiteralOffences(GUILTY_RENT)).toHaveLength(1);
    expect(rateLiteralOffences(GUILTY_MULTIPLY)).toHaveLength(1);
    expect(rateLiteralOffences(GUILTY_INCLUSIVE)).toHaveLength(2);
    expect(rateLiteralOffences(GUILTY_GROSS)).toHaveLength(1);
    expect(rateLiteralOffences(GUILTY_LINE)).toHaveLength(1);
    expect(rateLiteralOffences(GUILTY_JSX).length).toBeGreaterThan(0);
    // وما يُترك: أيامٌ · شريحةٌ · نصٌّ · تعليقٌ · عرضٌ بلا علامةِ نسبة — وتعليقٌ يذكر الضريبة بجانب رقمٍ بريء.
    const INNOCENT_DAYS = `const NOTE_DEADLINE_DAYS = 15;`;
    const INNOCENT_SLICE = `const page = items.slice(0, 15);`;
    const INNOCENT_STRING = `const s = 'نسبة 15% مكتوبة نصاً';`;
    const INNOCENT_COMMENT = `// taxRate: 15 في تعليق`;
    const INNOCENT_JSX = `const el = <td>{15}</td>;`;
    const INNOCENT_COMMENT_NEARBY = `const MAX_ITEMS = 15; // يُعرض بجانب الضريبة`;
    expect(rateLiteralOffences(INNOCENT_DAYS)).toEqual([]);
    expect(rateLiteralOffences(INNOCENT_SLICE)).toEqual([]);
    expect(rateLiteralOffences(INNOCENT_STRING)).toEqual([]);
    expect(rateLiteralOffences(INNOCENT_COMMENT)).toEqual([]);
    expect(rateLiteralOffences(INNOCENT_JSX)).toEqual([]);
    expect(rateLiteralOffences(INNOCENT_COMMENT_NEARBY)).toEqual([]);
  });

  it('المصدران موجودان ومتطابقان: الخادمُ والواجهةُ يقولان الرقمَ نفسَه', () => {
    const [api, web] = SOURCES.map(declaredRate);
    expect(api).toBe(STANDARD_VAT_RATE);
    expect(web).toBe(STANDARD_VAT_RATE);
  });

  it('🔴 لا حرفيَّ من عائلة النسبة في سياق ضريبةٍ خارج المصدرين — في الخادم والواجهة', () => {
    const files = ROOTS.flatMap((r) => productionFiles(r)).filter((f) => !SOURCES.includes(f));
    // حارسٌ على المسبار: الشجرةُ تُقرأ فعلاً — مئاتُ الملفّات لا صفر (`ق-٣٨٨`).
    expect(files.length).toBeGreaterThan(400);
    const offences = files.flatMap((f) => rateLiteralOffences(readFileSync(f, 'utf8'), f).map((o) => `${relative(REPO, f).split('\\').join('/')}:${o.line} ⟵ ${o.literal} في «${o.context}»`));
    expect(offences).toEqual([]);
  });
});
