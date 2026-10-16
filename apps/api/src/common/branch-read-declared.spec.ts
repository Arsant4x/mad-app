import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { readsDeclaredStrings, sourceFiles } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): الإعلانُ يعيش **في تعليق التابع**،
// **والشيفرةُ تُقرأ شجرةً** (`typescript`) لا نصّاً — فاستدعاءٌ مكتوبٌ في تعليقٍ
// أو سلسلةٍ ليس عقدةَ استدعاءٍ أصلاً، ولا يحتاج تجريداً.
readsDeclaredStrings();

/**
 * **قراءةٌ جامعةٌ على نموذجٍ يحمل الفرع تُرشِّح أو تُعلن لماذا** (`ق-٥١٧`).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * **عزلُ الفروع كان نصفَ عزل**: `create` في العروض والأدراج صار يمرّ
 * بـ`resolveBranchId` (`ق-٥١٢`/`ق-٥١٣`)، **و`list` في الاثنين بقي يقرأ كلَّ
 * فروع المنشأة** — **فكاشيرُ فرعٍ كان يقرأ نقديّةَ كلّ فرعٍ آخر لحظةً بلحظة**.
 * **والعلّةُ كانت مكتوبةً في الشيفرة** («القائمةُ تُقرأ لكلّ فاعل») **ولم
 * يقرأها أحد** — وهو `ق-٥٠٢`: **موثَّقٌ لا محروس**.
 *
 * **والمقيس** (2026-09-11): **١٤ نموذجاً تحمل `branchId`** · **١٤٠ موضعَ
 * قراءة** · **منها ٢٦ بمرشِّح** · **و٥٧ قراءةً جامعةً بلا مرشِّح** — **أكثرُها
 * عامٌّ بحقّه** (سلسلةُ الهيئة · الأستاذ · الأرصدةُ الافتتاحية · عدّاداتُ
 * الاستعمال) **وموضعان كانا ثغرتَين**.
 *
 * ── فالبوّابةُ تسأل عن الإعلان لا عن الصنف ────────────────────────────────
 *
 * **لا تفرز الحارسُ العامَّ من المسرِّب** — **فالتمييزُ في القصد لا في البنية**
 * (`ق-٥٠٠`). **بل يسأل كلَّ تابعٍ يقرأ نموذجَ فرعٍ قراءةً جامعة**: **إمّا تمرّ
 * بـ`branchFilter`، وإمّا تقول في موضعك لماذا هذه القراءةُ عامّةٌ بحقّها**.
 * وهي بوّابةُ «بلا أبٍ» نفسُها (`ق-٥٠١`) على القراءة.
 *
 * ── شروطُ المالك الثلاثة ──────────────────────────────────────────────────
 *
 * **① الإعلانُ يقول لماذا — لا «عامّة»**: فسببٌ أقصرُ من حدٍّ معلَن يُرفض.
 * **② مشتقٌّ من المخطّط**: النماذجُ تُقرأ من `schema.prisma` لا من قائمةٍ
 * بأسماء السبعة والخمسين — **فنموذجٌ يحمل الفرع غداً يدخل الحراسةَ بلا لمس
 * هذا الملفّ**.
 * **③ ولا تصير الإعلاناتُ نسخاً**: **إن تجاوزت صياغةٌ واحدةٌ ثلثَ الإعلانات
 * فالحارسُ أوسعُ من غرضه** — **والحدُّ حدُّ المالك ويُقاس في الشجرة كلَّ
 * تشغيل**، لا مرّةً عند القبول.
 *
 * ── حدودُه المعلَنة ───────────────────────────────────────────────────────
 *
 * ⚠️ **① وحدةُ الحكم التابعُ لا الاستدعاء**: تابعٌ فيه قراءةٌ مرشَّحة وأخرى
 * غيرُ مرشَّحة يمرّ — **فالمرشِّحُ يُبنى في متغيّرٍ أو يُمرَّر بدالّة**، وقراءةُ
 * الاستدعاء وحده أدانت `journal.list` وهو سليم. **والإعلانُ يغطّي التابعَ
 * كلَّه** — فمن جمع في تابعٍ قراءةً عامّةً بحقّها وأخرى مسرِّبة **أخفى الثانية
 * بالأولى**؛ حدٌّ من عائلة `ق-٤٩٧`، معلَنٌ لا مُنكَر.
 *
 * ⚠️ **② والقراءةُ بالمعرّف خارجه**: `findUnique` تُعيد صفّاً واحداً يحدّده
 * مصدرُ المعرّف لا المرشِّح — **وحراستُها في مصدر المعرّف** لا هنا.
 *
 * ⚠️ **③ والقراءةُ المتداخلة خارجه**: `include: { invoices: true }` على نموذجٍ
 * آخر تُعيد صفوفَ فرعٍ بلا أن يظهر اسمُ نموذجها في الاستدعاء — **فراغٌ معلَنٌ
 * بحدّه** لا مغطّى.
 *
 * ⚠️ **④ ويفرض الإعلانَ لا صحّتَه**: من كتب سبباً كاذباً يمرّ — **تمنع الغفلة
 * لا الخطأ المتعمَّد** (كنظيرتيها `ق-٣٧٥` · `ق-٥٠١`).
 *
 * English marker: code comments are written in English, so a new declaration uses the fixed English marker
 * `Company wide by design: <reason>` (any letter case). The Arabic marker stays valid for existing code.
 */
const SRC = join(__dirname, '..');
const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

/** القراءاتُ الجامعة — ما يُعيد أكثرَ من صفٍّ أو يُجمِّع فوق صفوف. */
export const AGGREGATE_READS = ['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy'];

/** علامةُ الإعلان — تُكتب في تعليق التابع، ويليها السبب. */
export const SCOPE_DECLARATION = 'على مستوى المنشأة بحقّها';

/** The same marker in English, for new code whose comments are in English; matched in any letter case. */
export const SCOPE_DECLARATION_EN = 'Company wide by design';

/** أقصرُ سببٍ يُقبل — حدٌّ ضدّ الفراغ لا حكمٌ على المعنى. */
export const MIN_REASON_LENGTH = 20;

/** حدُّ المالك (`ق-٥١٧`): صياغةٌ واحدةٌ لا تتجاوز ثلثَ الإعلانات. */
export const MAX_SHARED_WORDING = 1 / 3;

/** النماذجُ التي تحمل عمودَ الفرع — **من المخطّط لا من قائمةٍ**. */
export function branchCarryingModels(schema: string): string[] {
  const out: string[] = [];
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    if (/^\s*branchId\s+String/m.test(m[2])) out.push(m[1]);
  }
  return out;
}

/** اسمُ الخاصّية في عميل Prisma — الحرفُ الأوّل صغيراً. */
const clientProperty = (model: string): string => model[0].toLowerCase() + model.slice(1);

export interface BranchRead {
  /** سطرُ الاستدعاء — واحديُّ الأساس. */
  line: number;
  model: string;
  read: string;
  /** التابعُ الحاوي — `Class.method` أو `function name` أو `<module>`. */
  scope: string;
  /** يمرّ بـ`branchFilter` في التابع الحاوي. */
  filtered: boolean;
  /** السببُ المعلَن في تعليق التابع — `null` إن لم يُعلَن. */
  reason: string | null;
}

/** أقربُ تابعٍ حاوٍ يُحاسَب: تابعُ صنفٍ أو دالّةٌ مسمّاة أو متغيّرٌ في رأس الملف. */
function enclosingScope(node: ts.Node): ts.Node {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isConstructorDeclaration(p) || ts.isGetAccessorDeclaration(p)) return p;
    if (ts.isVariableStatement(p) && ts.isSourceFile(p.parent)) return p;
    if (ts.isSourceFile(p)) return p;
    p = p.parent;
  }
  return node.getSourceFile();
}

function scopeName(scope: ts.Node): string {
  if (ts.isMethodDeclaration(scope) || ts.isGetAccessorDeclaration(scope)) {
    const cls = scope.parent && ts.isClassDeclaration(scope.parent) ? scope.parent.name?.text ?? 'class' : 'class';
    return `${cls}.${scope.name.getText()}`;
  }
  if (ts.isConstructorDeclaration(scope)) return `${(scope.parent as ts.ClassDeclaration).name?.text ?? 'class'}.constructor`;
  if (ts.isFunctionDeclaration(scope)) return `function ${scope.name?.text ?? '(anonymous)'}`;
  if (ts.isVariableStatement(scope)) return `const ${scope.declarationList.declarations[0]?.name.getText() ?? '?'}`;
  return '<module>';
}

/**
 * المرشِّحاتُ المعتمدة — **تُقرأ من المصدر الواحد لا من قائمة**: كلُّ دالّةٍ
 * مُصدَّرةٍ في `branch-scope.util` ينتهي اسمُها بـ`Filter`. فمرشِّحٌ يُكتب هناك
 * غداً يدخل الحراسةَ بلا لمس هذا الملفّ.
 */
export function scopingFunctions(branchScopeSource: string): string[] {
  return [...branchScopeSource.matchAll(/^export\s+function\s+(\w+Filter)\s*\(/gm)].map((m) => m[1]);
}

const SCOPING = new Set(scopingFunctions(readFileSync(join(SRC, 'branches', 'branch-scope.util.ts'), 'utf8')));

/** هل يظهر مرشِّحٌ معتمد في التابع الحاوي — استدعاءً، لا ذكراً في تعليق. */
function usesBranchFilter(scope: ts.Node, scoping: Set<string>): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && scoping.has(n.expression.text)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(scope);
  return found;
}

/** Where the declaration marker ends in a comment: the Arabic marker, or the English one in any letter case. */
function markerIn(doc: string): { end: number } | null {
  const arabic = doc.indexOf(SCOPE_DECLARATION);
  if (arabic !== -1) return { end: arabic + SCOPE_DECLARATION.length };
  const english = new RegExp(SCOPE_DECLARATION_EN, 'i').exec(doc);
  return english ? { end: english.index + english[0].length } : null;
}

/** السببُ المعلَن في التعليق الملاصق فوق التابع — بعد العلامة حتى نهاية التعليق. */
function declaredReason(scope: ts.Node, text: string): string | null {
  const pos = ts.isSourceFile(scope) ? 0 : scope.getFullStart();
  const ranges = ts.getLeadingCommentRanges(text, pos) ?? [];
  const doc = ranges.map((r) => text.slice(r.pos, r.end)).join('\n');
  const marker = markerIn(doc);
  if (!marker) return null;
  return doc
    .slice(marker.end)
    .replace(/\*\/[\s\S]*$/, '')
    .replace(/^\s*\*+\s?/gm, '')
    .replace(/^[\s*:：—-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** كلُّ قراءةٍ جامعةٍ على نموذجِ فرعٍ في نصٍّ واحد — بحالها لا بحكمها. */
export function branchReads(source: string, models: string[], file = 'inline.ts', scoping: Set<string> = SCOPING): BranchRead[] {
  const props = new Map(models.map((m) => [clientProperty(m), m]));
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: BranchRead[] = [];
  const cache = new Map<ts.Node, { filtered: boolean; reason: string | null }>();

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const read = n.expression.name.text;
      const target = n.expression.expression;
      if (AGGREGATE_READS.includes(read) && ts.isPropertyAccessExpression(target) && props.has(target.name.text)) {
        const scope = enclosingScope(n);
        let verdict = cache.get(scope);
        if (!verdict) {
          verdict = { filtered: usesBranchFilter(scope, scoping), reason: declaredReason(scope, source) };
          cache.set(scope, verdict);
        }
        out.push({
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          model: props.get(target.name.text)!,
          read,
          scope: scopeName(scope),
          ...verdict,
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** ما لا يُرشِّح ولا يُعلن سبباً كافياً — **وهو الحكم**. */
export function undeclaredBranchReads(source: string, models: string[], file = 'inline.ts'): BranchRead[] {
  return branchReads(source, models, file).filter((r) => !r.filtered && (r.reason === null || r.reason.length < MIN_REASON_LENGTH));
}

/** الصياغةُ الأكثرَ تكراراً بين الأسباب — نسبتُها من الكلّ، ولا تُحسب إلا إن تكرّرت. */
export function sharedWordingShare(reasons: string[]): { share: number; wording: string; count: number; total: number } {
  const counts = new Map<string, number>();
  for (const r of reasons) {
    const key = r.replace(/[.،؛:!؟]+$/g, '').replace(/\s+/g, ' ').trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let top: [string, number] = ['', 0];
  for (const entry of counts) if (entry[1] > top[1]) top = entry;
  const total = reasons.length;
  const shared = top[1] >= 2 ? top[1] : 0;
  return { share: total === 0 ? 0 : shared / total, wording: top[0], count: shared, total };
}

/** القراءاتُ في الشجرة كلِّها — بملفّها. */
function treeReads(models: string[]): (BranchRead & { file: string })[] {
  const out: (BranchRead & { file: string })[] = [];
  for (const f of sourceFiles(SRC)) {
    const file = relative(SRC, f).replace(/\\/g, '/');
    for (const r of branchReads(readFileSync(f, 'utf8'), models, f)) out.push({ ...r, file });
  }
  return out;
}

describe('قراءةٌ جامعةٌ على نموذجِ فرعٍ تُرشِّح أو تُعلن لماذا (ق-٥١٧)', () => {
  const MODELS = branchCarryingModels(SCHEMA);
  const READS = treeReads(MODELS);

  it('🔴 لا قراءةَ جامعةً على نموذجِ فرعٍ بلا مرشِّحٍ ولا إعلان', () => {
    const bad = READS.filter((r) => !r.filtered && (r.reason === null || r.reason.length < MIN_REASON_LENGTH));
    if (bad.length > 0) {
      throw new Error(
        [
          `⛔ ${bad.length} قراءةً جامعةً على نموذجِ فرعٍ بلا مرشِّحٍ ولا إعلان:`,
          ...bad.map((r) => `   ${r.file}:${r.line}  ${r.scope}  ${r.model}.${r.read}${r.reason !== null ? '  (سببٌ أقصرُ من الحدّ)' : ''}`),
          '',
          'إمّا مرِّرها: `where: branchFilter(allowedBranchIds)` — المصدرُ الواحد في `branches/branch-scope.util`;',
          `وإمّا أعلن في تعليق التابع: **${SCOPE_DECLARATION}**: <لماذا لا تُقصر على فروع القارئ>.`,
          `Or in an English comment: ${SCOPE_DECLARATION_EN}: <why the read is not limited to the reader's branches>.`,
          '',
          '⚠️ والسببُ يقول لماذا — لا «عامّة»: سلسلةُ الهيئة تُختم على المنشأة كلِّها ·',
          '   حذفُ العميل يُمنع بفواتيره في أيّ فرع · الأستاذُ دفترٌ واحد … وهكذا.',
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });

  it('🔴 والإعلاناتُ ليست نسخاً — لا صياغةَ تتجاوز ثلثَ الإعلانات (حدُّ المالك)', () => {
    const reasons = READS.filter((r) => !r.filtered && r.reason !== null).map((r) => r.reason!);
    const top = sharedWordingShare(reasons);
    if (top.share > MAX_SHARED_WORDING) {
      throw new Error(
        [
          `⛔ صياغةٌ واحدةٌ تتكرّر ${top.count} من ${top.total} إعلاناً — والحدُّ الثلث:`,
          `   «${top.wording}»`,
          '',
          'إعلاناتٌ متطابقةٌ تُكتب ليمرّ الحارس — فالحارسُ صار أوسعَ من غرضه، أو السببُ لم يُقل.',
        ].join('\n'),
      );
    }
    expect(top.share).toBeLessThanOrEqual(MAX_SHARED_WORDING);
  });

  it('⓪ السطحُ غيرُ فارغ — والنماذجُ والقراءاتُ والمرشِّحون موجودون فعلاً', () => {
    // مجسٌّ للمجسّ: صفرٌ هنا يعني أن القراءةَ أخفقت لا أن الشجرةَ خلت (`ق-٣٦١`).
    expect(MODELS.length).toBeGreaterThanOrEqual(10);
    expect(READS.length).toBeGreaterThanOrEqual(40);
    expect(READS.filter((r) => r.filtered).length).toBeGreaterThanOrEqual(10);
    expect(READS.filter((r) => !r.filtered && r.reason !== null).length).toBeGreaterThanOrEqual(10);
  });

  it('🔴 والمُكتشِفُ مُثبَتٌ بحالاتٍ مصنوعة: يُدين غيرَ المرشَّح وغيرَ المُعلِن ويترك سواهما', () => {
    const models = ['Quote', 'CashDrawer'];

    // ⚠️ **الصياغةُ منقولةٌ عن الخدمة** (`ق-٤١٨`) — الاستدعاءُ داخل `runInTenantContext`.
    const unfiltered = ['class QuotesService {', '  list(companyId: string) {', '    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.quote.findMany({ include: QUOTE_INCLUDE }));', '  }', '}'].join('\n');
    expect(undeclaredBranchReads(unfiltered, models).map((r) => `${r.scope} ${r.model}.${r.read}`)).toEqual(['QuotesService.list Quote.findMany']);

    // 🔴 **والمرشَّحُ يُترك** — ولو بُني المرشِّحُ في متغيّرٍ فوق الاستدعاء (وهو ما أسقط أوّلَ مسبار).
    const filtered = ['class QuotesService {', '  list(companyId: string, allowed: string[] | "all") {', '    const where = { ...branchFilter(allowed) };', '    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.quote.findMany({ where }));', '  }', '}'].join('\n');
    expect(undeclaredBranchReads(filtered, models)).toEqual([]);

    // 🔴 **والمُعلِنُ بسببٍ يُترك** — والسببُ يُقرأ كما كُتب.
    const declared = ['class ZatcaService {', '  /**', `   * **${SCOPE_DECLARATION}**: سلسلةُ الهيئة تُختم على فواتير المنشأة كلِّها بترتيبها.`, '   */', '  chain(tx: Tx) {', '    return tx.quote.findFirst({ orderBy: { icv: "desc" } });', '  }', '}'].join('\n');
    expect(undeclaredBranchReads(declared, models)).toEqual([]);
    expect(branchReads(declared, models)[0].reason).toBe('سلسلةُ الهيئة تُختم على فواتير المنشأة كلِّها بترتيبها.');

    // ⛔ **وإعلانٌ بلا سبب يُدان** — «عامّة» ليست سبباً (شرطُ المالك ①).
    const empty = ['class ZatcaService {', `  /** **${SCOPE_DECLARATION}**: عامّة. */`, '  chain(tx: Tx) {', '    return tx.quote.findFirst({ orderBy: { icv: "desc" } });', '  }', '}'].join('\n');
    expect(undeclaredBranchReads(empty, models).map((r) => r.scope)).toEqual(['ZatcaService.chain']);

    // ولا يُدان نموذجٌ لا يحمل الفرع، ولا قراءةٌ بالمعرّف (حدّه ②).
    const outside = ['class S {', '  a(tx: Tx) { return tx.customer.findMany({}); }', '  b(tx: Tx) { return tx.quote.findUnique({ where: { id } }); }', '}'].join('\n');
    expect(undeclaredBranchReads(outside, models)).toEqual([]);

    // 🔴 **والمرشِّحُ المطلوبُ من الاستعلام مرشِّحٌ** — و`assertBranchAllowed` وحده ليس مرشِّحاً:
    //    يمنع فرعاً مطلوباً ولا يُضيّق قراءةً بلا طلب.
    const requested = ['class R {', '  returns(allowed: string[] | "all", branchId?: string) {', '    const scope = requestedBranchFilter(allowed, branchId);', '    return tx.quote.findMany({ where: { ...scope } });', '  }', '}'].join('\n');
    expect(undeclaredBranchReads(requested, models)).toEqual([]);
    const assertedOnly = ['class R {', '  returns(allowed: string[] | "all", branchId?: string) {', '    if (branchId) assertBranchAllowed(allowed, branchId);', '    return tx.quote.findMany({});', '  }', '}'].join('\n');
    expect(undeclaredBranchReads(assertedOnly, models).map((r) => r.scope)).toEqual(['R.returns']);
  });

  it('accepts the English declaration marker with a reason, and refuses it without one', () => {
    const models = ['Quote'];
    const read = (comment: string[]) => ['class ZatcaService {', ...comment, '  chain(tx: Tx) {', '    return tx.quote.findFirst({ orderBy: { icv: "desc" } });', '  }', '}'].join('\n');

    // Must not be flagged: the English marker followed by a reason, read as written.
    const declared = read(['  /**', '   * Company wide by design: the ZATCA chain is sealed over every invoice of the company in order.', '   */']);
    expect(undeclaredBranchReads(declared, models)).toEqual([]);
    expect(branchReads(declared, models)[0].reason).toBe('the ZATCA chain is sealed over every invoice of the company in order.');

    // Must be flagged: the marker with no reason, and a comment without the marker.
    const empty = read(['  /** Company wide by design: general. */']);
    expect(undeclaredBranchReads(empty, models).map((r) => r.scope)).toEqual(['ZatcaService.chain']);
    const unmarked = read(['  /** Reads every invoice of the company because the chain is sealed in order. */']);
    expect(undeclaredBranchReads(unmarked, models).map((r) => r.scope)).toEqual(['ZatcaService.chain']);
  });

  it('🔴 والمرشِّحاتُ تُقرأ من المصدر الواحد — مُثبَتٌ بحالتَين', () => {
    const util = ['export function branchFilter(a: string[] | "all") { return {}; }', 'export function requestedBranchFilter(a: string[] | "all", b?: string) { return {}; }', 'export function assertBranchAllowed(a: string[] | "all", b: string) {}', 'function localFilter() {}'].join('\n');
    // المُصدَّرةُ المنتهيةُ بـ`Filter` وحدها — لا الحارسُ ولا المحلّية.
    expect(scopingFunctions(util)).toEqual(['branchFilter', 'requestedBranchFilter']);
    // ⓪ والشجرةُ تحمل الاثنين فعلاً — فصفرٌ هنا عمىً لا نظافة.
    expect([...SCOPING]).toEqual(expect.arrayContaining(['branchFilter', 'requestedBranchFilter']));
  });

  it('ولا يُخدع بذكرٍ في تعليقٍ أو نصّ — فالشيفرةُ تُقرأ شجرةً', () => {
    const commented = ['class S {', '  // كان هنا tx.quote.findMany({}) قبل الإصلاح', '  a() { return "tx.quote.findMany({})"; }', '}'].join('\n');
    expect(branchReads(commented, ['Quote'])).toEqual([]);
  });

  it('🔴 ومقياسُ النسخ مُثبَتٌ بحالتَين: يمسك الصياغةَ التي تتجاوز الثلث ويترك المتنوّعة', () => {
    // 🔴 اثنان من أربعة — نصفٌ يتجاوز الثلث.
    const copies = ['الأستاذُ دفترٌ واحد', 'الأستاذُ دفترٌ واحد', 'سلسلةُ الهيئة على المنشأة', 'عدّادُ الاستعمال قبل الحذف'];
    expect(sharedWordingShare(copies).share).toBeGreaterThan(MAX_SHARED_WORDING);
    expect(sharedWordingShare(copies).wording).toBe('الأستاذُ دفترٌ واحد');

    // والمتنوّعةُ تمرّ — والمنفردةُ لا تُحسب «مشتركة» ولو كانت الأعلى.
    const varied = ['الأستاذُ دفترٌ واحد.', 'سلسلةُ الهيئة على المنشأة', 'عدّادُ الاستعمال قبل الحذف'];
    expect(sharedWordingShare(varied)).toEqual({ share: 0, wording: 'الأستاذُ دفترٌ واحد', count: 0, total: 3 });

    // وعلامةُ الترقيم في الآخر لا تصنع صياغةً ثانية.
    expect(sharedWordingShare(['أ.', 'أ', 'ب']).count).toBe(2);
  });

  it('🔴 ونماذجُ الفرع تُقرأ من المخطّط — مُثبَتٌ بحالتَين', () => {
    // ⚠️ نصٌّ حرفيٌّ في السطر لا متغيّرٌ: حارسُ «الكاشفُ على نصٍّ مصنوع» يقرأ
    //    المتغيّراتِ بتعبيرٍ يلتهم ما بين مصفوفةٍ بلا `.join(` وأوّلِ `].join(`
    //    بعدها — فمتغيّرٌ هنا لا يُرى مصنوعاً وإن كان. حدُّ ذلك الحارس لا هذا.
    expect(branchCarryingModels('model Quote {\n  id       String @id\n  branchId String?\n}\nmodel Customer {\n  id String @id\n}')).toEqual(['Quote']);
  });
});
