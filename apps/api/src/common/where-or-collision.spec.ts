import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { readsDeclaredStrings, sourceFiles } from './source-scan.util';

// 🔴 **يقرأ الشيفرةَ شجرةً** (`typescript`) لا نصّاً: مفتاحٌ مكتوبٌ في تعليقٍ أو سلسلةٍ ليس عقدةَ خاصّيةٍ أصلاً.
readsDeclaredStrings();

/**
 * **مفتاحان من `OR` (أو `AND` أو `NOT`) في كائنٍ واحد: الثاني يمحو الأوّل بصمت** (توجيه ٢٧٤ · مراجعة 3.3 ج-2).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * `branchFilter` المقيَّدُ كائنٌ مفتاحُه `OR` (فروعُ القارئ أو ما لا فرعَ له). فإن نُشر في كائن `where` نفسِه مع
 * `OR` آخر (البحث · `NOT_REPLACED_REJECTED`) **حلّ الثاني محلّ الأوّل** — قاعدةُ اللغة لا خطأُ Prisma — **فعاد
 * الاستعلامُ بصفوف الفروع كلِّها لموظّفٍ مقيَّد**، بلا خطأٍ ولا تحذير. ثبت بالتشغيل في البحث في الفواتير والسندات
 * وسندات الصرف والعروض والشطب، وفي أعمار الذمم بلا فرعٍ مسمّى (فوصلت اللوحةَ ذممُ المنشأة كلِّها).
 *
 * **والدرسُ كان مكتوباً** في ثلاثة مواضع («a bare spread of two ORs would let the search clause clobber the branch
 * restriction») **ولم يُحرس**، فتكرّر في ستّة — وهو `ق-٥٠٢`: موثَّقٌ لا محروس.
 *
 * ── ما يقرأ ────────────────────────────────────────────────────────────────
 *
 * لكلِّ كائنٍ حرفيّ في `src`: كم عضواً يحمل المفتاحَ نفسَه في أعلاه — خاصّيةٌ باسمه، أو نشرٌ لما يحمله. وما «يحمله»
 * **مشتقٌّ من الشجرة لا من قائمة**: كلُّ دالّةٍ أو ثابتٍ في `src` يُرجع كائناً بالمفتاح (`branchFilter` ·
 * `requestedBranchFilter` · `NOT_REPLACED_REJECTED` … وما يُكتب غداً)، وكلُّ متغيّرٍ محلّيٍّ يُسند منها، والشرطيُّ
 * بفرعَيه. فعضوان يحملان المفتاحَ نفسَه ⟸ سقوط.
 *
 * ── حدودُه المعلَنة ───────────────────────────────────────────────────────
 *
 * ⚠️ **① ما يُمرَّر وسيطاً لا يُتتبَّع**: كائنٌ يصل دالّةً معاملاً ثم يُنشر لا يُعرف ما يحمله. والعلاجُ في الموضع
 * معروف: `AND: [مرشِّح، شرط]` لا النشر.
 * ⚠️ **② ولا يرى الكائنَ يُبنى خطوةً خطوة** (`where.OR = …` بعد الإنشاء) — إسنادٌ لا كائنٌ حرفيّ.
 */
const SRC = join(__dirname, '..');
export const COLLIDING_KEYS = ['OR', 'AND', 'NOT'] as const;
type Key = (typeof COLLIDING_KEYS)[number];
const isKey = (name: string): name is Key => (COLLIDING_KEYS as readonly string[]).includes(name);

/** ما يحمله كلُّ اسمٍ معرَّفٍ في رأس ملفّ (دالّةً أو ثابتاً) من المفاتيح في أعلى ما يُرجعه. */
export type Carriers = Map<string, Set<Key>>;

function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  for (;;) {
    if (ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur) || ts.isTypeAssertionExpression(cur) || ts.isNonNullExpression(cur) || ts.isSatisfiesExpression(cur)) cur = cur.expression;
    else return cur;
  }
}

const memberName = (m: ts.ObjectLiteralElementLike): string | null => {
  if ((ts.isPropertyAssignment(m) || ts.isShorthandPropertyAssignment(m)) && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) return m.name.text;
  return null;
};

/** أقربُ تعريفٍ لمتغيّرٍ محلّيٍّ بهذا الاسم صعوداً من العقدة — ما يُسند إليه فقط. */
function localInitializer(id: ts.Identifier): ts.Expression | null {
  let p: ts.Node | undefined = id.parent;
  while (p) {
    const statements = ts.isBlock(p) || ts.isSourceFile(p) || ts.isModuleBlock(p) ? p.statements : null;
    if (statements) {
      for (const s of statements) {
        if (!ts.isVariableStatement(s)) continue;
        for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === id.text && d.initializer && d.initializer !== id) return d.initializer;
      }
    }
    p = p.parent;
  }
  return null;
}

/** المفاتيحُ التي قد يحملها الكائنُ الناتج عن تعبيرٍ في أعلاه. */
export function topKeys(expr: ts.Expression, carriers: Carriers, seen: Set<ts.Node> = new Set()): Set<Key> {
  const e = unwrap(expr);
  const out = new Set<Key>();
  if (seen.has(e)) return out;
  seen.add(e);
  if (ts.isObjectLiteralExpression(e)) {
    for (const m of e.properties) {
      const name = memberName(m);
      if (name && isKey(name)) out.add(name);
      if (ts.isSpreadAssignment(m)) for (const k of topKeys(m.expression, carriers, seen)) out.add(k);
    }
  } else if (ts.isConditionalExpression(e)) {
    for (const k of topKeys(e.whenTrue, carriers, seen)) out.add(k);
    for (const k of topKeys(e.whenFalse, carriers, seen)) out.add(k);
  } else if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) {
    for (const k of topKeys(e.left, carriers, seen)) out.add(k);
    for (const k of topKeys(e.right, carriers, seen)) out.add(k);
  } else if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
    for (const k of carriers.get(e.expression.text) ?? []) out.add(k);
  } else if (ts.isIdentifier(e)) {
    const init = localInitializer(e);
    if (init) for (const k of topKeys(init, carriers, seen)) out.add(k);
    else for (const k of carriers.get(e.text) ?? []) out.add(k);
  }
  return out;
}

/** تعبيراتُ الإرجاع في جسم دالّةٍ — بلا ما في دوالّها الداخلية. */
function returnedExpressions(body: ts.ConciseBody): ts.Expression[] {
  if (!ts.isBlock(body)) return [body];
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, visit);
  };
  body.statements.forEach(visit);
  return out;
}

/** المعرَّفاتُ في رأس الملفّ: دوالُّ وثوابتُ، بما يُرجع كلٌّ منها (يُقيَّم لاحقاً حتى الاستقرار). */
function topLevelDefinitions(sf: ts.SourceFile): [string, ts.Expression[]][] {
  const out: [string, ts.Expression[]][] = [];
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name && s.body) out.push([s.name.text, returnedExpressions(s.body)]);
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const init = unwrap(d.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) out.push([d.name.text, returnedExpressions(init.body)]);
        else out.push([d.name.text, [d.initializer]]);
      }
    }
  }
  return out;
}

/** الحاملون عبر الملفّات كلِّها — نقطةٌ ثابتة: `requestedBranchFilter` يحمل `OR` لأنه يُرجع `branchFilter(...)`. */
export function deriveCarriers(files: ts.SourceFile[]): Carriers {
  const defs = files.flatMap(topLevelDefinitions);
  const carriers: Carriers = new Map();
  for (let changed = true, rounds = 0; changed && rounds < 20; rounds++) {
    changed = false;
    for (const [name, exprs] of defs) {
      const keys = carriers.get(name) ?? new Set<Key>();
      const before = keys.size;
      for (const e of exprs) for (const k of topKeys(e, carriers)) keys.add(k);
      if (keys.size > 0) carriers.set(name, keys);
      if (keys.size !== before) changed = true;
    }
  }
  return carriers;
}

export interface Collision {
  line: number;
  key: Key;
  members: string[];
}

/** الكائناتُ الحرفيّة التي يحمل فيها عضوان المفتاحَ نفسَه. */
export function collisions(sf: ts.SourceFile, carriers: Carriers): { collisions: Collision[]; literals: number } {
  const out: Collision[] = [];
  let literals = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      literals++;
      const byKey = new Map<Key, string[]>();
      for (const m of n.properties) {
        const name = memberName(m);
        const keys = new Set<Key>();
        if (name && isKey(name)) keys.add(name);
        if (ts.isSpreadAssignment(m)) for (const k of topKeys(m.expression, carriers)) keys.add(k);
        for (const k of keys) byKey.set(k, [...(byKey.get(k) ?? []), m.getText(sf).replace(/\s+/g, ' ').slice(0, 70)]);
      }
      for (const [key, members] of byKey) {
        if (members.length >= 2) out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, key, members });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { collisions: out, literals };
}

const parse = (file: string, text: string): ts.SourceFile => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

describe('لا كائنَ يحمل مفتاحَ OR أو AND أو NOT مرّتين: الثاني يمحو مرشِّحَ الفرع (توجيه ٢٧٤ · ج-2)', () => {
  const FILES = sourceFiles(SRC).map((f) => parse(f, readFileSync(f, 'utf8')));
  const CARRIERS = deriveCarriers(FILES);

  it('المسبارُ يرى: يقرأ الشجرةَ ويعرف الحاملين الأربعة المعروفين', () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect({
      branchFilter: [...(CARRIERS.get('branchFilter') ?? [])],
      requestedBranchFilter: [...(CARRIERS.get('requestedBranchFilter') ?? [])],
      NOT_REPLACED_REJECTED: [...(CARRIERS.get('NOT_REPLACED_REJECTED') ?? [])],
      searchWhere: [...(CARRIERS.get('searchWhere') ?? [])],
    }).toEqual({ branchFilter: ['OR'], requestedBranchFilter: ['OR'], NOT_REPLACED_REJECTED: ['OR'], searchWhere: ['OR'] });
  });

  it('المسبارُ يُصيب ما يجب ويتخطّى ما يجب (حالتان معلومتان لكلٍّ)', () => {
    const sample = parse(
      'sample.ts',
      [
        "function branchFilter(ids: string[] | 'all') { return ids === 'all' ? {} : ({ OR: [{ branchId: { in: ids } }, { branchId: null }] } as never); }",
        'const NOT_X = { OR: [{ a: 1 }, { b: 2 }] };',
        'function bad1(ids: string[], term?: string) { return { ...branchFilter(ids), ...(term ? { OR: [{ no: term }] } : {}) }; }',
        'function bad2(ids: string[]) { const scope = branchFilter(ids); return { a: 1, ...scope, ...NOT_X }; }',
        'function bad3(term?: string) { const s = term ? { AND: [{ x: term }] } : {}; return { AND: [1], ...s }; }',
        'function good1(ids: string[], term?: string) { return { AND: [branchFilter(ids), term ? { OR: [{ no: term }] } : {}] }; }',
        'function good2(ids: string[], term?: string) { return { employee: branchFilter(ids), ...(term ? { OR: [{ no: term }] } : {}) }; }',
      ].join('\n'),
    );
    const carriers = deriveCarriers([sample]);
    const lines = collisions(sample, carriers).collisions.map((c) => `${c.line}:${c.key}`);
    expect(lines).toEqual(['3:OR', '4:OR', '5:AND']);
  });

  it('🔴 لا كائنَ في الشيفرة يحمل المفتاحَ نفسَه من عضوَين', () => {
    const bad: string[] = [];
    let literals = 0;
    for (const sf of FILES) {
      const result = collisions(sf, CARRIERS);
      literals += result.literals;
      for (const c of result.collisions) bad.push(`   ${relative(SRC, sf.fileName).replace(/\\/g, '/')}:${c.line}  ${c.key}  ←  ${c.members.join('  |  ')}`);
    }
    expect(literals).toBeGreaterThan(1000);
    if (bad.length > 0) {
      throw new Error(
        [
          `⛔ ${bad.length} كائناً يحمل المفتاحَ نفسَه من عضوَين — والثاني يمحو الأوّل بصمت:`,
          ...bad,
          '',
          'اجمعهما تحت `AND`: `AND: [branchFilter(allowedBranchIds), term ? { OR: [...] } : {}]` — لا نشرَين في الكائن نفسِه.',
        ].join('\n'),
      );
    }
    expect(bad).toEqual([]);
  });
});
