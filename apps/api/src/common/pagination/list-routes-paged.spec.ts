import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';
import { sourceFiles, stripCommentsAndStrings } from '../source-scan.util';
import { LIST_ROUTES } from './list-routes';

/**
 * **كلُّ نقطة قائمةٍ مُعلَنة تقبل `PagedQueryDto`** (`ق-١٢٣٦`) — حارسٌ ساكن يقرأ الشجرةَ (`AST`) لا النصّ:
 * لكلِّ مسارٍ في `LIST_ROUTES` يجد معالجَه في متحكّمه ويوجب وسيطاً بـ`@Query()` نوعُه `PagedQueryDto`
 * **أو صنفٌ يرثه** (فالمسارُ الذي يقبل معاملاتٍ أخرى — `includeArchived` · `propertyId` — يعلنها في `DTO`
 * يرث المشترك، لأن القائمةَ البيضاء ترفض مفتاحاً غيرَ مُعلَن). فمسارٌ يُضاف إلى القائمة بلا وسيطٍ يُسقط الحزمةَ
 * باسمه — والحارسُ الحيّ (`paged-lists.e2e-spec.ts`) يقيس السلوكَ على القاعدة.
 *
 * ويتحقّق أولاً أنه قرأ شيئاً (`§8.7`): عددُ المسارات `42` ولا مسارَ مكرَّر، وكلُّ متحكّمٍ مسمّى موجودٌ على القرص.
 * (الموجزُ قال `43`: مصنِّفُه عدّ `/admin/processing-agreement` مصفوفةً لأنه قرأ أوّلَ نداءِ خدمةٍ لا ما يعيده المعالج —
 * وهو كائن؛ فالعدُّ المقيسُ بالعين عند التحويل `42`.)
 */
const SRC = join(__dirname, '..', '..');

/** أصنافُ الاستعلام المقبولة: `PagedQueryDto` وكلُّ ما يرثه — تُقرأ من الشجرة لا تُكتب. */
function pagedQueryClasses(): Set<string> {
  const parents = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    if (!file.endsWith('.dto.ts')) continue;
    const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    for (const m of code.matchAll(/class\s+(\w+)\s+extends\s+(\w+)/g)) parents.set(m[1], m[2]);
  }
  const accepted = new Set(['PagedQueryDto']);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, parent] of parents) {
      if (accepted.has(parent) && !accepted.has(child)) {
        accepted.add(child);
        grew = true;
      }
    }
  }
  return accepted;
}

function handlerQueryType(source: string, handler: string): string | null {
  const sf = ts.createSourceFile('c.ts', source, ts.ScriptTarget.Latest, true);
  let found: string | null = null;
  const visit = (node: ts.Node) => {
    if (found !== null) return;
    if (ts.isMethodDeclaration(node) && node.name.getText(sf) === handler) {
      for (const p of node.parameters) {
        const hasQuery = ts.getDecorators(p)?.some((d) => d.expression.getText(sf) === 'Query()') ?? false;
        if (hasQuery) found = p.type?.getText(sf) ?? '';
      }
      if (found === null) found = '';
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('نقاطُ القائمة تقبل الترقيمَ بالاختيار — حارسٌ ساكن', () => {
  const accepted = pagedQueryClasses();

  it('يقرأ القائمةَ فعلاً: 42 مساراً بلا تكرار، ومتحكّماتُها على القرص، وأصنافُ الاستعلام تُقرأ من الشجرة', () => {
    expect(LIST_ROUTES).toHaveLength(42);
    expect(new Set(LIST_ROUTES.map((r) => r.path)).size).toBe(42);
    for (const r of LIST_ROUTES) expect(readFileSync(join(SRC, r.controller), 'utf8').length).toBeGreaterThan(0);
    expect(accepted.has('PagedQueryDto')).toBe(true);
    expect(accepted.has('ArchivablePagedQueryDto')).toBe(true);
  });

  it('⭐ كلُّ معالجٍ مُعلَن يحمل `@Query() … : PagedQueryDto` أو وارثاً له', () => {
    const missing: string[] = [];
    for (const r of LIST_ROUTES) {
      const type = handlerQueryType(readFileSync(join(SRC, r.controller), 'utf8'), r.handler);
      if (type === null) missing.push(`${r.path} ⟵ ${relative(SRC, join(SRC, r.controller))}#${r.handler} — المعالجُ غيرُ موجود`);
      else if (!accepted.has(type)) missing.push(`${r.path} ⟵ ${r.controller}#${r.handler} — @Query() نوعُه «${type || 'لا شيء'}»`);
    }
    expect(missing).toEqual([]);
  });

  it('المُكتشِفُ مُثبَتٌ بحالتين — يمسك المعالجَ الذي يقبل ويترك الذي لا يقبل، والتعليقُ ليس معالجاً', () => {
    const accepts = ['class C {', '  @Get()', '  list(@CurrentTenant() t: T, @Query() query: PagedQueryDto) { return 1; }', '}'].join('\n');
    const lacks = ['class C {', '  @Get()', '  list(@CurrentTenant() t: T, @Query("includeArchived") a?: string) { return 1; }', '}'].join('\n');
    expect(handlerQueryType(accepts, 'list')).toBe('PagedQueryDto');
    expect(handlerQueryType(lacks, 'list')).toBe('');
    expect(handlerQueryType(accepts, 'other')).toBeNull();
    expect(stripCommentsAndStrings('// list(@Query() q: PagedQueryDto)')).not.toContain('PagedQueryDto');
  });
});
