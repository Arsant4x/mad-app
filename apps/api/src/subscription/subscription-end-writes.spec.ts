import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { readsDeclaredStrings, sourceFiles } from '../common/source-scan.util';

// Raw SQL is read inside string literals on purpose, so this guard reads strings.
readsDeclaredStrings();

/**
 * Subscription time is money: the only code that may move a company's subscription end is a method
 * that first consumes a two person platform decision. A company is born with an end equal to its start.
 * Any other write of `subEnd` under src fails this guard.
 */
const SRC = join(__dirname, '..');
export const DECISION_CALL = /\bdecisions\.consume\(\s*'SUBSCRIPTION_CHANGE'/;
const WRITE_KEYS = new Set(['data', 'create', 'update']);
const SQL_WRITE = /\b(UPDATE|INSERT|SET)\b[\s\S]*"subEnd"|"subEnd"[\s\S]*\b(UPDATE|SET)\b/i;

export interface EndWrite {
  line: number;
  scope: string;
  kind: 'property' | 'assignment' | 'sql';
}

function enclosingScope(node: ts.Node): ts.Node {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isConstructorDeclaration(p)) return p;
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
  return '<module>';
}

/** True when the object literal sits under a `data`, `create` or `update` key, that is, inside a write payload. */
function insideWritePayload(obj: ts.ObjectLiteralExpression): boolean {
  let p: ts.Node | undefined = obj.parent;
  while (p && !ts.isSourceFile(p) && !ts.isFunctionLike(p)) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && WRITE_KEYS.has(p.name.text)) return true;
    p = p.parent;
  }
  return false;
}

/** `subEnd: x` next to `subStart: x` with the same plain identifier: an end equal to the start grants no time. */
function equalsSiblingStart(prop: ts.PropertyAssignment, obj: ts.ObjectLiteralExpression): boolean {
  if (!ts.isIdentifier(prop.initializer)) return false;
  const value = prop.initializer.text;
  return obj.properties.some(
    (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'subStart' && ts.isIdentifier(p.initializer) && p.initializer.text === value,
  );
}

export function subscriptionEndWrites(source: string, file = 'inline.ts'): (EndWrite & { allowed: boolean })[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: (EndWrite & { allowed: boolean })[] = [];
  const record = (node: ts.Node, kind: EndWrite['kind'], equalStart = false) => {
    const scope = enclosingScope(node);
    out.push({
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      scope: scopeName(scope),
      kind,
      allowed: equalStart || DECISION_CALL.test(scope.getText(sf)),
    });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n) && insideWritePayload(n)) {
      for (const p of n.properties) {
        if (ts.isShorthandPropertyAssignment(p) && p.name.text === 'subEnd') record(p, 'property');
        if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'subEnd') record(p, 'property', equalsSiblingStart(p, n));
      }
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'subEnd') {
      record(n, 'assignment');
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && SQL_WRITE.test(n.getText(sf))) {
      record(n, 'sql');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('subscription end is written only on the two person decision path', () => {
  const WRITES: (EndWrite & { allowed: boolean; file: string })[] = [];
  for (const f of sourceFiles(SRC)) {
    const file = relative(SRC, f).replace(/\\/g, '/');
    for (const w of subscriptionEndWrites(readFileSync(f, 'utf8'), f)) WRITES.push({ ...w, file });
  }

  it('reads real writes: the decision path and the company birth are both seen', () => {
    expect(WRITES.some((w) => w.file === 'companies/companies.service.ts' && w.scope === 'CompaniesService.updateSubscription' && w.allowed)).toBe(true);
    expect(WRITES.some((w) => w.file === 'companies/create-company-account.ts')).toBe(true);
  });

  it('no code moves the subscription end outside the decision path', () => {
    const bad = WRITES.filter((w) => !w.allowed).map((w) => `${w.file}:${w.line} ${w.scope} (${w.kind})`);
    expect(bad).toEqual([]);
  });

  it('the detector flags a forward write and leaves the decision path and an end equal to the start', () => {
    const renew = [
      'class SubscriptionService {',
      '  async renew(id: string, months: number) {',
      '    const end = addMonths(new Date(), months);',
      '    await this.prisma.company.update({ where: { id }, data: { subEnd: end, status: "ACTIVE" } });',
      '  }',
      '}',
    ].join('\n');
    expect(subscriptionEndWrites(renew).filter((w) => !w.allowed).map((w) => w.scope)).toEqual(['SubscriptionService.renew']);

    const trial = 'function createCompanyAccount(p, i) { const start = new Date(); return p.company.create({ data: { subStart: start, subEnd: addDays(start, 14) } }); }';
    expect(subscriptionEndWrites(trial).filter((w) => !w.allowed).map((w) => w.scope)).toEqual(['function createCompanyAccount']);

    const nested = 'function birth(p, s, e) { return p.loginIdentity.create({ data: { company: { create: { subStart: s, subEnd } } } }); }';
    expect(subscriptionEndWrites(nested).filter((w) => !w.allowed)).toHaveLength(1);

    const assigned = 'function patch(p, id) { const data: any = {}; data.subEnd = new Date(2099, 0, 1); return p.company.update({ where: { id }, data }); }';
    expect(subscriptionEndWrites(assigned).filter((w) => !w.allowed)).toHaveLength(1);

    const raw = 'function raw(p) { return p.$executeRaw`UPDATE companies SET "subEnd" = now() + interval \'1 year\'`; }';
    expect(subscriptionEndWrites(raw).filter((w) => !w.allowed)).toHaveLength(1);

    const decided = [
      'class CompaniesService {',
      '  async updateSubscription(id: string, dto: Dto) {',
      "    await this.decisions.consume('SUBSCRIPTION_CHANGE', id);",
      '    return this.prisma.company.update({ where: { id }, data: { subEnd: new Date(dto.subEnd) } });',
      '  }',
      '}',
    ].join('\n');
    expect(subscriptionEndWrites(decided).filter((w) => !w.allowed)).toEqual([]);

    const born = 'function birth(p) { const born = new Date(); return p.company.create({ data: { subStart: born, subEnd: born } }); }';
    expect(subscriptionEndWrites(born).filter((w) => !w.allowed)).toEqual([]);

    const read = 'function view(c) { return { subEnd: c.subEnd ? c.subEnd.toISOString() : null }; } function q(p) { return p.company.findMany({ select: { subEnd: true } }); }';
    expect(subscriptionEndWrites(read)).toEqual([]);
  });
});
