import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { sourceFiles } from '../source-scan.util';

/**
 * Every write route under a screen names the action it needs.
 *
 * TenantGuard checked the template's action only when a route declared one, so a
 * write route without @RequiresAction let anyone who could open the screen run it.
 * The guard now refuses such a route for every actor (ACTION_UNDECLARED); this
 * static spec names the route before it reaches CI.
 *
 * A write is a handler decorated @Post, @Put, @Patch, @Delete or @All in a class
 * under TenantGuard whose screen comes from @RequiresScreen on the handler or the
 * class. It passes when it carries, on the handler or the class, one of:
 *   - @RequiresAction(...), the normal case;
 *   - @OwnerOnly(), the owner holds every action, so there is no template to check;
 *   - @TenantWide(reason), open to every actor by a written reason of at least
 *     MIN_REASON_LENGTH characters.
 * Decorators written in comments or strings are not decorators and do not count.
 */
const SRC = join(__dirname, '..', '..');

const WRITE_DECORATORS = ['Post', 'Put', 'Patch', 'Delete', 'All'];
const MIN_REASON_LENGTH = 20;

interface WriteRoute {
  line: number;
  controller: string;
  method: string;
  hasAction: boolean;
  ownerOnly: boolean;
  tenantWideReason: string | null;
}

type Decorator = { name: string; args: readonly ts.Expression[] };

function decoratorsOf(node: ts.HasDecorators): Decorator[] {
  const out: Decorator[] = [];
  for (const d of ts.getDecorators(node) ?? []) {
    const e = d.expression;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) out.push({ name: e.expression.text, args: e.arguments });
    else if (ts.isIdentifier(e)) out.push({ name: e.text, args: [] });
  }
  return out;
}

function stringArg(args: readonly ts.Expression[]): string | null {
  const a = args[0];
  if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) return a.text;
  return null;
}

/** Write routes under a screen in one source text, with what each declares. */
function screenWriteRoutes(source: string, file = 'inline.ts'): WriteRoute[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: WriteRoute[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isClassDeclaration(n)) {
      const cls = decoratorsOf(n);
      const guarded = cls.some((d) => d.name === 'UseGuards' && d.args.some((a) => ts.isIdentifier(a) && a.text === 'TenantGuard'));
      if (guarded) {
        for (const m of n.members) {
          if (!ts.isMethodDeclaration(m)) continue;
          const own = decoratorsOf(m);
          if (!own.some((d) => WRITE_DECORATORS.includes(d.name))) continue;
          const find = (name: string) => own.find((d) => d.name === name) ?? cls.find((d) => d.name === name);
          if (!find('RequiresScreen')) continue;
          const wide = find('TenantWide');
          out.push({
            line: sf.getLineAndCharacterOfPosition(m.getStart(sf)).line + 1,
            controller: n.name?.text ?? '(anonymous)',
            method: m.name.getText(sf),
            hasAction: Boolean(find('RequiresAction')),
            ownerOnly: Boolean(find('OwnerOnly')),
            tenantWideReason: wide ? stringArg(wide.args) ?? '' : null,
          });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function isUndeclared(r: WriteRoute): boolean {
  if (r.hasAction || r.ownerOnly) return false;
  return r.tenantWideReason === null || r.tenantWideReason.length < MIN_REASON_LENGTH;
}

function undeclaredWrites(source: string): WriteRoute[] {
  return screenWriteRoutes(source).filter(isUndeclared);
}

function treeWrites(): (WriteRoute & { file: string })[] {
  const out: (WriteRoute & { file: string })[] = [];
  for (const f of sourceFiles(SRC).filter((p) => p.endsWith('.controller.ts'))) {
    const file = relative(SRC, f).replace(/\\/g, '/');
    for (const r of screenWriteRoutes(readFileSync(f, 'utf8'), f)) out.push({ ...r, file });
  }
  return out;
}

describe('Every write route under a screen declares its action', () => {
  const ROUTES = treeWrites();

  it('reads the tree: write routes by the hundred, with actions and owner only exemptions among them', () => {
    expect(ROUTES.length).toBeGreaterThan(150);
    expect(ROUTES.some((r) => r.hasAction)).toBe(true);
    expect(ROUTES.some((r) => r.ownerOnly && !r.hasAction)).toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      `[write actions] ${ROUTES.length} write routes under a screen · action ${ROUTES.filter((r) => r.hasAction).length} · owner only ${ROUTES.filter((r) => !r.hasAction && r.ownerOnly).length} · tenant wide ${ROUTES.filter((r) => !r.hasAction && !r.ownerOnly && r.tenantWideReason !== null).length}`,
    );
  });

  it('no write route under a screen lacks an action or a reasoned exemption', () => {
    const bad = ROUTES.filter(isUndeclared);
    if (bad.length > 0) {
      throw new Error(
        [
          `${bad.length} write routes under a screen declare no action:`,
          ...bad.map((r) => `   ${r.file}:${r.line}  ${r.controller}.${r.method}`),
          '',
          'Add @RequiresAction(<action>) with the action a sibling write uses for the same kind of change,',
          'or @OwnerOnly() for an owner decision, or @TenantWide(<why every actor may run it>).',
          'TenantGuard refuses the route with ACTION_UNDECLARED until then.',
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });

  describe('the probe hits what it must and only that', () => {
    const HEADER = "import { Controller, Get, Post, Patch, UseGuards } from '@nestjs/common';";

    it('flags a write without an action, and passes a declared write, a read and an unguarded class', () => {
      const sample = `${HEADER}\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\n@RequiresScreen('maintenance')\nexport class XController {\n  @Get()\n  list() { return 1; }\n  @Post(':id/assign')\n  assign() { return 2; }\n  @Patch(':id')\n  @RequiresAction('edit')\n  update() { return 3; }\n}`;
      expect(undeclaredWrites(sample).map((r) => r.method)).toEqual(['assign']);
      const unguarded = `${HEADER}\n@Controller('y')\n@UseGuards(JwtAuthGuard, PlatformAdminGuard)\n@RequiresScreen('maintenance')\nexport class YController {\n  @Post()\n  create() { return 1; }\n}`;
      expect(screenWriteRoutes(unguarded)).toEqual([]);
    });

    it('accepts an action or owner only on the class, and a tenant wide write only with a long enough reason', () => {
      const classAction = `${HEADER}\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\n@RequiresScreen('settings')\n@OwnerOnly()\nexport class XController {\n  @Post()\n  create() { return 1; }\n}`;
      expect(undeclaredWrites(classAction)).toEqual([]);
      const wide = `${HEADER}\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\n@RequiresScreen('settings')\nexport class XController {\n  @Post('long')\n  @TenantWide('every actor of the company logs this by a written reason')\n  long() { return 1; }\n  @Post('short')\n  @TenantWide('open')\n  short() { return 2; }\n}`;
      expect(undeclaredWrites(wide).map((r) => r.method)).toEqual(['short']);
    });

    it('does not count a decorator written in a comment', () => {
      const commented = `${HEADER}\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\n@RequiresScreen('maintenance')\nexport class XController {\n  /** @RequiresAction('edit') belongs on the line below, not here */\n  @Post(':id/start')\n  start() { return 1; }\n}`;
      expect(undeclaredWrites(commented).map((r) => r.method)).toEqual(['start']);
    });
  });
});
