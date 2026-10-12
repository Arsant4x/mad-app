// Finds user-visible text written directly in web UI files instead of behind a
// translation key. Reads the TypeScript syntax tree, not text patterns.
//
// A literal is:
//   - JSX text that contains a letter;
//   - any string or template part that contains an Arabic letter;
//   - a string value of a visible JSX attribute (placeholder, title,
//     aria-label, alt, label) that contains a letter.
// A line that ends with "// i18n-exempt: <reason>" is skipped.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ts = createRequire(join(REPO, 'package.json'))('typescript');

export const DEBT_FILE = 'docs/i18n-literals-debt.json';

/** Web UI files in scope: sources under apps/web/src, without tests, the i18n folder and test helpers. */
export const inScope = (path) =>
  /^apps\/web\/src\/.+\.(ts|tsx)$/.test(path) &&
  !/\.(test|spec)\.(ts|tsx)$|\.d\.ts$/.test(path) &&
  !/^apps\/web\/src\/(i18n|test)\//.test(path);

const ARABIC = /[؀-ۿ]/;
const LETTER = /\p{L}/u;
const VISIBLE_ATTR = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label']);
const EXEMPT = /\/\/\s*i18n-exempt:\s*\S/;

/** Literals in one file: [{ line, kind, text }]. */
export function literals(text, path) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const lines = text.split(/\r?\n/);
  const hits = [];
  const add = (node, k) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    if (EXEMPT.test(lines[line - 1] ?? '')) return;
    hits.push({ line, kind: k, text: node.getText().trim().slice(0, 60) });
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (LETTER.test(node.text)) add(node, 'jsx-text');
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (ARABIC.test(node.text)) add(node, 'arabic-string');
      else if (ts.isStringLiteral(node) && ts.isJsxAttribute(node.parent) && VISIBLE_ATTR.has(node.parent.name.getText()) && LETTER.test(node.text)) add(node, 'visible-attr');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}
