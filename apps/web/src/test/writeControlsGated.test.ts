import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// File budget: three times the measured parse of both trees under the full suite.
vi.setConfig({ testTimeout: 15_000 });

/**
 * A screen offers a write control only to an actor the server would let run it.
 *
 * The server checks the action of every write route (TenantGuard with @RequiresAction, or
 * @OwnerOnly). A page that renders the control regardless offers what the server refuses with
 * 403. This guard reads both sources: the API controllers give each write route its grant, the
 * web client modules give each write function its route, and every UI file that calls a write
 * function must test that grant: `can('screen', 'action')` for an action, and
 * `actorType === 'COMPANY'` for an owner only route. A modal or section opened by another
 * file may leave the test to that file, named in GATED_BY_PARENT.
 *
 * Its limit: it reads the file, not the component, and it sees that the grant is tested, not
 * that the test wraps the control. The page tests next to each page measure the control itself.
 */

const WEB = join(__dirname, '..');
const API = join(WEB, '..', '..', 'api', 'src');
const read = (p: string) => readFileSync(p, 'utf8');
const rel = (p: string) => relative(WEB, p).replace(/\\/g, '/');

/**
 * UI files whose write controls are opened from the named file, which tests the grant (or opens
 * it only for the owner, who holds every action). The chain is followed upwards.
 */
export const GATED_BY_PARENT: Record<string, string> = {
  'pages/companyProfile/ZatcaOnboardingCard.tsx': 'pages/companyProfile/CompanyProfilePage.tsx',
  'pages/companyUsers/CompanyUsersPage.tsx': 'App.tsx',
  'pages/companyUsers/DelegationModal.tsx': 'pages/companyUsers/CompanyUsersPage.tsx',
  'pages/customers/MarketingConsentPanel.tsx': 'pages/customers/CustomerDetailModal.tsx',
  'pages/forms/FormRecordPanel.tsx': 'pages/forms/FormRecordsTab.tsx',
  'pages/forms/FormSigningSection.tsx': 'pages/forms/FormRecordPanel.tsx',
  'pages/payments/PaymentModal.tsx': 'pages/payments/PaymentsPage.tsx',
  'pages/quotes/QuoteModal.tsx': 'pages/quotes/QuotesPage.tsx',
  'pages/settings/ApiKeysCard.tsx': 'pages/settings/SettingsPage.tsx',
  'pages/settings/CashDrawersCard.tsx': 'pages/settings/SettingsPage.tsx',
  'pages/settings/IntegrationsCard.tsx': 'pages/settings/SettingsPage.tsx',
  'pages/settings/PrimaryActivityModal.tsx': 'pages/settings/SettingsPage.tsx',
  'pages/settings/SupportAccessCard.tsx': 'pages/settings/SettingsPage.tsx',
  'pages/suppliers/SupplierPaymentModal.tsx': 'pages/suppliers/SuppliersPage.tsx',
  'pages/units/BulkUnitsModal.tsx': 'pages/units/UnitsPage.tsx',
};

function walk(dir: string, keep: (p: string) => boolean, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) {
      if (e !== 'node_modules') walk(f, keep, out);
    } else if (keep(f)) out.push(f);
  }
  return out.sort();
}

type Need = { kind: 'action'; screen: string; action: string } | { kind: 'owner' };
const needKey = (n: Need) => (n.kind === 'owner' ? 'owner' : `${n.screen}:${n.action}`);

interface Route {
  verb: string;
  path: string;
  need: Need | null;
}

type Deco = { name: string; args: readonly ts.Expression[] };
function decorators(node: ts.HasDecorators): Deco[] {
  const out: Deco[] = [];
  for (const d of ts.getDecorators(node) ?? []) {
    const e = d.expression;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) out.push({ name: e.expression.text, args: e.arguments });
    else if (ts.isIdentifier(e)) out.push({ name: e.text, args: [] });
  }
  return out;
}
const literal = (a?: ts.Expression) => (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : null);
const segments = (p: string) => p.split('/').filter(Boolean);
const VERBS = ['Post', 'Put', 'Patch', 'Delete'];

/** Write routes of one controller source, with the grant each needs (null when none). */
export function controllerRoutes(source: string, file = 'x.controller.ts'): Route[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: Route[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isClassDeclaration(n)) {
      const cls = decorators(n);
      const base = literal(cls.find((d) => d.name === 'Controller')?.args[0]) ?? '';
      for (const m of n.members) {
        if (!ts.isMethodDeclaration(m)) continue;
        const own = decorators(m);
        const verb = own.find((d) => VERBS.includes(d.name));
        if (!verb) continue;
        const find = (name: string) => own.find((d) => d.name === name) ?? cls.find((d) => d.name === name);
        const tenant = [...own, ...cls].some((d) => d.name === 'UseGuards' && d.args.some((a) => ts.isIdentifier(a) && a.text === 'TenantGuard'));
        const screen = literal(find('RequiresScreen')?.args[0]);
        const action = literal(find('RequiresAction')?.args[0]);
        let need: Need | null = null;
        if (tenant && find('OwnerOnly')) need = { kind: 'owner' };
        else if (tenant && screen && action) need = { kind: 'action', screen, action };
        const path = [...segments(base), ...segments(literal(verb.args[0]) ?? '')].map((s) => (s.startsWith(':') ? ':' : s)).join('/');
        out.push({ verb: verb.name.toUpperCase(), path, need });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const CLIENT_VERBS = ['post', 'put', 'patch', 'delete'];

/**
 * The path alternatives an argument can take. An interpolation is a parameter, unless it calls
 * or names a module helper that returns a template (its own path), or chooses between literals.
 */
function pathAlternatives(arg: ts.Expression, helpers: Map<string, ts.Expression>): string[] | null {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return [arg.text];
  if (ts.isConditionalExpression(arg)) {
    const a = pathAlternatives(arg.whenTrue, helpers);
    const b = pathAlternatives(arg.whenFalse, helpers);
    return a && b ? [...a, ...b] : null;
  }
  if (ts.isTemplateExpression(arg)) {
    let acc = [arg.head.text];
    for (const span of arg.templateSpans) {
      const e = span.expression;
      const name = ts.isCallExpression(e) && ts.isIdentifier(e.expression) ? e.expression.text : ts.isIdentifier(e) ? e.text : null;
      const helper = name ? helpers.get(name) : undefined;
      let parts: string[] | null = [':'];
      if (helper) parts = pathAlternatives(helper, helpers);
      else if (ts.isConditionalExpression(e)) parts = pathAlternatives(e, helpers);
      if (!parts) return null;
      const next: string[] = [];
      for (const a of acc) for (const p of parts) next.push(a + p + span.literal.text);
      acc = next;
    }
    return acc;
  }
  return null;
}

/** Normalised client path: parameters glued to text inside one segment make it a parameter. */
const clientPath = (p: string) => segments(p.split('?')[0]).map((s) => (s.includes(':') ? ':' : s)).join('/');

interface ClientWrite {
  verb: string;
  paths: string[] | null;
}

/** Exported write functions of one web client module, by name. */
export function clientWrites(source: string, file = 'x.ts'): Map<string, ClientWrite[]> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const helpers = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const init = d.initializer;
      if (!init || !ts.isIdentifier(d.name)) continue;
      const body = ts.isArrowFunction(init) && !ts.isBlock(init.body) ? init.body : init;
      if (ts.isTemplateExpression(body) || ts.isNoSubstitutionTemplateLiteral(body) || ts.isStringLiteral(body)) helpers.set(d.name.text, body);
    }
  }
  const out = new Map<string, ClientWrite[]>();
  const record = (name: string, node: ts.Node) => {
    const calls: ClientWrite[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && CLIENT_VERBS.includes(n.expression.name.text)) {
        if (n.expression.expression.getText(sf) === 'apiClient') {
          const alts = n.arguments[0] ? pathAlternatives(n.arguments[0], helpers) : null;
          calls.push({ verb: n.expression.name.text.toUpperCase(), paths: alts && alts.map(clientPath) });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    if (calls.length) out.set(name, calls);
  };
  for (const st of sf.statements) {
    if (!(st.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(st) && st.name) record(st.name.text, st);
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (d.initializer && ts.isIdentifier(d.name)) record(d.name.text, d.initializer);
  }
  return out;
}

const isOwnerTest = (n: ts.Node) =>
  ts.isBinaryExpression(n) &&
  n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
  ts.isPropertyAccessExpression(n.left) &&
  n.left.name.text === 'actorType' &&
  literal(n.right) === 'COMPANY';

interface UiReading {
  /** Write functions imported from a client module and used in the file: local name to module.function. */
  calls: Map<string, string>;
  /** Grants tested in the file: `screen:action`, and `owner` for an owner test. */
  tested: Set<string>;
  /** Module specifiers the file imports. */
  imports: string[];
}

/** Reads a UI file by the parser, so a call or test written in a comment or string does not count. */
export function readUi(source: string, file = 'x.tsx', writes: (mod: string, fn: string) => boolean): UiReading {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imported = new Map<string, string>();
  const imports: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    imports.push(st.moduleSpecifier.text);
    const mod = /\/api\/([A-Za-z]+)$/.exec(st.moduleSpecifier.text)?.[1];
    const named = st.importClause?.namedBindings;
    if (!mod || !named || !ts.isNamedImports(named)) continue;
    for (const el of named.elements) {
      const orig = (el.propertyName ?? el.name).text;
      if (writes(mod, orig)) imported.set(el.name.text, `${mod}.${orig}`);
    }
  }
  const calls = new Map<string, string>();
  const tested = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n) && imported.has(n.text) && !ts.isImportSpecifier(n.parent)) calls.set(n.text, imported.get(n.text)!);
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      const callee = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null;
      const [s, a] = n.arguments;
      const screen = literal(s);
      const action = literal(a);
      if (callee === 'can' && screen && action) tested.add(`${screen}:${action}`);
    }
    if (isOwnerTest(n)) tested.add('owner');
    // The route wrapper that renders its child for the owner only.
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(sf) === 'CompanyOwnerGuard') tested.add('owner');
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { calls, tested, imports };
}

function matchRoutes(routes: Route[], verb: string, path: string): Route[] {
  const exact = routes.filter((r) => r.verb === verb && r.path === path);
  return exact;
}

function buildWriteNeeds(): { needs: Map<string, Need[]>; unmapped: string[]; routeCount: number } {
  const routes = walk(API, (p) => p.endsWith('.controller.ts')).flatMap((f) => controllerRoutes(read(f), f));
  const needs = new Map<string, Need[]>();
  const unmapped: string[] = [];
  for (const f of walk(join(WEB, 'api'), (p) => p.endsWith('.ts') && !/\.test\.|typecheck/.test(p))) {
    const mod = basename(f, '.ts');
    for (const [fn, calls] of clientWrites(read(f), f)) {
      const list: Need[] = [];
      for (const c of calls) {
        if (!c.paths) {
          unmapped.push(`${mod}.${fn} ${c.verb} (path not readable)`);
          continue;
        }
        for (const p of c.paths) {
          const hit = matchRoutes(routes, c.verb, p);
          if (hit.length === 0) unmapped.push(`${mod}.${fn} ${c.verb} /${p}`);
          for (const r of hit) if (r.need && !list.some((n) => needKey(n) === needKey(r.need!))) list.push(r.need);
        }
      }
      needs.set(`${mod}.${fn}`, list);
    }
  }
  return { needs, unmapped, routeCount: routes.length };
}

/** The files that open this one, nearest first, by GATED_BY_PARENT. */
function ancestors(file: string, parents: Record<string, string>): string[] {
  const out: string[] = [];
  for (let p = parents[file]; p && !out.includes(p); p = parents[p]) out.push(p);
  return out;
}

/** Missing grant tests across the UI tree: `file  local -> grant`. */
function missingTests(needs: Map<string, Need[]>, readings: Map<string, UiReading>, parents: Record<string, string> = GATED_BY_PARENT): string[] {
  const out: string[] = [];
  for (const [file, r] of readings) {
    const above = ancestors(file, parents).map((p) => readings.get(p));
    for (const [local, key] of r.calls) {
      for (const n of needs.get(key) ?? []) {
        const k = needKey(n);
        if (r.tested.has(k)) continue;
        // A parent that tests the grant, or opens the file for the owner only, covers it.
        if (above.some((a) => a && (a.tested.has(k) || a.tested.has('owner')))) continue;
        out.push(`${file}  ${local} -> ${n.kind === 'owner' ? "actorType === 'COMPANY'" : `can('${n.screen}', '${n.action}')`}`);
      }
    }
  }
  return out;
}

describe('Every UI file that calls a write route tests the grant the server checks', () => {
  const { needs, unmapped, routeCount } = buildWriteNeeds();
  const uiFiles = walk(WEB, (p) => p.endsWith('.tsx') && !p.includes('.test.') && !rel(p).startsWith('api/'));
  const readings = new Map<string, UiReading>();
  for (const f of uiFiles) readings.set(rel(f), readUi(read(f), f, (mod, fn) => needs.has(`${mod}.${fn}`)));

  it('reads both trees: write routes and write client functions by the hundred, and pages that call them', () => {
    expect(routeCount).toBeGreaterThan(150);
    expect(needs.size).toBeGreaterThan(150);
    expect([...needs.values()].some((l) => l.some((n) => n.kind === 'owner'))).toBe(true);
    expect([...readings.values()].filter((r) => r.calls.size > 0).length).toBeGreaterThan(40);
  });

  it('maps every write client function to a server route', () => {
    expect(unmapped).toEqual([]);
  });

  it('every parent named for a child file exists and imports that child', () => {
    const bad = Object.entries(GATED_BY_PARENT).filter(([child, parent]) => {
      const p = readings.get(parent);
      const stem = basename(child, '.tsx');
      return !readings.has(child) || !p || !p.imports.some((i) => i.endsWith(`/${stem}`));
    });
    expect(bad).toEqual([]);
  });

  it('no UI file calls a write route without testing its grant', () => {
    const missing = missingTests(needs, readings);
    if (missing.length > 0) {
      throw new Error(
        [
          `${missing.length} write calls in UI files without the grant the server checks:`,
          ...missing.map((m) => `   ${m}`),
          '',
          'Render the control only when the grant holds (usePermissions().can for an action,',
          "user?.actorType === 'COMPANY' for an owner only route), or name the file that opens it in GATED_BY_PARENT.",
        ].join('\n'),
      );
    }
    expect(missing).toEqual([]);
  });

  describe('the probe hits what it must and only that', () => {
    const controller = [
      "@Controller('widgets')",
      '@UseGuards(JwtAuthGuard, TenantGuard)',
      "@RequiresScreen('products')",
      'export class WidgetsController {',
      "  @Post() @RequiresAction('add') create() {}",
      "  @Patch(':id') @RequiresAction('edit') update() {}",
      "  @Post(':id/close') @OwnerOnly() close() {}",
      "  @Post(':id/note') @TenantWide('every actor of the company leaves a note') note() {}",
      '}',
      "@Controller('admin/widgets')",
      '@UseGuards(JwtAuthGuard, PlatformAdminGuard)',
      'export class AdminWidgetsController {',
      '  @Post() create() {}',
      '}',
    ].join('\n');
    const client = [
      "import { apiClient } from './client';",
      "const base = (id: string) => `/widgets/${id}`;",
      "export const createWidget = (b: unknown) => apiClient.post('/widgets', b);",
      'export async function updateWidget(id: string) { return apiClient.patch(`/widgets/${id}`); }',
      'export const closeWidget = (id: string) => apiClient.post(`${base(id)}/close`);',
      "export const listWidgets = () => apiClient.get('/widgets');",
    ].join('\n');

    it('reads each route grant, the owner only route and the routes that need none', () => {
      const routes = controllerRoutes(controller);
      expect(routes.map((r) => [r.verb, r.path, r.need && needKey(r.need)])).toEqual([
        ['POST', 'widgets', 'products:add'],
        ['PATCH', 'widgets/:', 'products:edit'],
        ['POST', 'widgets/:/close', 'owner'],
        ['POST', 'widgets/:/note', null],
        ['POST', 'admin/widgets', null],
      ]);
    });

    it('reads write client functions with helper paths, and skips reads', () => {
      const w = clientWrites(client);
      expect([...w.keys()]).toEqual(['createWidget', 'updateWidget', 'closeWidget']);
      expect(w.get('closeWidget')).toEqual([{ verb: 'POST', paths: ['widgets/:/close'] }]);
      expect(w.get('updateWidget')).toEqual([{ verb: 'PATCH', paths: ['widgets/:'] }]);
    });

    it('flags a call without its grant test, and passes one with it or with the owner test', () => {
      const routes = controllerRoutes(controller);
      const needs = new Map<string, Need[]>();
      for (const [fn, calls] of clientWrites(client)) {
        needs.set(`widgets.${fn}`, calls.flatMap((c) => (c.paths ?? []).flatMap((p) => matchRoutes(routes, c.verb, p).flatMap((r) => (r.need ? [r.need] : [])))));
      }
      const writes = (mod: string, fn: string) => needs.has(`${mod}.${fn}`);
      const page = (body: string) => `import { createWidget, updateWidget, closeWidget } from '../../api/widgets';\nexport function P() {\n${body}\n}`;
      const bare = page("  // can('products', 'add') written in a comment does not count\n  return <button onClick={() => { createWidget({}); updateWidget('1'); closeWidget('1'); }} />;");
      const gated = page(
        "  const { can } = usePermissions();\n  const { user } = useAuth();\n  return <>{can('products', 'add') && <button onClick={() => createWidget({})} />}{can('products', 'edit') && <b onClick={() => updateWidget('1')} />}{user?.actorType === 'COMPANY' && <i onClick={() => closeWidget('1')} />}</>;",
      );
      const readings = new Map([
        ['bare.tsx', readUi(bare, 'bare.tsx', writes)],
        ['gated.tsx', readUi(gated, 'gated.tsx', writes)],
      ]);
      expect(missingTests(needs, readings, {})).toEqual([
        "bare.tsx  createWidget -> can('products', 'add')",
        "bare.tsx  updateWidget -> can('products', 'edit')",
        "bare.tsx  closeWidget -> actorType === 'COMPANY'",
      ]);
    });

    it('covers a child through its parent chain only where a parent tests the grant or opens it for the owner', () => {
      const routes = controllerRoutes(controller);
      const needs = new Map<string, Need[]>();
      for (const [fn, calls] of clientWrites(client)) {
        needs.set(`widgets.${fn}`, calls.flatMap((c) => (c.paths ?? []).flatMap((p) => matchRoutes(routes, c.verb, p).flatMap((r) => (r.need ? [r.need] : [])))));
      }
      const writes = (mod: string, fn: string) => needs.has(`${mod}.${fn}`);
      const child = readUi("import { createWidget } from '../../api/widgets';\nexport function M() { return <button onClick={() => createWidget({})} />; }", 'm.tsx', writes);
      const gating = readUi("import { M } from './M';\nexport function P() { const { can } = usePermissions(); return can('products', 'add') ? <M /> : null; }", 'p.tsx', writes);
      const plain = readUi("import { M } from './M';\nexport function Q() { return <M />; }", 'q.tsx', writes);
      const route = readUi("export function A() { return <CompanyOwnerGuard><Q /></CompanyOwnerGuard>; }", 'a.tsx', writes);
      const readings = new Map([
        ['m.tsx', child],
        ['p.tsx', gating],
        ['q.tsx', plain],
        ['a.tsx', route],
      ]);
      expect(missingTests(needs, readings, { 'm.tsx': 'p.tsx' })).toEqual([]);
      expect(missingTests(needs, readings, { 'm.tsx': 'q.tsx' })).toEqual(["m.tsx  createWidget -> can('products', 'add')"]);
      expect(missingTests(needs, readings, { 'm.tsx': 'q.tsx', 'q.tsx': 'a.tsx' })).toEqual([]);
    });
  });
});
