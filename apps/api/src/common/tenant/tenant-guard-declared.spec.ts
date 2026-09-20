import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { sourceFiles } from '../source-scan.util';

/**
 * **كلُّ مسارٍ تحت `TenantGuard` يُعلن نفسَه — وإلا فالحارسُ يرفضه** (`ق-١١٩٨`/①).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * `TenantGuard` كان يفحص الشاشةَ **حين تُعلَن** (`@RequiresScreen`)؛ ومتحكّمٌ بلا وسمٍ
 * يمرّ بكلّ موظّفٍ إلى خدمته — والحمايةُ الوحيدة أن تتذكّر الخدمةُ `assertIsCompanyOwner`.
 * سبعةُ متحكّماتٍ كانت كذلك (العملات · الفروع · ملفُّ المنشأة · الموظفون · الأدراج ·
 * الموافقة · التصدير · الاشتراك · الإغلاق) **وكلُّها تذكّرت** — مقيسٌ حيّاً: الموظّفُ يُردّ
 * `403` على سعر الصرف والرقم الضريبي ومستودع الفرع. **والثامنُ الذي لا يتذكّر لا يُنبّه
 * عنه شيء** — وهو ما تقوله المراجعةُ الخارجية: رفضٌ افتراضيٌّ لمتحكّمٍ بلا وسم.
 *
 * ── القاعدة ───────────────────────────────────────────────────────────────
 *
 * الحارسُ صار مغلقاً افتراضياً (كوضع الدعم `ق-٥٢٧`)، وهذا الحارسُ الساكن يُدين المسارَ
 * الجديد **قبل أن يبلغ السير**: كلُّ تابعٍ يحمل وسمَ `HTTP` في صنفٍ تحت `TenantGuard` يحمل —
 * على التابع أو على الصنف — واحداً من: `@RequiresScreen(…)` · `@OwnerOnly()` ·
 * `@TenantWide('سبب')` · `@SupportShell()`. **وسببُ `TenantWide` لا يقصر عن حدّه** —
 * فإعلانٌ بلا سبب فتحٌ بلا مراجعة.
 *
 * ── حدودُه المعلَنة ───────────────────────────────────────────────────────
 *
 * ⚠️ يقرأ الشيفرةَ شجرةً: الوسومُ المكتوبةُ في تعليقٍ أو سلسلة ليست عقدَ وسمٍ فلا تُحسب.
 * ⚠️ ويفرض الإعلانَ لا صحّتَه: `@TenantWide` على مسارٍ يكتب يمرّ من هنا — والسببُ بجواره
 * ليُراجَع (كأخواته `ق-٣٧٥` · `ق-٥١٧`).
 */
const SRC = join(__dirname, '..', '..');

export const HTTP_DECORATORS = ['Get', 'Post', 'Patch', 'Put', 'Delete', 'Head', 'Options', 'All'];
export const DECLARATIONS = ['RequiresScreen', 'OwnerOnly', 'TenantWide', 'SupportShell'];
export const MIN_REASON_LENGTH = 20;

export interface RouteDeclaration {
  line: number;
  controller: string;
  method: string;
  /** ما وُجد على التابع أو الصنف — بأسمائه. */
  declared: string[];
  /** سببُ `TenantWide` إن وُجد — الأقربُ للتابع. */
  reason: string | null;
}

function decoratorsOf(node: ts.HasDecorators): { name: string; args: readonly ts.Expression[] }[] {
  const out: { name: string; args: readonly ts.Expression[] }[] = [];
  for (const d of ts.getDecorators(node) ?? []) {
    const e = d.expression;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) out.push({ name: e.expression.text, args: e.arguments });
    else if (ts.isIdentifier(e)) out.push({ name: e.text, args: [] });
  }
  return out;
}

function usesTenantGuard(cls: ts.ClassDeclaration): boolean {
  return decoratorsOf(cls).some((d) => d.name === 'UseGuards' && d.args.some((a) => ts.isIdentifier(a) && a.text === 'TenantGuard'));
}

function stringArg(args: readonly ts.Expression[]): string | null {
  const a = args[0];
  if (!a) return null;
  if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) return a.text;
  return null;
}

/** مساراتُ المتحكّمات تحت `TenantGuard` في نصٍّ واحد — بحالها لا بحكمها. */
export function tenantRoutes(source: string, file = 'inline.ts'): RouteDeclaration[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: RouteDeclaration[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isClassDeclaration(n) && usesTenantGuard(n)) {
      const cls = decoratorsOf(n).filter((d) => DECLARATIONS.includes(d.name));
      const clsReason = cls.find((d) => d.name === 'TenantWide');
      for (const m of n.members) {
        if (!ts.isMethodDeclaration(m)) continue;
        const decs = decoratorsOf(m);
        if (!decs.some((d) => HTTP_DECORATORS.includes(d.name))) continue;
        const own = decs.filter((d) => DECLARATIONS.includes(d.name));
        const ownReason = own.find((d) => d.name === 'TenantWide');
        const declared = [...own.map((d) => d.name), ...cls.map((d) => `${d.name}@class`)];
        out.push({
          line: sf.getLineAndCharacterOfPosition(m.getStart(sf)).line + 1,
          controller: n.name?.text ?? '(anonymous)',
          method: m.name.getText(sf),
          declared,
          reason: ownReason ? stringArg(ownReason.args) : clsReason ? stringArg(clsReason.args) : null,
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** ما لا يُعلن، أو يُعلن `TenantWide` بسببٍ أقصرَ من الحدّ — **وهو الحكم**. */
export function undeclaredRoutes(source: string, file = 'inline.ts'): RouteDeclaration[] {
  return tenantRoutes(source, file).filter((r) => r.declared.length === 0 || (r.declared.some((d) => d.startsWith('TenantWide')) && !r.declared.some((d) => d.startsWith('RequiresScreen') || d.startsWith('OwnerOnly')) && (r.reason ?? '').length < MIN_REASON_LENGTH));
}

function treeRoutes(): (RouteDeclaration & { file: string })[] {
  const out: (RouteDeclaration & { file: string })[] = [];
  for (const f of sourceFiles(SRC).filter((p) => p.endsWith('.controller.ts'))) {
    const file = relative(SRC, f).replace(/\\/g, '/');
    for (const r of tenantRoutes(readFileSync(f, 'utf8'), f)) out.push({ ...r, file });
  }
  return out;
}

describe('كلُّ مسارٍ تحت TenantGuard يُعلن نفسَه (ق-١١٩٨/①)', () => {
  const ROUTES = treeRoutes();

  it('يقرأ الشجرةَ فعلاً — مساراتٌ بالمئات، وكلُّ صنفٍ من الإعلانات موجودٌ فيها', () => {
    expect(ROUTES.length).toBeGreaterThan(200);
    for (const kind of DECLARATIONS) {
      expect(ROUTES.some((r) => r.declared.some((d) => d.startsWith(kind)))).toBe(true);
    }
    // eslint-disable-next-line no-console
    console.log(`[إعلان] ${ROUTES.length} مساراً · شاشة ${ROUTES.filter((r) => r.declared.some((d) => d.startsWith('RequiresScreen'))).length} · للمالك ${ROUTES.filter((r) => r.declared.some((d) => d.startsWith('OwnerOnly'))).length} · لكلّ فاعل ${ROUTES.filter((r) => r.declared.some((d) => d.startsWith('TenantWide')) && !r.declared.some((d) => d.startsWith('RequiresScreen') || d.startsWith('OwnerOnly'))).length} · قشرة ${ROUTES.filter((r) => r.declared.some((d) => d.startsWith('SupportShell')) && r.declared.length === 1).length}`);
  });

  it('🔴 لا مسارَ بلا إعلان — ولا TenantWide بسببٍ أقصرَ من الحدّ', () => {
    const bad = ROUTES.filter((r) => r.declared.length === 0 || (r.declared.some((d) => d.startsWith('TenantWide')) && !r.declared.some((d) => d.startsWith('RequiresScreen') || d.startsWith('OwnerOnly')) && (r.reason ?? '').length < MIN_REASON_LENGTH));
    if (bad.length > 0) {
      throw new Error(
        [
          `⛔ ${bad.length} مساراً تحت TenantGuard بلا إعلانٍ كافٍ:`,
          ...bad.map((r) => `   ${r.file}:${r.line}  ${r.controller}.${r.method}  [${r.declared.join(', ') || 'لا شيء'}]${r.reason !== null && r.reason.length < MIN_REASON_LENGTH ? '  (سببٌ أقصرُ من الحدّ)' : ''}`),
          '',
          'أعلن على التابع أو الصنف: `@RequiresScreen(<شاشة>)` · `@OwnerOnly()` · `@TenantWide(<لماذا يُفتح لكلّ فاعل>)` · `@SupportShell()`.',
          'والحارسُ الحيُّ يرفض ما لا يُعلن (`screen_undeclared`) — فالإعلانُ هنا يسبق السقوطَ هناك.',
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });

  describe('مصادقةُ المسبار بحالاتٍ معلومة (ق-٢٦٢)', () => {
    // العيّناتُ قوالبُ نصّيةٌ مباشرة (لا عبر دالّةِ لفّ) — كي يراها `probe-two-cases` نصّاً مصنوعاً (`ق-٣٤٩`).
    const HEADER = "import { Controller, Get, Post, UseGuards } from '@nestjs/common';";

    it('يُدين تابعاً بلا إعلانٍ في صنفٍ تحت TenantGuard — ولا يُدين صنفاً بلا الحارس', () => {
      const bare = `${HEADER}\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\nexport class XController {\n  @Get()\n  list() { return 1; }\n  @Post()\n  @OwnerOnly()\n  create() { return 2; }\n}`;
      expect(undeclaredRoutes(bare).map((r) => r.method)).toEqual(['list']);
      const noGuard = `${HEADER}\n@Controller('y')\n@UseGuards(JwtAuthGuard, PlatformAdminGuard)\nexport class YController {\n  @Get()\n  list() { return 1; }\n}`;
      expect(tenantRoutes(noGuard)).toEqual([]);
    });

    it('الإعلانُ على الصنف يغطّي التوابعَ كلَّها — والسببُ القصير يُدان', () => {
      const ok = `${HEADER}\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\n@TenantWide('قائمةٌ تغذّي منتقياً في كلّ شاشة لكلّ فاعل')\nexport class XController {\n  @Get()\n  list() { return 1; }\n}`;
      expect(undeclaredRoutes(ok)).toEqual([]);
      const short = `${HEADER}\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\n@TenantWide('عامّة')\nexport class XController {\n  @Get()\n  list() { return 1; }\n}`;
      expect(undeclaredRoutes(short).map((r) => r.method)).toEqual(['list']);
      const screen = `${HEADER}\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\n@RequiresScreen('invoice')\nexport class XController {\n  @Get()\n  list() { return 1; }\n}`;
      expect(undeclaredRoutes(screen)).toEqual([]);
    });

    it('وسمٌ مكتوبٌ في تعليقٍ ليس إعلاناً', () => {
      const commented = `${HEADER}\n/** @TenantWide('سببٌ في تعليقٍ لا على الصنف — لا يُحسب') */\n@Controller('x')\n@UseGuards(JwtAuthGuard, TenantGuard)\nexport class XController {\n  @Get()\n  list() { return 1; }\n}`;
      expect(undeclaredRoutes(commented).map((r) => r.method)).toEqual(['list']);
    });
  });
});
