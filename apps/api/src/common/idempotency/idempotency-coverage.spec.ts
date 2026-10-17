import { readFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import * as ts from 'typescript';
import { readsDeclaredStrings, sourceFiles } from '../source-scan.util';

// Reads the exemption reasons as declared strings; the code itself is read as a syntax tree, so a decorator written in a
// comment or a string is not a decorator at all.
readsDeclaredStrings();

/**
 * Every POST under a controller that writes numbered documents or postings either takes the Idempotency-Key header or says
 * why it does not.
 *
 * A controller is in scope when its folder calls the document number counter (`nextDocumentNumber`), the journal entry
 * writer (`createJournalEntry`), the in-transaction invoice writer (`createWithinTx`) or anything imported from
 * `journal/auto-posting.util`. In scope, each POST handler needs a parameter decorated `@IdempotencyKey()` or the decorator
 * `@IdempotencyExempt('reason')`; a controller with no route that writes a document may carry the exemption on the class.
 *
 * Limits: the scope is read per folder, so a controller that writes documents only through a service in another folder is
 * not seen; and the guard asks for the declaration, not for its truth: a key that is read but never recorded, or a reason
 * that is wrong, passes.
 */
const SRC = join(__dirname, '..', '..');

/** Calls that write a numbered document or a posting. */
export const WRITER_CALLS = new Set(['nextDocumentNumber', 'createJournalEntry', 'createWithinTx']);
/** Every export of a module whose path ends like this posts to the ledger. */
const POSTING_MODULE = /journal\/auto-posting\.util$/;
/** The shortest exemption reason accepted: a floor against an empty word, not a judgment of the reason. */
export const MIN_REASON_LENGTH = 20;

const decoratorsOf = (node: ts.Node): readonly ts.Decorator[] => (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []);

function decoratorName(d: ts.Decorator): string | null {
  const e = d.expression;
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) return e.expression.text;
  if (ts.isIdentifier(e)) return e.text;
  return null;
}

function exemptionReason(node: ts.Node): string | null | undefined {
  const d = decoratorsOf(node).find((x) => decoratorName(x) === 'IdempotencyExempt');
  if (!d) return undefined;
  const arg = ts.isCallExpression(d.expression) ? d.expression.arguments[0] : undefined;
  if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) return arg.text.trim();
  return null;
}

/** Whether a source file calls a writer of documents or postings. */
export function writesDocuments(source: string, fileName = 'file.ts'): boolean {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const posting = new Set<string>();
  for (const st of file.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !POSTING_MODULE.test(st.moduleSpecifier.text)) continue;
    const bindings = st.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) posting.add(el.name.text);
  }
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      if (name && (WRITER_CALLS.has(name) || posting.has(name))) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(file);
  return found;
}

export interface PostRoute {
  route: string;
  keyed: boolean;
  /** The reason given, `null` when the decorator is there without a usable reason, `undefined` when it is absent. */
  exempt: string | null | undefined;
  classExempt: string | null | undefined;
}

/** The POST handlers of every controller class in one source file. */
export function postRoutesOf(source: string, fileName = 'file.controller.ts'): PostRoute[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const out: PostRoute[] = [];
  for (const st of file.statements) {
    if (!ts.isClassDeclaration(st) || !decoratorsOf(st).some((d) => decoratorName(d) === 'Controller')) continue;
    const classExempt = exemptionReason(st);
    for (const member of st.members) {
      if (!ts.isMethodDeclaration(member) || !decoratorsOf(member).some((d) => decoratorName(d) === 'Post')) continue;
      out.push({
        route: `${st.name?.text ?? 'class'}.${member.name.getText(file)}`,
        keyed: member.parameters.some((p) => decoratorsOf(p).some((d) => decoratorName(d) === 'IdempotencyKey')),
        exempt: exemptionReason(member),
        classExempt,
      });
    }
  }
  return out;
}

const usable = (reason: string | null | undefined): reason is string => typeof reason === 'string' && reason.length >= MIN_REASON_LENGTH;

/** What is wrong with one route, or `null`. */
export function routeProblem(r: PostRoute): string | null {
  if (r.classExempt !== undefined) {
    if (!usable(r.classExempt)) return 'the class exemption gives no reason of at least twenty characters';
    if (r.keyed) return 'takes the key under a class declared as writing no document';
    return null;
  }
  if (r.keyed && r.exempt !== undefined) return 'takes the key and is exempted at once';
  if (r.keyed) return null;
  if (r.exempt === undefined) return 'takes no Idempotency-Key and gives no exemption';
  if (!usable(r.exempt)) return 'the exemption gives no reason of at least twenty characters';
  return null;
}

function scan() {
  const files = sourceFiles(SRC);
  const writingFolders = new Set<string>();
  for (const f of files) if (writesDocuments(readFileSync(f, 'utf8'), f)) writingFolders.add(dirname(f));
  // The controller's folder or any folder under it.
  const reachesWriters = (dir: string) => [...writingFolders].some((w) => w === dir || w.startsWith(dir + sep));
  const controllers = files.filter((f) => f.endsWith('.controller.ts'));
  const scoped = controllers.filter((f) => reachesWriters(dirname(f)));
  const routes = scoped.flatMap((f) => postRoutesOf(readFileSync(f, 'utf8'), f).map((r) => ({ ...r, file: relative(SRC, f).replace(/\\/g, '/') })));
  return { scoped: scoped.map((f) => relative(SRC, f).replace(/\\/g, '/')), routes };
}

describe('Idempotency-Key on every POST of a controller that writes documents or postings', () => {
  const { scoped, routes } = scan();

  it('every such POST takes the key or gives a reason', () => {
    const problems = routes.flatMap((r) => {
      const p = routeProblem(r);
      return p ? [`${r.file} ${r.route}: ${p}`] : [];
    });
    if (problems.length) {
      throw new Error(
        [
          'POST routes under a controller that writes numbered documents or postings, without a decision:',
          ...problems.map((p) => `  ${p}`),
          '',
          'Add a parameter `@IdempotencyKey() idempotencyKey: string | undefined` and record it with keyedRequest,',
          "onceForRequest and recordKeyedRequest, or mark the route `@IdempotencyExempt('why a repeat cannot write twice')`.",
        ].join('\n'),
      );
    }
    expect(problems).toEqual([]);
  });

  it('reads the controllers it is meant to read and leaves the others', () => {
    for (const known of [
      'invoices/invoices.controller.ts',
      'quotes/quotes.controller.ts',
      'journal/journal.controller.ts',
      'purchases/purchases.controller.ts',
      'contracts/contracts.controller.ts',
      'payments/payments.controller.ts',
      'inventory/inventory.controller.ts',
      'banks/banks.controller.ts',
      'pos/pos.controller.ts',
    ]) {
      expect({ known, scoped: scoped.includes(known) }).toEqual({ known, scoped: true });
    }
    for (const outside of ['auth/auth.controller.ts', 'customers/customers.controller.ts', 'products/products.controller.ts']) {
      expect({ outside, scoped: scoped.includes(outside) }).toEqual({ outside, scoped: false });
    }
    expect(routes.length).toBeGreaterThanOrEqual(90);
    expect(routes.filter((r) => r.keyed).length).toBeGreaterThanOrEqual(25);
  });

  describe('the reader', () => {
    const controller = (methodDecorators: string, params: string, classDecorators = '') =>
      [
        "import { Controller, Post, Body } from '@nestjs/common';",
        `@Controller('things')${classDecorators}`,
        'export class ThingsController {',
        `  @Post()${methodDecorators}`,
        `  create(@Body() dto: unknown${params}) {`,
        '    return dto;',
        '  }',
        '}',
      ].join('\n');
    const reason = 'a thing is written once by its state check';

    it('refuses a POST with neither the key nor an exemption, and one with a short reason', () => {
      const bare = ["@Controller('things')", 'export class ThingsController {', '  @Post()', '  create() {}', '}'].join('\n');
      expect(postRoutesOf(bare).map(routeProblem)).toEqual(['takes no Idempotency-Key and gives no exemption']);
      expect(postRoutesOf(controller('', '')).map(routeProblem)).toEqual(['takes no Idempotency-Key and gives no exemption']);
      expect(postRoutesOf(controller("\n  @IdempotencyExempt('short')", '')).map(routeProblem)).toEqual(['the exemption gives no reason of at least twenty characters']);
      expect(postRoutesOf(controller(`\n  @IdempotencyExempt('${reason}')`, ', @IdempotencyKey() key: string | undefined')).map(routeProblem)).toEqual([
        'takes the key and is exempted at once',
      ]);
    });

    it('accepts a keyed POST, an exempted one and a class exemption, and ignores a decorator written in a comment', () => {
      expect(postRoutesOf(controller('', ', @IdempotencyKey() key: string | undefined')).map(routeProblem)).toEqual([null]);
      expect(postRoutesOf(controller(`\n  @IdempotencyExempt('${reason}')`, '')).map(routeProblem)).toEqual([null]);
      expect(postRoutesOf(controller('', '', `\n@IdempotencyExempt('${reason}')`)).map(routeProblem)).toEqual([null]);
      expect(postRoutesOf(controller(`\n  // @IdempotencyExempt('${reason}')`, '')).map(routeProblem)).toEqual(['takes no Idempotency-Key and gives no exemption']);
    });

    it('sees a writer call and an imported posting helper, and not a name in a comment', () => {
      const call = (name: string) => `export function f(tx: unknown) { return ${name}(tx); }`;
      expect(writesDocuments(call('nextDocumentNumber'))).toBe(true);
      expect(writesDocuments(`import { postThingEntry } from '../journal/auto-posting.util';\n${call('postThingEntry')}`)).toBe(true);
      expect(writesDocuments(`import { postThingEntry } from '../journal/other.util';\n${call('postThingEntry')}`)).toBe(false);
      expect(writesDocuments('// nextDocumentNumber(tx)\nexport const x = 1;')).toBe(false);
    });
  });
});
