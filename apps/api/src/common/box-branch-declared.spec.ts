import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { readsDeclaredStrings, sourceFiles } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): الإعلانُ يعيش في تعليق التابع، والشيفرةُ تُقرأ شجرةً (`typescript`) لا نصّاً.
readsDeclaredStrings();

/**
 * 🔴 **كلُّ كتابةٍ تضع صندوقاً على مستندٍ ذي فرعٍ تقيسه بفرعه — أو تُعلن لماذا لا** (`ق-١٤٣٧`).
 *
 * **العلّة**: المخطَّطُ يقول إن صندوقَ الفرع صفُّ `Bank` يشير إليه، **والشيفرةُ كانت تقرأ الصندوقَ بمعرّفه ولا تقيسه**:
 * سندُ قبضٍ في الشمال بصندوق الجنوب كان يمضي `201`. فأُصلحت سبعةُ مواضع بـ`assertBoxInBranch` — **والحارسُ يمنع
 * الثامن**: كلُّ `create`/`update`/`upsert` على نموذجٍ **يحمل الفرع وصندوقاً** (`Bank`/`CashDrawer` — **مشتقٌّ من
 * المخطَّط لا من قائمة**) ويضع `bankId` أو `drawerId`، يمرّ تابعُه بـ`assertBoxInBranch` **أو يُعلن في تعليقه**
 * «**صندوقُه لا يُقاس هنا**» وسببَه (مرآةُ أصلٍ قيس · مستندٌ بلا فرعٍ خارجَ الحكم · درجٌ يُقاس في موضعٍ أشدّ).
 *
 * ⚠️ **حدودُه المعلَنة**: وحدةُ الحكم التابعُ لا الاستدعاء (كنظيره `ق-٥١٧`) · ويفرض الإعلانَ لا صحّتَه · والكتابةُ
 * عبر `data` متغيّرٍ تُقرأ بإسناداتِ `.bankId =`/`.drawerId =` في التابع نفسِه.
 */
const SRC = join(__dirname, '..');
const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

export const BOX_DECLARATION = 'صندوقُه لا يُقاس هنا';
export const MIN_REASON_LENGTH = 20;
const WRITE_OPS = new Set(['create', 'update', 'upsert', 'createMany', 'updateMany']);
const BOX_FIELDS = new Set(['bankId', 'drawerId']);

/** النماذجُ التي تحمل الفرعَ **وصندوقاً** — من المخطَّط لا من قائمة. */
export function boxBearingModels(schema: string): string[] {
  const out: string[] = [];
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const body = m[2];
    if (/^\s*branchId\s+String/m.test(body) && /^\s*\w+\s+(?:Bank|CashDrawer)\??\s+@relation\(fields:/m.test(body)) out.push(m[1]);
  }
  return out.sort();
}

const clientProperty = (model: string): string => model[0].toLowerCase() + model.slice(1);

function enclosingScope(node: ts.Node): ts.Node {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isConstructorDeclaration(p)) return p;
    if (ts.isVariableStatement(p) && ts.isSourceFile(p.parent)) return p;
    if (ts.isSourceFile(p)) return p;
    p = p.parent;
  }
  return node.getSourceFile();
}

function scopeName(scope: ts.Node): string {
  if (ts.isMethodDeclaration(scope)) {
    const cls = scope.parent && ts.isClassDeclaration(scope.parent) ? scope.parent.name?.text ?? 'class' : 'class';
    return `${cls}.${scope.name.getText()}`;
  }
  if (ts.isFunctionDeclaration(scope)) return `function ${scope.name?.text ?? '(anonymous)'}`;
  if (ts.isVariableStatement(scope)) return `const ${scope.declarationList.declarations[0]?.name.getText() ?? '?'}`;
  return '<module>';
}

const unwrap = (e: ts.Expression): ts.Expression => {
  let x = e;
  while (ts.isAsExpression(x) || ts.isParenthesizedExpression(x) || ts.isTypeAssertionExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
  return x;
};

/** هل يضع هذا الكائنُ صندوقاً — مفتاحاً صريحاً، أو نشراً لا يُرى ما فيه (يُحسب واضعاً احتياطاً). */
function objectSetsBox(obj: ts.ObjectLiteralExpression): boolean {
  return obj.properties.some(
    (p) => ts.isSpreadAssignment(p) || ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) && BOX_FIELDS.has(p.name.text)),
  );
}

/** إسنادُ `<x>.bankId = …` في التابع — لكتابةٍ تمرّر `data` متغيّراً. */
function scopeAssignsBox(scope: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && BOX_FIELDS.has(n.left.name.text)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(scope);
  return found;
}

function writeSetsBox(call: ts.CallExpression, scope: ts.Node): boolean {
  const arg = call.arguments[0] ? unwrap(call.arguments[0]) : undefined;
  if (!arg || !ts.isObjectLiteralExpression(arg)) return scopeAssignsBox(scope);
  const PAYLOAD = ['data', 'create', 'update'];
  // ⚠️ والمختصرُ (`{ where, data }`) متغيّرٌ لا كائن — أمسكه مسبارُ المُكتشِف قبل الالتزام: كان يُقرأ «لا يضع».
  if (arg.properties.some((p) => ts.isShorthandPropertyAssignment(p) && PAYLOAD.includes(p.name.text)) && scopeAssignsBox(scope)) return true;
  const payloads = arg.properties
    .filter((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && PAYLOAD.includes(p.name.text))
    .map((p) => unwrap(p.initializer));
  return payloads.some((d) => {
    if (ts.isObjectLiteralExpression(d)) return objectSetsBox(d);
    if (ts.isArrayLiteralExpression(d)) return d.elements.some((e) => ts.isObjectLiteralExpression(unwrap(e)) && objectSetsBox(unwrap(e) as ts.ObjectLiteralExpression));
    return scopeAssignsBox(scope);
  });
}

function callsAssert(scope: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'assertBoxInBranch') found = true;
    else ts.forEachChild(n, visit);
  };
  visit(scope);
  return found;
}

function declaredReason(scope: ts.Node, text: string): string | null {
  const pos = ts.isSourceFile(scope) ? 0 : scope.getFullStart();
  const doc = (ts.getLeadingCommentRanges(text, pos) ?? []).map((r) => text.slice(r.pos, r.end)).join('\n');
  const at = doc.indexOf(BOX_DECLARATION);
  if (at === -1) return null;
  return doc
    .slice(at + BOX_DECLARATION.length)
    .replace(/\*\/[\s\S]*$/, '')
    .replace(/^\s*\*+\s?/gm, '')
    .replace(/^[\s*:：—-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface BoxWrite {
  line: number;
  model: string;
  op: string;
  scope: string;
  setsBox: boolean;
  asserted: boolean;
  reason: string | null;
}

export function boxWrites(source: string, models: string[], file = 'inline.ts'): BoxWrite[] {
  const props = new Map(models.map((m) => [clientProperty(m), m]));
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: BoxWrite[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const op = n.expression.name.text;
      const target = n.expression.expression;
      if (WRITE_OPS.has(op) && ts.isPropertyAccessExpression(target) && props.has(target.name.text)) {
        const scope = enclosingScope(n);
        out.push({
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          model: props.get(target.name.text)!,
          op,
          scope: scopeName(scope),
          setsBox: writeSetsBox(n, scope),
          asserted: callsAssert(scope),
          reason: declaredReason(scope, source),
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export function undeclaredBoxWrites(source: string, models: string[], file = 'inline.ts'): BoxWrite[] {
  return boxWrites(source, models, file).filter((w) => w.setsBox && !w.asserted && (w.reason === null || w.reason.length < MIN_REASON_LENGTH));
}

describe('كتابةُ الصندوق على مستندٍ ذي فرعٍ تقيسه بفرعه أو تُعلن لماذا (ق-١٤٣٧)', () => {
  const MODELS = boxBearingModels(SCHEMA);
  const WRITES: (BoxWrite & { file: string })[] = [];
  for (const f of sourceFiles(SRC)) {
    const file = relative(SRC, f).replace(/\\/g, '/');
    for (const w of boxWrites(readFileSync(f, 'utf8'), MODELS, f)) WRITES.push({ ...w, file });
  }

  it('⓪ السطحُ غيرُ فارغ — النماذجُ والكتاباتُ موجودةٌ فعلاً', () => {
    expect(MODELS).toEqual(expect.arrayContaining(['Payment', 'SupplierPayment', 'BankTransaction', 'CashDeposit', 'NetworkSettlement', 'PosShift']));
    expect(MODELS).not.toContain('Invoice');
    expect(WRITES.filter((w) => w.setsBox).length).toBeGreaterThanOrEqual(8);
    expect(WRITES.filter((w) => w.setsBox && w.asserted).length).toBeGreaterThanOrEqual(6);
  });

  it('🔴 لا كتابةَ تضع صندوقاً على مستندٍ ذي فرعٍ بلا قياسٍ ولا إعلان', () => {
    const bad = WRITES.filter((w) => w.setsBox && !w.asserted && (w.reason === null || w.reason.length < MIN_REASON_LENGTH));
    if (bad.length > 0) {
      throw new Error(
        [
          `⛔ ${bad.length} كتابةً تضع صندوقاً بلا قياسٍ بفرع المستند ولا إعلان:`,
          ...bad.map((w) => `   ${w.file}:${w.line}  ${w.scope}  ${w.model}.${w.op}`),
          '',
          'إمّا قِسها: `await assertBoxInBranch(tx, <فرعُ المستند>, <الصندوق>)` — المصدرُ الواحد في `branches/branch-scope.util`؛',
          `وإمّا أعلن في تعليق التابع: **${BOX_DECLARATION}**: <لماذا — مرآةُ أصلٍ قيس · مستندٌ بلا فرع · قياسٌ أشدّ في موضعٍ آخر>.`,
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });

  it('🔴 والمُكتشِفُ مُثبَتٌ بحالاتٍ مصنوعة: يُدين غيرَ المقيس وغيرَ المُعلِن ويترك سواهما', () => {
    const models = ['Payment'];
    // ⚠️ الصياغةُ منقولةٌ عن الخدمة — `data` كائنٌ بمفتاح الصندوق ومحوَّلٌ بـ`as`.
    const unasserted = ['class PaymentsService {', '  create(tx: Tx, dto: Dto) {', '    return tx.payment.create({ data: { bankId: dto.bankId, branchId: dto.branchId } as unknown as Input });', '  }', '}'].join('\n');
    expect(undeclaredBoxWrites(unasserted, models).map((w) => `${w.scope} ${w.model}.${w.op}`)).toEqual(['PaymentsService.create Payment.create']);

    const asserted = ['class PaymentsService {', '  async create(tx: Tx, dto: Dto) {', '    await assertBoxInBranch(tx, dto.branchId, bank);', '    return tx.payment.create({ data: { bankId: dto.bankId } });', '  }', '}'].join('\n');
    expect(undeclaredBoxWrites(asserted, models)).toEqual([]);

    const declared = ['class PaymentsService {', `  /** **${BOX_DECLARATION}**: العكسُ مرآةُ أصله، وصندوقُه قيس عند إنشاء الأصل. */`, '  reverse(tx: Tx, o: P) {', '    return tx.payment.create({ data: { bankId: o.bankId } });', '  }', '}'].join('\n');
    expect(undeclaredBoxWrites(declared, models)).toEqual([]);

    // وكتابةٌ لا تضع صندوقاً ليست من السطح — ولو كانت على النموذج نفسِه.
    const unrelated = ['class PaymentsService {', '  link(tx: Tx, id: string) {', '    return tx.payment.update({ where: { id }, data: { journalEntryId: "x" } });', '  }', '}'].join('\n');
    expect(undeclaredBoxWrites(unrelated, models)).toEqual([]);

    // و`data` متغيّرٌ يُسنَد إليه الصندوقُ في التابع — يُقرأ واضعاً.
    const variable = ['class TransactionsService {', '  update(tx: Tx, id: string, dto: Dto) {', '    const data: D = {};', '    if (dto.bankId) data.bankId = dto.bankId;', '    return tx.payment.update({ where: { id }, data });', '  }', '}'].join('\n');
    expect(undeclaredBoxWrites(variable, models).map((w) => w.scope)).toEqual(['TransactionsService.update']);
  });
});
