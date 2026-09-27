import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): محدِّدُ الوحدة نصٌّ (`'@prisma/client'`) — ويُقرأ من **شجرة التحليل** لا بنمطٍ على
// النصّ، فمثالٌ في تعليقٍ أو سلسلةٍ ليس استيراداً، واستيرادٌ على سطرين يُرى.
readsDeclaredStrings();

/**
 * ⚖️ **`ق-١٥٠٤` — ب٢: لا `@prisma/client` في `apps/api`؛ العميلُ يُستورد بـ`@mad-app/db`.**
 *
 * العميلُ صار يُولَّد **لكلّ نسخة عملٍ داخلها** (`apps/api/node_modules/@mad-app/db`). **ومحدِّدُ `@prisma/client` يُحلّ إلى العميل
 * المشترك القديم** في وصلة الجذر (`node_modules/.prisma/client`) **بصمت** — فاستيرادٌ واحدٌ يفلت يُعيد العطلَ الذي بُني ب٢ لأجله:
 * نسخةٌ تقرأ عميلَ نسخةٍ أخرى ولا يظهر إلا في `tsc` أو في بذرةٍ تنهار. **فالحارسُ شرطٌ لا تحسين** (`measure-prisma-client-per-worktree.md`
 * §3 ب٢ البند ④).
 *
 * ويشمل كلَّ `.ts` في `apps/api` — المصدرَ والاختبارات والسكربتات والبذرة — فالبذرةُ والسكربتات تفتح عميلاً كالخادم.
 */
const API_ROOT = join(__dirname, '..', '..');
const OLD = '@prisma/client';
const NEW = '@mad-app/db';

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/** كلُّ محدِّد وحدةٍ في الملفّ: `import … from` · `export … from` · `import('…')` · `require('…')` — مع سطره. */
export function moduleSpecifiers(fileName: string, source: string): { spec: string; line: number }[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const out: { spec: string; line: number }[] = [];
  const add = (node: ts.Node, lit: ts.Expression | undefined) => {
    if (lit && ts.isStringLiteralLike(lit)) out.push({ spec: lit.text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node, node.moduleSpecifier);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node, node.argument.literal as ts.Expression);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')))
      add(node, node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('ق-١٥٠٤ ب٢ — لا `@prisma/client` في apps/api، والعميلُ من `@mad-app/db`', () => {
  const files = tsFiles(API_ROOT);
  const all = files.map((f) => ({ file: relative(API_ROOT, f).split('\\').join('/'), specs: moduleSpecifiers(f, readFileSync(f, 'utf8')) }));

  it('⓪ المسبارُ يرى: الصيغُ الأربع تُمسك، والتعليقُ والسلسلةُ لا — والشجرةُ كلُّها مقروءة', () => {
    // الحالاتُ تُبنى بدالّةٍ (`§8.7` الخامس) فلا يحوي هذا الملفُّ استيراداً حرفياً للمحدِّد القديم.
    const q = (s: string) => `'${s}'`;
    const found = (src: string) => moduleSpecifiers('probe.ts', src).map((s) => s.spec);
    expect(found(`import { Prisma } from ${q(OLD)};`)).toEqual([OLD]);
    expect(found(`import {\n  Prisma,\n} from ${q(OLD)};`)).toEqual([OLD]);
    expect(found(`export type { Prisma } from ${q(OLD)};`)).toEqual([OLD]);
    expect(found(`type T = import(${q(OLD)}).Prisma.Decimal;`)).toEqual([OLD]);
    expect(found(`const c = require(${q(OLD)});`)).toEqual([OLD]);
    expect(found(`// from ${q(OLD)}\nconst s = "from ${OLD}";`)).toEqual([]);
    expect(files.length).toBeGreaterThan(300);
  });

  it('🔴 ① لا ملفَّ في apps/api يستورد `@prisma/client`', () => {
    const offenders = all.flatMap(({ file, specs }) => specs.filter((s) => s.spec === OLD).map((s) => `${file}:${s.line}`));
    if (offenders.length > 0) {
      throw new Error(
        [
          `⛔ ${offenders.length} استيراداً لـ${OLD} في apps/api (ق-١٥٠٤):`,
          ...offenders.map((o) => `   ${o}`),
          `   يُحلّ إلى العميل المشترك القديم بصمت — استورد ${NEW} (العميلُ المولَّد لهذه النسخة).`,
        ].join('\n'),
      );
    }
  });

  it('② والسطحُ غيرُ فارغ: الخادمُ والاختباراتُ والبذرةُ تستورد العميلَ الجديد فعلاً', () => {
    const users = all.filter(({ specs }) => specs.some((s) => s.spec === NEW)).map(({ file }) => file);
    expect(users.length).toBeGreaterThan(150);
    expect(users).toEqual(expect.arrayContaining(['src/prisma/prisma.service.ts', 'prisma/seed.ts', 'test/prisma-client-fingerprint.ts']));
  });
});
