import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';
import * as ts from 'typescript';

/**
 * 🔴 `ق-١٣٦٧` — **تعداداتُ الواجهة ومقابلاتُها في الخادم: تُقارَن كلُّها لا واحداً.**
 *
 * **بنصّ المالك**: «ثلاثُ تعداداتٍ في الواجهة أضيقُ من أعمدتها … ⇒ فقيمةٌ في القاعدة لا تعرفها الشاشة. ✅ وتُصلَح، والحارسُ
 * يقارن التعداداتِ الخمسةَ والسبعين كلَّها لا واحداً.»
 *
 * ## العلّة — صنفُ حادثة `PARTIAL` (`CLAUDE.md §4`)
 * نوعُ الواجهة **مكتوبٌ بيد** ولا رابطَ يشدّه إلى الخادم: `Record<InvoiceStatus, …>` يُرضي المترجمَ ما دام النوعان متّسقَين مع أنفسهما
 * لا مع القاعدة. فأُضيفت `PARTIAL` إلى التعداد ولم تُضَف إلى الواجهة، **فانهارت `/invoices` حين وُجد أوّلُ صفٍّ بها**. والحارسُ الذي
 * وُلد يومها يقارن `InvoiceStatus` وحدَه **بنسخةٍ ثالثةٍ مكتوبةٍ داخل الاختبار** — فالخطرُ بقي قائماً في ثلاثة (المسح `26`).
 *
 * ## ما يقارنه — من المصدرين لا من نسخة
 * - **السجلّ** `docs/web-enum-mirrors.json`: كلُّ تعدادٍ في الواجهة ومقابلُه في الخادم **بمرجعٍ يُقرأ** — تعدادُ `Prisma` · مصفوفةٌ
 *   ثابتة · اتّحادٌ حرفيّ · خاصيّةٌ باتّحادٍ مضمَّن · مزخرِفُ `@IsIn`. ولا قيمةَ مكتوبةٌ فيه: القيمُ تُقرأ من الملفّين في كلِّ تشغيل.
 * - **① التغطية**: كلُّ اتّحادٍ حرفيٍّ مصدَّرٍ في `apps/web/src/api` مسجَّلٌ أو معلَنٌ «للواجهة وحدَها» بسببه — **فتعدادٌ جديدٌ بلا
 *   مقابلٍ مسجَّل يُسقط الحزمة** (`§8.7`: يُمسح الكلُّ ويُستثنى بالاسم، لا يُسرد المشمول).
 * - **② التطابق**: قيمُ كلِّ تعدادٍ = قيمُ مقابله، حرفاً بحرف.
 * - **③ العمود** — وهو ما فات الحارسَ القديمَ كلُّه: لكلِّ واجهةٍ في `apps/web/src/api` **باسم نموذجٍ في `Prisma`**، كلُّ خاصيّةٍ
 *   عمودُها تعدادٌ **تعرف قيمَه كلَّها** — فالثلاثةُ الأضيقُ كانت تطابق مقابلَها (حدَّ الإدخال) وتقصر عن عمودها.
 *
 * ⚠️ **حدودُه معلَنة**: (١) الواجهةُ التي لا تحمل اسمَ نموذجها (`ContractListItem` …) خارج ③ — وتبقى في ① و②. (٢) يقرأ التصريحَ
 * لا الاستعمال: قيمةٌ تُقارَن حرفياً في صفحةٍ (`p.method === 'CASH' ? … : …`) لا يراها — ولذلك صارت الخرائطُ `Record<…>` التي
 * يُلزمها المترجمُ بكلِّ قيمة. (٣) قيودُ `CHECK` التي تضيّق عموداً عن تعداده (في الهجرات) لا يقرؤها — فعمودٌ مقيَّدٌ يُعلَن في السجلّ.
 */

export const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
export const MIRRORS_FILE = 'docs/web-enum-mirrors.json';
export const WEB_API_DIR = 'apps/web/src/api';
export const PRISMA_SCHEMA = 'apps/api/prisma/schema.prisma';

const posix = (p: string) => p.split(sep).join('/');

export interface MirrorEntry {
  /** `apps/web/src/…#TypeName` */
  web: string;
  /** `prisma:Enum` · `const:file#NAME` · `type:file#Name` · `prop:file#Container.prop` · `isIn:file#Class.prop` */
  server: string;
  /** سببُ ما يخالف المعتاد (اسمٌ مختلف · مقابلٌ مضيَّق عمداً) — اختياريّ. */
  note?: string;
}

export interface MirrorsRegistry {
  mirrors: MirrorEntry[];
  /** اتّحاداتٌ حرفيةٌ في `apps/web/src/api` لا مقابلَ لها في الخادم — **بسببٍ مكتوب**. */
  webOnly: { web: string; reason: string }[];
}

export function readRegistry(root = REPO_ROOT): MirrorsRegistry {
  return JSON.parse(readFileSync(join(root, MIRRORS_FILE), 'utf8')) as MirrorsRegistry;
}

// ── Prisma ───────────────────────────────────────────────────────────────────────────────────────────

export interface PrismaShape {
  enums: Map<string, string[]>;
  /** نموذج ⟵ (حقل ⟵ نوعُه بلا `?` ولا `[]`) */
  models: Map<string, Map<string, string>>;
}

/** قراءةُ الكتلتين `enum` و`model` سطراً سطراً — التعليقاتُ (`//` و`///`) تُجرَّد قبل المطابقة. */
export function parsePrisma(text: string): PrismaShape {
  const enums = new Map<string, string[]>();
  const models = new Map<string, Map<string, string>>();
  let cur: { kind: 'enum' | 'model'; name: string } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!cur) {
      const m = /^(enum|model)\s+(\w+)\s*\{$/.exec(line);
      if (m) {
        cur = { kind: m[1] as 'enum' | 'model', name: m[2] };
        if (cur.kind === 'enum') enums.set(cur.name, []);
        else models.set(cur.name, new Map());
      }
      continue;
    }
    if (line === '}') {
      cur = null;
      continue;
    }
    if (!line || line.startsWith('@@')) continue;
    if (cur.kind === 'enum') {
      const v = /^([A-Za-z_]\w*)/.exec(line);
      if (v) enums.get(cur.name)!.push(v[1]);
    } else {
      const f = /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)/.exec(line);
      if (f) models.get(cur.name)!.set(f[1], f[2]);
    }
  }
  return { enums, models };
}

export function readPrisma(root = REPO_ROOT): PrismaShape {
  return parsePrisma(readFileSync(join(root, PRISMA_SCHEMA), 'utf8'));
}

// ── TypeScript ───────────────────────────────────────────────────────────────────────────────────────

const sourceCache = new Map<string, ts.SourceFile>();

/** يقرأ الملفَّ مرّةً ويحفظ شجرتَه؛ ونصٌّ مُمرَّر (عيّناتُ الإثبات) يُحلَّل ولا يُحفظ. */
export function sourceOf(absPath: string, text?: string): ts.SourceFile {
  const kind = absPath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  if (text !== undefined) return ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, kind);
  const hit = sourceCache.get(absPath);
  if (hit) return hit;
  const sf = ts.createSourceFile(absPath, readFileSync(absPath, 'utf8'), ts.ScriptTarget.Latest, true, kind);
  sourceCache.set(absPath, sf);
  return sf;
}

const isNullish = (t: ts.TypeNode) =>
  t.kind === ts.SyntaxKind.NullKeyword ||
  t.kind === ts.SyntaxKind.UndefinedKeyword ||
  (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword);

const unwrapExpr = (e: ts.Expression): ts.Expression => {
  let x = e;
  for (;;) {
    if (ts.isAsExpression(x) || ts.isParenthesizedExpression(x) || ts.isSatisfiesExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
    else return x;
  }
};

/** قيمُ مصفوفةٍ حرفية (`['A', 'B'] as const`) — أو `null` إن لم تكن كلُّها نصوصاً. */
export function arrayLiteralValues(e: ts.Expression | undefined): string[] | null {
  if (!e) return null;
  const x = unwrapExpr(e);
  if (!ts.isArrayLiteralExpression(x)) return null;
  const out: string[] = [];
  for (const el of x.elements) {
    if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) out.push(el.text);
    else return null;
  }
  return out;
}

function findConst(sf: ts.SourceFile, name: string): ts.VariableDeclaration | undefined {
  let found: ts.VariableDeclaration | undefined;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) found = n;
    else ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function findTypeAlias(sf: ts.SourceFile, name: string): ts.TypeAliasDeclaration | undefined {
  return sf.statements.find((s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === name);
}

/** سياقُ الحلّ: ما مُرّ به (فلا دوران) · وتعداداتُ `Prisma` لاسمٍ مستوردٍ من `@prisma/client`. */
export interface ResolveContext {
  seen: Set<string>;
  prismaEnums?: Map<string, string[]>;
}

const newContext = (prismaEnums?: Map<string, string[]>): ResolveContext => ({ seen: new Set(), prismaEnums });

/**
 * قيمُ نوعٍ **حرفيّ**: اتّحادُ نصوص (`null`/`undefined` يُسقطان) · `(typeof X)[number]` على مصفوفةٍ ثابتة · `Exclude<X, …>` ·
 * أو اسمُ نوعٍ آخر في الملفّ نفسِه أو مستوردٌ منه (ومن `@prisma/client` تعدادُه). وغيرُ ذلك `null` — فالنوعُ ليس تعداداً.
 */
export function typeValues(sf: ts.SourceFile, node: ts.TypeNode | undefined, ctx: ResolveContext = newContext()): string[] | null {
  if (!node) return null;
  if (ts.isParenthesizedTypeNode(node)) return typeValues(sf, node.type, ctx);
  if (ts.isLiteralTypeNode(node) && (ts.isStringLiteral(node.literal) || ts.isNoSubstitutionTemplateLiteral(node.literal))) return [node.literal.text];
  if (ts.isUnionTypeNode(node)) {
    const out: string[] = [];
    for (const t of node.types) {
      if (isNullish(t)) continue;
      const v = typeValues(sf, t, ctx);
      if (!v) return null;
      out.push(...v);
    }
    return out.length ? out : null;
  }
  // `(typeof X)[number]`
  if (ts.isIndexedAccessTypeNode(node) && node.indexType.kind === ts.SyntaxKind.NumberKeyword) {
    const obj = ts.isParenthesizedTypeNode(node.objectType) ? node.objectType.type : node.objectType;
    if (ts.isTypeQueryNode(obj) && ts.isIdentifier(obj.exprName)) return arrayLiteralValues(findConst(sf, obj.exprName.text)?.initializer);
    return null;
  }
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    // `Exclude<X, 'A' | 'B'>` — قيمُ الأوّل ناقصَ الثاني.
    if (node.typeName.text === 'Exclude' && node.typeArguments?.length === 2) {
      const all = typeValues(sf, node.typeArguments[0], ctx);
      const drop = typeValues(sf, node.typeArguments[1], ctx);
      return all && drop ? all.filter((v) => !drop.includes(v)) : null;
    }
    if (!node.typeArguments) return namedTypeValues(sf, node.typeName.text, ctx);
  }
  return null;
}

/** قيمُ نوعٍ مسمّى — في الملفّ نفسِه، أو عبر استيرادٍ نسبيّ، أو تعدادٌ من `@prisma/client`. */
export function namedTypeValues(sf: ts.SourceFile, name: string, ctx: ResolveContext = newContext()): string[] | null {
  const key = `${sf.fileName}#${name}`;
  if (ctx.seen.has(key)) return null;
  ctx.seen.add(key);
  const alias = findTypeAlias(sf, name);
  if (alias) return typeValues(sf, alias.type, ctx);
  const target = importedFrom(sf, name);
  if (target?.file) return namedTypeValues(sourceOf(target.file), target.name, ctx);
  if (target?.prisma) return ctx.prismaEnums?.get(target.name) ?? null;
  return null;
}

/**
 * أين يعيش اسمٌ مستورد: الملفُّ المحلول والاسمُ فيه (`import { A as B }` ⟵ `A`) — أو `prisma` إن كان من `@prisma/client`.
 */
export function importedFrom(sf: ts.SourceFile, local: string): { file?: string; prisma?: boolean; name: string } | null {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue;
    const spec = (st.moduleSpecifier as ts.StringLiteral).text;
    for (const el of st.importClause.namedBindings.elements) {
      if (el.name.text !== local) continue;
      const name = (el.propertyName ?? el.name).text;
      if (spec === '@prisma/client') return { prisma: true, name };
      if (!spec.startsWith('.')) return null;
      const base = resolve(dirname(sf.fileName), spec);
      for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        if (existsSync(cand)) return { file: cand, name };
      }
    }
  }
  return null;
}

// ── المراجع في السجلّ ─────────────────────────────────────────────────────────────────────────────────

/** يحلّ `file#Name` إلى قيم نوعٍ في الواجهة. */
export function webValues(ref: string, root = REPO_ROOT, prisma?: PrismaShape): string[] | null {
  const [file, name] = ref.split('#');
  const abs = join(root, file);
  if (!existsSync(abs)) return null;
  return namedTypeValues(sourceOf(abs), name, newContext(prisma?.enums));
}

function memberType(container: ts.Node, prop: string): { type?: ts.TypeNode; decorators: readonly ts.Decorator[] } | null {
  const members: readonly ts.Node[] = ts.isInterfaceDeclaration(container)
    ? container.members
    : ts.isClassDeclaration(container)
      ? container.members
      : ts.isTypeAliasDeclaration(container) && ts.isTypeLiteralNode(container.type)
        ? container.type.members
        : [];
  for (const m of members) {
    if ((ts.isPropertySignature(m) || ts.isPropertyDeclaration(m)) && m.name && ts.isIdentifier(m.name) && m.name.text === prop) {
      const decorators = ts.canHaveDecorators(m) ? (ts.getDecorators(m) ?? []) : [];
      return { type: m.type, decorators };
    }
  }
  return null;
}

function findContainer(sf: ts.SourceFile, name: string): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (found) return;
    if ((ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n) || ts.isTypeAliasDeclaration(n)) && n.name?.text === name) found = n;
    else ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** يحلّ مرجعَ الخادم في السجلّ إلى قيمه — أو `null` إن لم يُوجد (فالسجلُّ متقادم). */
export function serverValues(ref: string, prisma: PrismaShape, root = REPO_ROOT): string[] | null {
  const colon = ref.indexOf(':');
  const kind = ref.slice(0, colon);
  const rest = ref.slice(colon + 1);
  if (kind === 'prisma') return prisma.enums.get(rest) ?? null;
  const [file, sym] = rest.split('#');
  const abs = join(root, file);
  if (!existsSync(abs) || !sym) return null;
  const sf = sourceOf(abs);
  if (kind === 'const') return arrayLiteralValues(findConst(sf, sym)?.initializer);
  if (kind === 'type') return namedTypeValues(sf, sym, newContext(prisma.enums));
  const [containerName, prop] = sym.split('.');
  const container = findContainer(sf, containerName);
  if (!container || !prop) return null;
  const member = memberType(container, prop);
  if (!member) return null;
  if (kind === 'prop') return typeValues(sf, member.type, newContext(prisma.enums));
  if (kind === 'isIn') {
    for (const d of member.decorators) {
      const call = d.expression;
      if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== 'IsIn') continue;
      const arg = call.arguments[0];
      if (!arg) return null;
      if (ts.isIdentifier(unwrapExpr(arg))) return arrayLiteralValues(findConst(sf, (unwrapExpr(arg) as ts.Identifier).text)?.initializer);
      return arrayLiteralValues(arg);
    }
    return null;
  }
  return null;
}

// ── الماشي على الواجهة ────────────────────────────────────────────────────────────────────────────────

export function webApiFiles(root = REPO_ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
    }
  };
  walk(join(root, WEB_API_DIR));
  return out.sort();
}

/** كلُّ اتّحادٍ حرفيٍّ **مصدَّر** في ملفّ: `file#Name` ⟵ قيمُه. */
export function exportedLiteralUnions(absFile: string, root = REPO_ROOT, prisma?: PrismaShape): Map<string, string[]> {
  const sf = sourceOf(absFile);
  const out = new Map<string, string[]>();
  for (const st of sf.statements) {
    if (!ts.isTypeAliasDeclaration(st)) continue;
    if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const v = typeValues(sf, st.type, newContext(prisma?.enums));
    if (v && v.length > 0) out.set(`${posix(relative(root, absFile))}#${st.name.text}`, v);
  }
  return out;
}

export interface ColumnMismatch {
  where: string;
  model: string;
  field: string;
  prismaEnum: string;
  missing: string[];
}

/**
 * ③ لكلِّ واجهةٍ **مصدَّرة باسم نموذجٍ في `Prisma`**: كلُّ خاصيّةٍ حقلُها في النموذج تعدادٌ يجب أن يعرف نوعُها في الواجهة قيمَه
 * كلَّها. وخاصيّةٌ نوعُها `string` أو شكلٌ غيرُ حرفيٍّ لا تُحاسَب (لا تضييقَ فيها). ويعيد ما قرأه أيضاً — فحارسٌ لا يرى شيئاً يُكشف.
 */
export function columnMismatches(prisma: PrismaShape, files: string[], root = REPO_ROOT): { checked: string[]; mismatches: ColumnMismatch[] } {
  return columnMismatchesIn(prisma, files.map((f) => sourceOf(f)), root);
}

/** النواةُ على شجراتٍ محلَّلة — فتُصادَق بعيّناتٍ لا تمسّ القرص. */
export function columnMismatchesIn(prisma: PrismaShape, sources: ts.SourceFile[], root = REPO_ROOT): { checked: string[]; mismatches: ColumnMismatch[] } {
  const checked: string[] = [];
  const mismatches: ColumnMismatch[] = [];
  for (const sf of sources) {
    const abs = sf.fileName;
    for (const st of sf.statements) {
      const isIface = ts.isInterfaceDeclaration(st);
      const isTypeLit = ts.isTypeAliasDeclaration(st) && ts.isTypeLiteralNode(st.type);
      if (!isIface && !isTypeLit) continue;
      if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      const model = prisma.models.get(st.name.text);
      if (!model) continue;
      const members = isIface ? (st as ts.InterfaceDeclaration).members : ((st as ts.TypeAliasDeclaration).type as ts.TypeLiteralNode).members;
      for (const m of members) {
        if (!ts.isPropertySignature(m) || !m.name || !ts.isIdentifier(m.name)) continue;
        const fieldType = model.get(m.name.text);
        if (!fieldType) continue;
        const prismaValues = prisma.enums.get(fieldType);
        if (!prismaValues) continue;
        const where = `${posix(relative(root, abs))}#${st.name.text}.${m.name.text}`;
        const values = typeValues(sf, m.type, newContext(prisma.enums));
        if (!values) continue;
        checked.push(where);
        const missing = prismaValues.filter((v) => !values.includes(v));
        if (missing.length) mismatches.push({ where, model: st.name.text, field: m.name.text, prismaEnum: fieldType, missing });
      }
    }
  }
  return { checked, mismatches };
}

export const sameSet = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
