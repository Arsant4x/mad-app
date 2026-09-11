import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { readsDeclaredStrings, sourceFiles } from './source-scan.util';

// 🔴 **يقرأ الشيفرةَ شجرةً** (`typescript`) لا نصّاً (`ق-٣٧٥`): إسنادٌ مكتوبٌ في
// تعليقٍ أو سلسلةٍ ليس عقدةَ إسنادٍ أصلاً. ويُعلَن الصنفُ هنا لأن الحارسَ يقرأ
// ملفّاتِ `.ts` ويُطابق عليها.
readsDeclaredStrings();

/**
 * **مدخلُ الدعم يفحص إذناً حيّاً في المسار نفسه** (`ق-٥٢٩`).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * **العزلُ طبقتان** (`TENANT_SCOPED_MODELS` + `FORCE RLS`)، **ووضعُ الدعم
 * يتجاوزهما بإذن**: يضع `req.tenant` لمدير منصّةٍ بمنشأةٍ **ليست في رمزه** —
 * من ترويسة `X-Support-Company`. **فسلامةُ الباب كلُّها في سطرٍ واحد**:
 * `activeGrantFor(companyId)` **يُقرأ من القاعدة في كلّ طلب** قبل أن يُوضع
 * السياق. **ومسارٌ جديد يضع السياقَ لمدير منصّةٍ بلا هذا الفحص يفتح الباب** —
 * ويُلتفّ به على `أ` (النطاق) و`ب` (هويّة الداخل) معاً. **فبُني الحارسُ بعدهما
 * مباشرةً لا بعد شهر** (حكمُ المالك).
 *
 * ── فالحارسُ يقرأ الشكل ───────────────────────────────────────────────────
 *
 * **كلُّ إسنادٍ إلى `<x>.tenant`** في الشجرة: **إن لم يكن `companyId` فيه من
 * مطالبة الرمز نفسِه** (`<payload>.companyId` حيث `payload` مُعرَّفٌ من
 * `req.user`) — **فهو سياقٌ لمنشأةٍ غير منشأة الداخل**، **ويلزمه فحصُ إذنٍ حيّ
 * (`activeGrantFor(`) في الدالّة نفسِها قبله**. **ولا قائمةَ بأسماء الملفّات ولا
 * المتغيّرات**: مصدرُ `companyId` يُحلّ من الشجرة.
 *
 * **والإذنُ حيٌّ لا مقروءٌ مرّة**: `activeGrantFor` نفسُه **يقرأ القاعدة**
 * (`findFirst`) — فذاكرةٌ وسيطة تجعل القطعَ لا يُغلق فوراً، **وهذا يُقاس هنا
 * أيضاً** لا يُفترض.
 *
 * ── حدودُه المعلَنة ───────────────────────────────────────────────────────
 *
 * ⚠️ **① «قبله في الدالّة نفسِها»** يُقرأ ترتيباً في النصّ لا تدفّقاً: فحصٌ في
 * فرعٍ آخر من الدالّة نفسِها يمرّ. **والدالّةُ الحاليّة واحدةٌ** (`TenantGuard`)،
 * وفرعُ الدعم يعود قبل فرع المستأجر — حدٌّ معلَنٌ من عائلة `ق-٤٩٧`.
 *
 * ⚠️ **② يفرض وجودَ الفحص لا صحّتَه**: من كتب `activeGrantFor` ثم أهمل نتيجته
 * يمرّ — والاختبارُ الطرفيُّ (`support-access.e2e`) هو ما يقيس السلوك.
 *
 * ⚠️ **③ سياقٌ يُبنى بغير إسنادٍ إلى `.tenant`** (مثلاً `Object.assign(req, …)`)
 * لا يراه — فراغٌ بحدّه، يُوسَّع بالإشارة لا بالقائمة حين يُرى.
 */
const SRC = join(__dirname, '..');

/** الفحصُ الحيّ — الاسمُ الذي يقرؤه الحارس، ويُثبَت أدناه أنه يقرأ القاعدة. */
export const LIVE_GRANT_CHECK = 'activeGrantFor';

export interface TenantAssignment {
  line: number;
  /** الدالّةُ الحاوية. */
  scope: string;
  /** نصُّ قيمة `companyId` في السياق المُسنَد. */
  companyIdFrom: string;
  /** من مطالبة الرمز نفسِه — لا يحتاج إذناً. */
  fromOwnClaim: boolean;
  /** يسبقه فحصٌ حيّ في الدالّة نفسِها. */
  checkedLive: boolean;
}

function enclosingFunction(node: ts.Node): ts.Node {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) return p;
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
  if (ts.isArrowFunction(scope) || ts.isFunctionExpression(scope)) return '(function)';
  return '<module>';
}

/**
 * هل `ident` مُعرَّفٌ في هذه الدالّة من `<req>.user`؟ — أي أنه مطالباتُ الرمز.
 * يُقرأ من الشجرة: `const payload = req.user as JwtPayload` وأمثالها.
 */
function declaredFromRequestUser(scope: ts.Node, ident: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === ident && n.initializer) {
      // `req.user`، أو `req.user as X` — يُنزع التحويل ويُقرأ الوصول.
      let init: ts.Expression = n.initializer;
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init) || ts.isNonNullExpression(init)) init = init.expression;
      if (ts.isPropertyAccessExpression(init) && init.name.text === 'user') found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return found;
}

/** الاستدعاءُ `<x>.activeGrantFor(` واقعٌ نصّياً قبل موضعٍ ما في الدالّة نفسِها. */
function liveCheckBefore(scope: ts.Node, position: number): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n) && n.getStart() < position) {
      const callee = n.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
      if (name === LIVE_GRANT_CHECK) found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return found;
}

/**
 * القيمةُ المُسنَدة كائناً حرفياً — مباشرةً، أو عبر متغيّرٍ في الدالّة نفسِها
 * (`const ctx = { … }; req.tenant = ctx;`). **و`.tenant` ليس سياقاً دائماً**:
 * `data.tenant = dto.tenant` اسمُ المستأجر (الساكن) على عقد إيجار — **وقد أدانته
 * أوّلُ صياغة** — فالسياقُ ما يحمل `companyId`، وغيرُه ليس مدخلاً.
 */
function resolveContextLiteral(scope: ts.Node, value: ts.Expression): ts.ObjectLiteralExpression | null {
  if (ts.isObjectLiteralExpression(value)) return value;
  if (!ts.isIdentifier(value)) return null;
  let literal: ts.ObjectLiteralExpression | null = null;
  const visit = (n: ts.Node): void => {
    if (literal) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === value.text && n.initializer && ts.isObjectLiteralExpression(n.initializer)) literal = n.initializer;
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return literal;
}

/** كلُّ إسنادٍ إلى `<x>.tenant = { companyId … }` في نصٍّ واحد — بحاله. */
export function tenantAssignments(source: string, file = 'inline.ts'): TenantAssignment[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: TenantAssignment[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      n.left.name.text === 'tenant'
    ) {
      const scope = enclosingFunction(n);
      const literal = resolveContextLiteral(scope, n.right);
      let companyIdFrom: string | null = null;
      if (literal) {
        for (const p of literal.properties) {
          if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'companyId') companyIdFrom = p.initializer.getText(sf);
          if (ts.isShorthandPropertyAssignment(p) && p.name.text === 'companyId') companyIdFrom = 'companyId';
        }
      }
      // بلا `companyId` ليس سياقَ مستأجرٍ بل حقلٌ اسمُه `tenant` — يُترك.
      if (companyIdFrom === null) {
        ts.forEachChild(n, visit);
        return;
      }
      // من مطالبة الرمز: `<ident>.companyId` و`ident` مُعرَّفٌ من `req.user`.
      const m = /^(\w+)\.companyId$/.exec(companyIdFrom);
      const fromOwnClaim = !!m && declaredFromRequestUser(scope, m[1]);
      out.push({
        line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        scope: scopeName(scope),
        companyIdFrom,
        fromOwnClaim,
        checkedLive: liveCheckBefore(scope, n.getStart(sf)),
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** ما يضع سياقاً لمنشأةٍ غير منشأة الداخل بلا فحصٍ حيٍّ قبله — **وهو الحكم**. */
export function unguardedTenantEntries(source: string, file = 'inline.ts'): TenantAssignment[] {
  return tenantAssignments(source, file).filter((a) => !a.fromOwnClaim && !a.checkedLive);
}

/**
 * **الفحصُ حيّ**: جسمُ `activeGrantFor` في مصدره يقرأ القاعدة (`findFirst`/`findUnique`)
 * — لا خريطةً في الذاكرة ولا نتيجةً محفوظة.
 */
export function liveCheckReadsDatabase(serviceSource: string): boolean {
  const sf = ts.createSourceFile('service.ts', serviceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let reads = false;
  const visit = (n: ts.Node): void => {
    if (ts.isMethodDeclaration(n) && n.name.getText(sf) === LIVE_GRANT_CHECK) {
      const inner = (m: ts.Node): void => {
        if (ts.isCallExpression(m) && ts.isPropertyAccessExpression(m.expression) && /^find(First|Unique)(OrThrow)?$/.test(m.expression.name.text)) reads = true;
        ts.forEachChild(m, inner);
      };
      inner(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return reads;
}

describe('مدخلُ الدعم يفحص إذناً حيّاً في المسار نفسه (ق-٥٢٩)', () => {
  const tree = sourceFiles(SRC).flatMap((f) => tenantAssignments(readFileSync(f, 'utf8'), f).map((a) => ({ ...a, file: relative(SRC, f).replace(/\\/g, '/') })));

  it('🔴 لا مسارَ يضع سياقَ منشأةٍ غير منشأة الداخل بلا فحصِ إذنٍ حيّ قبله', () => {
    const bad = tree.filter((a) => !a.fromOwnClaim && !a.checkedLive);
    if (bad.length > 0) {
      throw new Error(
        [
          `⛔ ${bad.length} إسنادٍ إلى \`.tenant\` بمنشأةٍ ليست من الرمز وبلا فحصٍ حيّ:`,
          ...bad.map((a) => `   ${a.file}:${a.line}  ${a.scope}  companyId ← ${a.companyIdFrom}`),
          '',
          `استدعِ \`${LIVE_GRANT_CHECK}(companyId)\` في الدالّة نفسِها قبل وضع السياق — فالإذنُ يُقرأ من القاعدة في كلّ طلب،`,
          'ولا يُقرأ مرّةً ثم يُحفظ. وما ليس مدخلَ دعمٍ يأخذ `companyId` من مطالبة الرمز (`payload.companyId`).',
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });

  it('⓪ السطحُ غيرُ فارغ — مدخلُ الدعم موجودٌ ويُفحص، ومدخلُ المستأجر من الرمز', () => {
    // مجسٌّ للمجسّ: صفرٌ هنا يعني أن القراءةَ أخفقت لا أن الباب أُغلق (`ق-٣٦١`).
    expect(tree.length).toBeGreaterThanOrEqual(2);
    expect(tree.filter((a) => !a.fromOwnClaim && a.checkedLive).length).toBeGreaterThanOrEqual(1);
    expect(tree.filter((a) => a.fromOwnClaim).length).toBeGreaterThanOrEqual(1);
  });

  it('🔴 والإذنُ حيّ: `activeGrantFor` في مصدره يقرأ القاعدة لا ذاكرة', () => {
    const service = readFileSync(join(SRC, 'support-access', 'support-access.service.ts'), 'utf8');
    expect(liveCheckReadsDatabase(service)).toBe(true);
  });

  it('🔴 والمُكتشِفُ مُثبَتٌ بحالاتٍ مصنوعة: يُدين مدخلاً بلا فحص ويترك المفحوصَ ومدخلَ الرمز', () => {
    // ⚠️ **الصياغةُ منقولةٌ عن `TenantGuard`** (`ق-٤١٨`): ترويسةٌ تُعطي المنشأة، وسياقٌ يُوضع.
    const unguarded = ['class G {', '  async canActivate(ctx: Ctx) {', '    const req = ctx.getRequest();', '    const payload = req.user as JwtPayload;', '    const supportCompanyId = req.header("x-support-company");', '    req.tenant = { companyId: supportCompanyId, actorType: payload.actorType };', '    return true;', '  }', '}'].join('\n');
    expect(unguardedTenantEntries(unguarded).map((a) => `${a.scope} ← ${a.companyIdFrom}`)).toEqual(['G.canActivate ← supportCompanyId']);

    // 🔴 **والمفحوصُ يُترك** — الفحصُ الحيُّ في الدالّة نفسِها قبل السياق.
    const guarded = ['class G {', '  async canActivate(ctx: Ctx) {', '    const req = ctx.getRequest();', '    const payload = req.user as JwtPayload;', '    const supportCompanyId = req.header("x-support-company");', '    const grant = await this.supportAccessService.activeGrantFor(supportCompanyId);', '    if (!grant) throw new ForbiddenException();', '    req.tenant = { companyId: supportCompanyId, actorType: payload.actorType };', '    return true;', '  }', '}'].join('\n');
    expect(unguardedTenantEntries(guarded)).toEqual([]);

    // 🔴 **ومدخلُ المستأجر من مطالبة الرمز يُترك بلا فحص** — منشأتُه هو.
    const ownClaim = ['class G {', '  async canActivate(ctx: Ctx) {', '    const req = ctx.getRequest();', '    const user = req.user as JwtPayload;', '    req.tenant = { companyId: user.companyId, actorType: user.actorType };', '    return true;', '  }', '}'].join('\n');
    expect(unguardedTenantEntries(ownClaim)).toEqual([]);
    expect(tenantAssignments(ownClaim)[0].fromOwnClaim).toBe(true);

    // ⛔ **واسمٌ يوهم لا يُنجي**: متغيّرٌ اسمُه `payload` لكنه ليس من `req.user` — يُدان.
    const impostor = ['class G {', '  async canActivate(ctx: Ctx) {', '    const req = ctx.getRequest();', '    const payload = { companyId: req.header("x-support-company") };', '    req.tenant = { companyId: payload.companyId };', '    return true;', '  }', '}'].join('\n');
    expect(unguardedTenantEntries(impostor).map((a) => a.companyIdFrom)).toEqual(['payload.companyId']);

    // ⛔ **والسياقُ عبر متغيّرٍ يُحلّ** — `const ctx = { companyId: … }; req.tenant = ctx;` مدخلٌ كذلك.
    const viaVariable = ['class G {', '  async canActivate(ctx: Ctx) {', '    const req = ctx.getRequest();', '    const context = { companyId: req.header("x-support-company"), actorType: "PLATFORM_ADMIN" };', '    req.tenant = context;', '    return true;', '  }', '}'].join('\n');
    expect(unguardedTenantEntries(viaVariable).map((a) => a.companyIdFrom)).toEqual(['req.header("x-support-company")']);

    // 🔴 **و`.tenant` بلا `companyId` ليس سياقاً**: اسمُ الساكن على عقد إيجار — أدانته أوّلُ صياغةٍ ويُترك.
    const renter = ['class ContractsService {', '  update(dto: Dto) {', '    const data: Input = {};', '    if (dto.tenant !== undefined) data.tenant = dto.tenant;', '    return data;', '  }', '}'].join('\n');
    expect(tenantAssignments(renter)).toEqual([]);
  });

  it('ولا يُخدع بذكرٍ في تعليقٍ أو نصّ — فالشيفرةُ تُقرأ شجرةً', () => {
    const commented = ['class G {', '  a() {', '    // كان هنا req.tenant = { companyId: x }', '    return "req.tenant = { companyId: x }";', '  }', '}'].join('\n');
    expect(tenantAssignments(commented)).toEqual([]);
  });

  it('🔴 ومقياسُ الحياة مُثبَتٌ بحالتَين: يقبل قراءةَ القاعدة ويرفض الذاكرة', () => {
    const live = ['class S {', '  activeGrantFor(companyId: string) {', '    return this.prisma.supportAccessGrant.findFirst({ where: { companyId, status: "APPROVED" } });', '  }', '}'].join('\n');
    expect(liveCheckReadsDatabase(live)).toBe(true);
    const cached = ['class S {', '  private cache = new Map<string, Grant>();', '  activeGrantFor(companyId: string) {', '    return this.cache.get(companyId) ?? null;', '  }', '}'].join('\n');
    expect(liveCheckReadsDatabase(cached)).toBe(false);
  });
});
