import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { sourceFiles } from './source-scan.util';

/**
 * A posting, document, movement or due-date cutoff takes the company's day (companyToday in company-day.util.ts),
 * not the UTC one. A Date compared with or written to a `@db.Date` column is cut to its UTC day, so "now" in the hours
 * before UTC midnight is still yesterday for a company east of UTC: a nightly sweep just after the company's midnight
 * then books what fell due that day a full run late, and a status or a fiscal year is chosen on the day before.
 *
 * The guard reads the syntax tree of every file under src and flags a "UTC today" (`new Date()`, `dayStartOf(new Date())`,
 * `dayEndOf(new Date())`, `toDateOnly(new Date())`, `startOfDay(new Date())`, `new Date().toISOString().slice(0, 10)`)
 * used as a cutoff:
 *   - an argument whose declared parameter is named as a cutoff (asOf, today, cutoff, upTo, dueBy, onDay),
 *   - the default of such a parameter, or a variable of such a name,
 *   - a value written to, or a filter on, a column that is `@db.Date` in every model of schema.prisma,
 *   - one side of a comparison whose other side reads such a column.
 *
 * Its limits: it reads names, not types, so a "UTC today" held in a variable of another name and passed on is not seen,
 * and a column name that is a timestamp in some model is left out. Sites that must stay on the UTC day are listed with
 * their reason; sites found and not fixed yet are listed as debt, which may only shrink.
 */
const SRC = join(__dirname, '..');
const API = join(__dirname, '..', '..');

export const CUTOFF_NAMES = ['asOf', 'today', 'cutoff', 'upTo', 'dueBy', 'onDay'] as const;
const DAY_OF_NOW = ['dayStartOf', 'dayEndOf', 'toDateOnly', 'startOfDay'];
const FILTER_KEYS = new Set(['lt', 'lte', 'gt', 'gte', 'equals', 'not']);
const COMPARISONS = new Set([ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken]);

/** Column names that are `@db.Date` in every model that has them. */
export function dateColumns(schema: string): Set<string> {
  const seen = new Map<string, { date: number; stamp: number }>();
  for (const line of schema.split(/\r?\n/)) {
    const m = line.match(/^\s+([a-zA-Z]\w*)\s+DateTime\??(\s.*)?$/);
    if (!m) continue;
    const entry = seen.get(m[1]) ?? { date: 0, stamp: 0 };
    if (/@db\.Date\b/.test(m[2] ?? '')) entry.date += 1;
    else entry.stamp += 1;
    seen.set(m[1], entry);
  }
  return new Set([...seen].filter(([, e]) => e.date > 0 && e.stamp === 0).map(([name]) => name));
}

/** Parameter positions named as a cutoff, by function or method name, across the given sources. */
export function cutoffParameters(sources: string[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const names = new Set<string>(CUTOFF_NAMES);
  const add = (name: string | undefined, params: ts.NodeArray<ts.ParameterDeclaration>) => {
    if (!name) return;
    params.forEach((p, i) => {
      if (ts.isIdentifier(p.name) && names.has(p.name.text)) {
        const set = out.get(name) ?? new Set<number>();
        set.add(i);
        out.set(name, set);
      }
    });
  };
  for (const source of sources) {
    const sf = ts.createSourceFile('scan.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (n: ts.Node): void => {
      if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) add(n.name?.getText(sf), n.parameters);
      else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
        add(n.name.text, n.initializer.parameters);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

function isNewDateNow(n: ts.Node): boolean {
  return ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Date' && (n.arguments?.length ?? 0) === 0;
}

function calleeName(call: ts.CallExpression): string | null {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** The UTC day of now, in one of the shapes the code writes it. */
function isUtcToday(n: ts.Node): boolean {
  while (ts.isParenthesizedExpression(n) || ts.isAwaitExpression(n)) n = n.expression;
  if (isNewDateNow(n)) return true;
  if (ts.isCallExpression(n)) {
    const name = calleeName(n);
    if (name && DAY_OF_NOW.includes(name) && n.arguments.length === 1 && isNewDateNow(n.arguments[0])) return true;
    // new Date().toISOString().slice(0, 10)
    if (name === 'slice' && ts.isPropertyAccessExpression(n.expression)) {
      const target = n.expression.expression;
      if (ts.isCallExpression(target) && calleeName(target) === 'toISOString' && ts.isPropertyAccessExpression(target.expression) && isNewDateNow(target.expression.expression)) return true;
    }
  }
  return false;
}

function isZeroLiteral(n: ts.Node): boolean {
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  if (ts.isNumericLiteral(n)) return Number(n.text) === 0;
  if (ts.isConditionalExpression(n)) return isZeroLiteral(n.whenTrue) || isZeroLiteral(n.whenFalse);
  return false;
}

/** The day of an instant read with no offset or an offset of zero, which is its UTC day: `localDateOf(at, known ? o : 0)`. */
function isZeroOffsetDay(n: ts.Node): boolean {
  while (ts.isParenthesizedExpression(n) || ts.isAwaitExpression(n)) n = n.expression;
  if (!ts.isCallExpression(n)) return false;
  const name = calleeName(n);
  if (name === 'localDateOf' || name === 'wallClockOf') return n.arguments.length === 2 && isZeroLiteral(n.arguments[1]);
  if (name === 'dayStartOf' || name === 'dayEndOf' || name === 'localYearOf') return n.arguments.length === 1 || (n.arguments.length === 2 && isZeroLiteral(n.arguments[1]));
  return false;
}

/** A "UTC today" anywhere in a conditional's branches, so `x ? y : new Date()` is seen. */
function holdsUtcToday(n: ts.Node): boolean {
  if (isUtcToday(n)) return true;
  if (ts.isConditionalExpression(n)) return holdsUtcToday(n.whenTrue) || holdsUtcToday(n.whenFalse);
  if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    return holdsUtcToday(n.left) || holdsUtcToday(n.right);
  }
  return false;
}

function propertyName(n: ts.PropertyName): string | null {
  if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text;
  return null;
}

/** The name a read ends with: `x.dueDate` and `dueDate` are both `dueDate`. */
function readName(n: ts.Expression): string | null {
  while (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n)) n = n.expression;
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isPropertyAccessExpression(n)) return n.name.text;
  return null;
}

function scopeName(node: ts.Node): string {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p)) {
      const cls = p.parent && ts.isClassDeclaration(p.parent) ? (p.parent.name?.text ?? 'class') : 'class';
      return `${cls}.${p.name.getText()}`;
    }
    if (ts.isConstructorDeclaration(p)) return `${(p.parent as ts.ClassDeclaration).name?.text ?? 'class'}.constructor`;
    if (ts.isFunctionDeclaration(p)) return `function ${p.name?.text ?? '(anonymous)'}`;
    if (ts.isVariableStatement(p) && ts.isSourceFile(p.parent)) return `const ${p.declarationList.declarations[0]?.name.getText() ?? '?'}`;
  }
  return '<module>';
}

export interface UtcCutoff {
  line: number;
  scope: string;
  /** What the "UTC today" feeds: `arg asOf of f`, `default asOf`, `const today`, `column dueDate`, `compare start`. */
  use: string;
}

export function utcCutoffs(source: string, ctx: { columns: Set<string>; parameters: Map<string, Set<number>> }, file = 'inline.ts'): UtcCutoff[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set<string>(CUTOFF_NAMES);
  const out: UtcCutoff[] = [];
  const record = (n: ts.Node, use: string) => out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, scope: scopeName(n), use });

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const name = calleeName(n);
      const positions = name ? ctx.parameters.get(name) : undefined;
      if (positions) n.arguments.forEach((a, i) => positions.has(i) && holdsUtcToday(a) && record(a, `arg ${i} of ${name}`));
    }
    if (ts.isParameter(n) && ts.isIdentifier(n.name) && names.has(n.name.text) && n.initializer && holdsUtcToday(n.initializer)) record(n, `default ${n.name.text}`);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const held = n.name.text;
      if (names.has(held) && holdsUtcToday(n.initializer)) record(n, `const ${held}`);
      else if ((names.has(held) || ctx.columns.has(held)) && isZeroOffsetDay(n.initializer)) record(n, `const ${held} on the UTC day`);
    }
    // A document stamped with the server's own clock and no offset carries the UTC date.
    if (ts.isCallExpression(n) && calleeName(n) === 'wallClockOf' && n.arguments.length > 0 && isNewDateNow(n.arguments[0]) && isZeroOffsetDay(n)) record(n, 'stamp wallClockOf');
    if (ts.isPropertyAssignment(n)) {
      const key = propertyName(n.name);
      if (key && names.has(key) && holdsUtcToday(n.initializer)) record(n, `field ${key}`);
      else if (key && ctx.columns.has(key)) {
        if (holdsUtcToday(n.initializer)) record(n, `column ${key}`);
        else if (ts.isObjectLiteralExpression(n.initializer)) {
          for (const p of n.initializer.properties) {
            if (ts.isPropertyAssignment(p) && FILTER_KEYS.has(propertyName(p.name) ?? '') && holdsUtcToday(p.initializer)) record(p, `filter ${key}`);
          }
        }
      }
    }
    if (ts.isBinaryExpression(n) && COMPARISONS.has(n.operatorToken.kind)) {
      const other = holdsUtcToday(n.right) ? n.left : holdsUtcToday(n.left) ? n.right : null;
      const read = other ? readName(other) : null;
      if (read && ctx.columns.has(read)) record(n, `compare ${read}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Sites that must stay on the UTC day, with the reason. Keyed `file :: scope :: use`.
 */
const MUST_STAY_UTC: Record<string, string> = {
  'src/pos/pos.service.ts :: PosService.prepareSale :: const issueDate on the UTC day':
    'a sale from a terminal that sends no offset has no known wall clock, so it is dated on the UTC day as a declared limit',
  'src/zatca/zatca-onboarding.service.ts :: ZatcaOnboardingService.runComplianceChecks :: stamp wallClockOf':
    'compliance samples have no device; they are stamped in UTC with the Z suffix, a form the authority accepts',
  'src/trash/trash.service.ts :: TrashService.purgeExpired :: const cutoff':
    'the retention cutoff is compared with the deletion instant, a timestamp and not a day',
};

/**
 * Sites found on the UTC day and not fixed yet. It may only shrink: a fixed site is removed here, and a new one fails.
 */
const KNOWN_DEBT: string[] = [
  'src/contracts/contracts.service.ts :: ContractsService.applyUnpaidRentDeduction :: const asOf',
  'src/contracts/rent-recognition.service.ts :: RentRecognitionService.runForCompany :: default asOf',
  'src/contracts/rent-recognition.service.ts :: RentRecognitionService.runForContract :: default asOf',
  'src/customers/customers.service.ts :: CustomersService.list :: field asOf',
  'src/customers/customers.service.ts :: CustomersService.summary :: arg 2 of exposureOf',
  'src/inventory/inventory.service.ts :: InventoryService.batchBalances :: const today',
  'src/inventory/inventory.service.ts :: InventoryService.expiringStock :: const today',
  'src/notifications/escalation.service.ts :: EscalationService.runForCompany :: const today',
  'src/obligations/obligations.service.ts :: ObligationsService.declareCorrection :: arg 3 of judgeCorrection',
  'src/obligations/obligations.service.ts :: ObligationsService.rentSection :: const today',
  'src/reminders/reminders.service.ts :: RemindersService.dueToday :: const today',
  'src/reports/reports.service.ts :: ReportsService.propertyKpis :: const today',
  'src/reports/reports.service.ts :: ReportsService.dashboard :: field asOf',
  'src/reports/reports.service.ts :: ReportsService.receivablesAging :: const asOf on the UTC day',
  'src/reservations/reservations.service.ts :: ReservationsService.create :: const today',
  'src/reservations/reservations.service.ts :: function expireStaleReservations :: filter expiryDate',
  'src/units/units.service.ts :: UnitsService.listWithStatus :: const today',
  'src/warranties/warranties.service.ts :: WarrantiesService.list :: const today',
];

const key = (file: string, c: UtcCutoff) => `${file} :: ${c.scope} :: ${c.use}`;

describe('A posting, document, movement or due-date cutoff takes the company day', () => {
  const FILES = sourceFiles(SRC);
  const SOURCES = FILES.map((f) => readFileSync(f, 'utf8'));
  const ctx = { columns: dateColumns(readFileSync(join(API, 'prisma', 'schema.prisma'), 'utf8')), parameters: cutoffParameters(SOURCES) };
  const HITS = FILES.flatMap((f, i) => {
    const file = relative(API, f).replace(/\\/g, '/');
    return utcCutoffs(SOURCES[i], ctx, f).map((c) => ({ ...c, file, key: key(file, c) }));
  });

  it('reads the tree: hundreds of files, the date columns and the cutoff parameters', () => {
    expect(FILES.length).toBeGreaterThan(300);
    for (const column of ['dueDate', 'issueDate', 'date', 'start']) expect(ctx.columns.has(column)).toBe(true);
    // A timestamp in some model is not a date column.
    expect(ctx.columns.has('closedAt')).toBe(false);
    expect(ctx.parameters.get('accrueDueWithinTx')).toEqual(new Set([2]));
    expect(ctx.parameters.get('raiseDueFeesWithinTx')).toEqual(new Set([2]));
  });

  it('flags no UTC-day cutoff outside the declared lists', () => {
    const declared = new Set([...Object.keys(MUST_STAY_UTC), ...KNOWN_DEBT]);
    const bad = HITS.filter((h) => !declared.has(h.key));
    if (bad.length > 0) {
      throw new Error(
        [
          `${bad.length} cutoff(s) on the UTC day:`,
          ...bad.map((h) => `   ${h.file}:${h.line}  ${h.key}`),
          '',
          "Use the company's day: `await companyToday(tx, companyId)` from common/company-day.util.ts.",
          'A site that must stay on the UTC day goes in MUST_STAY_UTC with its reason.',
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });

  it('keeps no stale entry in the declared lists, so the debt only shrinks', () => {
    const live = new Set(HITS.map((h) => h.key));
    expect([...Object.keys(MUST_STAY_UTC), ...KNOWN_DEBT].filter((k) => !live.has(k))).toEqual([]);
    for (const [k, reason] of Object.entries(MUST_STAY_UTC)) expect(`${k}: ${reason}`.length).toBeGreaterThan(k.length + 30);
  });

  describe('the probe on known cases', () => {
    const columns = new Set(['dueDate', 'start', 'date']);
    const parameters = cutoffParameters(['function accrue(tx: unknown, id: string, asOf: Date) {}', 'function stamp(tx: unknown, now: Date) {}']);
    const lines = (src: string) => utcCutoffs(src, { columns, parameters }).map((c) => `${c.line}:${c.use}`);

    it('flags each shape of a UTC-day cutoff', () => {
      const src = [
        'async function a(tx: unknown) { await accrue(tx, "c", new Date()); }',
        'function b(asOf: Date = new Date()) { return asOf; }',
        'function c() { const today = dayStartOf(new Date()); return today; }',
        'function d(tx: any) { return tx.installment.updateMany({ where: { dueDate: { lt: new Date() } } }); }',
        'function e(start: Date) { return start > new Date() ? 1 : 2; }',
        'function f(row: { date: Date }) { return { date: new Date().toISOString().slice(0, 10), x: row.date <= (new Date()) }; }',
        'function g(settledAt: Date) { const asOf = settledAt > new Date(0) ? settledAt : new Date(); return asOf; }',
        'function h(at: Date, o?: number) { const dueDate = localDateOf(at, o !== undefined ? o : 0); return dueDate; }',
        'function i() { return wallClockOf(new Date(), 0); }',
        'function j(tx: unknown) { return exposure(tx, { asOf: dayEndOf(new Date()) }); }',
      ].join('\n');
      expect(lines(src)).toEqual([
        '1:arg 2 of accrue',
        '2:default asOf',
        '3:const today',
        '4:filter dueDate',
        '5:compare start',
        '6:column date',
        '6:compare date',
        '7:const asOf',
        '8:const dueDate on the UTC day',
        '9:stamp wallClockOf',
        '10:field asOf',
      ]);
    });

    it('leaves the company day, a named instant and a timestamp alone', () => {
      const src = [
        '// accrue(tx, "c", new Date())',
        'async function a(tx: any, companyId: string) { await accrue(tx, "c", await companyToday(tx, companyId)); }',
        'function b(tx: unknown) { stamp(tx, new Date()); }',
        'function c(tx: any) { return tx.period.update({ data: { closedAt: new Date() } }); }',
        'function d(now: Date = new Date()) { return now; }',
        'function e(row: { dueDate: Date }, today: Date) { return row.dueDate < today; }',
        'const msg = "dueDate: { lt: new Date() }";',
        'function f(at: Date, offset: number) { const dueDate = localDateOf(at, offset); return wallClockOf(at, offset); }',
        'function g(row: { dueDate: Date }) { const label = dayStartOf(row.dueDate); return label; }',
      ].join('\n');
      expect(lines(src)).toEqual([]);
    });
  });
});
