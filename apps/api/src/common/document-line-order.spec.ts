import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { Prisma } from '@prisma/client';
import { readsDeclaredStrings, sourceFiles } from './source-scan.util';
import { LINE_ORDER, numberLines } from './document-lines.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): الشيفرةُ تُقرأ **شجرةً** (`typescript`) لا نصّاً — فاستدعاءٌ
// مكتوبٌ في تعليقٍ أو سلسلةٍ ليس عقدةَ استدعاءٍ أصلاً، ولا يحتاج تجريداً.
readsDeclaredStrings();

/**
 * **كلُّ قراءةٍ لسطور مستندٍ مرقَّمة تمرّ بترتيبها المعلَن** (`ق-١٤١٢` · مكسورُ اليوم ب في التوجيه ٢٦٣).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * `include: { lines: true }` على الفاتورة يعيد السطورَ **بترتيبها على القرص** — فأسقط اختبارَ الخصم
 * متقطّعاً (`[0,20]` بدل `[20,0]`)، وكان يمكن أن تُطبع فاتورةٌ بترتيبٍ غيرِ ما خُتمت به. **ورقمُ السطر
 * وحدَه لا يكفي**: عمودٌ لا تقرأ به قراءةٌ واحدةٌ منسيّة يُعيد العطلَ في موضعها.
 *
 * ── ما يحرسه — مشتقّاً لا مسروداً ─────────────────────────────────────────
 *
 * **النماذجُ المرقَّمة تُقرأ من المخطَّط** (كلُّ نموذجٍ يحمل `lineNo`)، **والعلاقاتُ إليها كذلك** (كلُّ حقلِ
 * قائمةٍ نوعُه نموذجٌ مرقَّم — `Invoice.lines` · `Quote.lines` · `InvoiceLine.returnedBy` · …) — فنموذجٌ
 * يُرقَّم غداً يدخل الحراسةَ بلا لمس هذا الملفّ. **ثم تُقرأ الشيفرةُ شجرةً**: كلُّ استدعاءٍ على مفوَّض Prisma
 * (`tx.invoice.findMany(…)`) أو يمرّره إلى مساعد (`pagedFindMany(q, tx.quote, …)`) يُتتبَّع `include`/`select`
 * فيه نزولاً بنماذج المخطَّط — **وعلاقةٌ إلى سطورٍ مرقَّمة بلا `LINE_ORDER` (أو `orderBy` على `lineNo`) تُدان**.
 * والثوابتُ في الملفّ نفسِه تُحَلّ (`INVOICE_INCLUDE` · `...QUOTE_INCLUDE`).
 *
 * ── حدودُه المعلَنة ───────────────────────────────────────────────────────
 *
 * ⚠️ **① ثابتٌ مستورَدٌ من ملفٍّ آخر لا يُحَلّ** — إلا `LINE_ORDER` نفسُه؛ فـ`include` يُبنى في ملفٍّ ويُستعمل
 * في آخر لا يُرى. **ومقيسٌ اليوم صفراً**: الثوابتُ كلُّها محلّيةٌ في ملفّاتها.
 * ⚠️ **② وما يُبنى ديناميكياً** (مفتاحٌ محسوب · كائنٌ من دالّة) لا يُرى — **يفرض الشكلَ لا النيّة**.
 * ⚠️ **③ والكتابةُ خارجه**: رقمُ السطر عند الإنشاء يحرسه العمودُ نفسُه (`NOT NULL` بلا افتراض + فريد).
 */

const SRC = join(__dirname, '..');

const models = Prisma.dmmf.datamodel.models;
const modelByName = new Map(models.map((m) => [m.name, m]));
/** النماذجُ ذاتُ السطور المرقَّمة — كلُّ نموذجٍ يحمل `lineNo`. */
export const NUMBERED_MODELS = new Set(models.filter((m) => m.fields.some((f) => f.name === 'lineNo')).map((m) => m.name));
const delegateToModel = new Map(models.map((m) => [m.name.charAt(0).toLowerCase() + m.name.slice(1), m.name]));
const QUERY_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'update',
  'upsert',
  'delete',
  'createManyAndReturn',
  'updateManyAndReturn',
]);

export interface LineOrderOffence {
  file: string;
  line: number;
  relation: string;
}

export interface LineOrderScan {
  offences: LineOrderOffence[];
  /** كلُّ قراءةٍ لعلاقةٍ مرقَّمةٍ رآها الحارس — مرتّبةً أو لا (سطحُ الإثبات). */
  seen: string[];
}

const unwrap = (e: ts.Expression): ts.Expression => {
  let x = e;
  while (ts.isAsExpression(x) || ts.isParenthesizedExpression(x) || ts.isSatisfiesExpression(x) || ts.isNonNullExpression(x)) x = x.expression;
  return x;
};

const keyOf = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;

/** يمسح مصدراً واحداً — مُصدَّرٌ ليُثبت بحالتَين معلومتَين. */
export function scanLineOrder(source: string, file = '<inline>'): LineOrderScan {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const offences: LineOrderOffence[] = [];
  const seen: string[] = [];

  // الثوابتُ في الملفّ — اسمٌ يتكرّر لا يُحَلّ (غامض)، فلا يُنسب إلى أحدهما.
  const consts = new Map<string, ts.Expression | null>();
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      consts.set(n.name.text, consts.has(n.name.text) ? null : unwrap(n.initializer));
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const resolve = (e: ts.Expression, depth = 0): ts.Expression | null => {
    const x = unwrap(e);
    if (ts.isIdentifier(x) && depth < 8) {
      const target = consts.get(x.text);
      return target ? resolve(target, depth + 1) : null;
    }
    return x;
  };

  const isLineOrder = (e: ts.Expression) => {
    const x = unwrap(e);
    return ts.isIdentifier(x) && x.text === 'LINE_ORDER';
  };

  /** قيمةُ العلاقة المرقَّمة: `LINE_ORDER` أو كائنٌ يحمله أو يرتّب بـ`lineNo`. */
  const ordered = (value: ts.Expression): boolean => {
    if (isLineOrder(value)) return true;
    const x = resolve(value);
    if (!x || !ts.isObjectLiteralExpression(x)) return false;
    return x.properties.some(
      (p) =>
        (ts.isSpreadAssignment(p) && (isLineOrder(p.expression) || ordered(p.expression))) ||
        (ts.isPropertyAssignment(p) && keyOf(p.name) === 'orderBy' && /\blineNo\b/.test(p.initializer.getText(sf))),
    );
  };

  const walkArgs = (e: ts.Expression, model: string, depth: number): void => {
    if (depth > 12) return;
    const x = resolve(e);
    if (!x || !ts.isObjectLiteralExpression(x)) return;
    for (const p of x.properties) {
      if (ts.isSpreadAssignment(p)) walkArgs(p.expression, model, depth + 1);
      else if (ts.isPropertyAssignment(p) && (keyOf(p.name) === 'include' || keyOf(p.name) === 'select')) walkSelection(p.initializer, model, depth + 1);
    }
  };

  const walkSelection = (e: ts.Expression, model: string, depth: number): void => {
    if (depth > 12) return;
    const x = resolve(e);
    if (!x || !ts.isObjectLiteralExpression(x)) return;
    for (const p of x.properties) {
      if (ts.isSpreadAssignment(p)) {
        walkSelection(p.expression, model, depth + 1);
        continue;
      }
      if (!ts.isPropertyAssignment(p)) continue;
      const key = keyOf(p.name);
      const field = key ? modelByName.get(model)?.fields.find((f) => f.name === key) : undefined;
      if (!field || field.kind !== 'object') continue;
      const value = unwrap(p.initializer);
      if (field.isList && NUMBERED_MODELS.has(field.type)) {
        const where = `${model}.${key}`;
        seen.push(where);
        if (!ordered(value)) offences.push({ file, line: sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1, relation: where });
      }
      if (value.kind !== ts.SyntaxKind.TrueKeyword) walkArgs(value, field.type, depth + 1);
    }
  };

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isPropertyAccessExpression(callee) && QUERY_OPS.has(callee.name.text) && ts.isPropertyAccessExpression(callee.expression)) {
        // tx.invoice.findMany({...})
        const model = delegateToModel.get(callee.expression.name.text);
        if (model && n.arguments[0]) walkArgs(n.arguments[0], model, 0);
      } else {
        // pagedFindMany(query, tx.quote, {...}) — المفوَّضُ يُمرَّر، والوسائطُ بعده.
        const at = n.arguments.findIndex((a) => ts.isPropertyAccessExpression(a) && delegateToModel.has(a.name.text));
        if (at >= 0) {
          const model = delegateToModel.get((n.arguments[at] as ts.PropertyAccessExpression).name.text)!;
          for (const a of n.arguments.slice(at + 1)) walkArgs(a, model, 0);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { offences, seen };
}

describe('سطورُ المستند تُقرأ بترتيبها المعلَن — حارسٌ مشتقٌّ يمسح الشجرة (ق-١٤١٢)', () => {
  it('المصدرُ الواحد: الترتيبُ على رقم السطر، والترقيمُ 1..n بترتيب الإدخال', () => {
    expect(LINE_ORDER).toEqual({ orderBy: { lineNo: 'asc' } });
    expect(numberLines([{ d: 'أ' }, { d: 'ب' }, { d: 'ج' }]).map((l) => l.lineNo)).toEqual([1, 2, 3]);
  });

  it('المشتقُّ من المخطَّط: الفاتورةُ والعرضُ مرقَّمان — وإلا فالحارسُ يحرس العدم', () => {
    expect([...NUMBERED_MODELS].sort()).toEqual(expect.arrayContaining(['InvoiceLine', 'QuoteLine']));
  });

  it('المكتشِف مُثبَت بحالتَين: يمسك القراءةَ بلا ترتيب ويترك المرتّبة — بالصياغة الواقعية', () => {
    // ⚠️ **الصياغةُ الواقعية** — منقولةٌ عن `invoices.service` قبل الإصلاح: ثابتٌ محلّيٌّ يُستعمل في إنشاء.
    const before = [
      'const INVOICE_INCLUDE = { customer: true, lines: true } as const;',
      'async function f(tx: any) {',
      '  return tx.invoice.create({ data: {}, include: INVOICE_INCLUDE });',
      '}',
    ].join('\n');
    const caught = scanLineOrder(before);
    expect(caught.offences.map((o) => o.relation)).toEqual(['Invoice.lines']);

    const after = before.replace('lines: true', 'lines: LINE_ORDER');
    expect(scanLineOrder(after).offences).toEqual([]);
    expect(scanLineOrder(after).seen).toEqual(['Invoice.lines']);

    // والمساعدُ الذي يُمرَّر إليه المفوَّض — كقائمة العروض.
    const helper = 'const Q = { lines: true };\nfunction g(tx: any, q: any) { return pagedFindMany(q, tx.quote, { include: Q }); }';
    expect(scanLineOrder(helper).offences.map((o) => o.relation)).toEqual(['Quote.lines']);

    // والمتداخلُ عبر علاقة — سطورُ فاتورةٍ تُقرأ من التخصيص.
    const nested = 'function h(tx: any) { return tx.paymentAllocation.findMany({ include: { invoice: { include: { lines: true } } } }); }';
    expect(scanLineOrder(nested).offences.map((o) => o.relation)).toEqual(['Invoice.lines']);

    // و`orderBy` على غير رقم السطر ليس الترتيبَ المعلَن.
    const wrongKey = "function k(tx: any) { return tx.quote.findUnique({ where: {}, include: { lines: { orderBy: { createdAt: 'asc' } } } }); }";
    expect(scanLineOrder(wrongKey).offences.map((o) => o.relation)).toEqual(['Quote.lines']);

    // وسطورُ نموذجٍ غيرِ مرقَّم (سطورُ القيد) خارجُه — فلا يُدان ما ليس له.
    expect(scanLineOrder('function j(tx: any) { return tx.journalEntry.findMany({ include: { lines: true } }); }').seen).toEqual([]);
  });

  const scans = sourceFiles(SRC).map((f) => ({ file: relative(SRC, f).split('\\').join('/'), scan: scanLineOrder(readFileSync(f, 'utf8'), relative(SRC, f).split('\\').join('/')) }));

  it('السطحُ غير فارغ — قراءاتُ السطور المرقَّمة تُرى فعلاً في مواضعها المعروفة', () => {
    const where = scans.filter((s) => s.scan.seen.length > 0).map((s) => s.file);
    const total = scans.reduce((n, s) => n + s.scan.seen.length, 0);
    console.log(`line-order guard: ${total} قراءةً لسطورٍ مرقَّمة في ${where.length} ملفّاً`);
    expect(where).toEqual(expect.arrayContaining(['invoices/invoices.service.ts', 'quotes/quotes.service.ts', 'pos/pos.service.ts', 'zatca/zatca.service.ts']));
  });

  it('🔴 كلُّ قراءةٍ لسطور مستندٍ مرقَّمة تمرّ بـLINE_ORDER', () => {
    const offences = scans.flatMap((s) => s.scan.offences).map((o) => `${o.file}:${o.line} ${o.relation}`);
    expect(offences).toEqual([]);
  });
});
