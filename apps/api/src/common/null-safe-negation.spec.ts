import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ المصدرَ نصّاً** (`ق-٣٧٥`): مرشِّحاتُ `Prisma` كما كُتبت، والمخطّطَ كما هو.
readsDeclaredStrings();

/**
 * **نفيٌ في مرشِّحٍ يستثني المجهولَ معه** (`ق-٥٩٦`).
 *
 * ── العلّة ─────────────────────────────────────────────────────────────
 *
 * `NOT (col = v)` على عمودٍ فارغٍ **يعطي `NULL` لا `TRUE`** — فيسقط الصفُّ من النتيجة.
 * ⇒ **والسؤالُ «من لم يفعل؟» يُجاب بمن فعل غيرَ ذلك، لا بمن لم يُسجَّل له فعل** —
 * **ومن لم يُسجَّل له فعلٌ قطُّ هو المقصودُ غالباً**.
 *
 * **ووقع فعلاً** (2026-09-11): تذكيرُ الموافقة على المعالجين الفرعيين رشّح
 * `NOT { consentedListVersion: v }` — **فسقط كلُّ من لم يقبل قطّ، وهم كلُّ المقصودين**.
 * النتيجةُ المقيسة: **صفرُ إشعارات**، **وبوّابةٌ تمنع التاجرَ بلا أن يصله تذكيرٌ واحد**.
 *
 * ── البوّابة ───────────────────────────────────────────────────────────
 *
 * كلُّ نفيٍ في مرشِّح (`{ not: قيمة }` · `{ notIn: … }` · `NOT: { حقل: قيمة }`) **على اسم
 * حقلٍ يقبل الفراغ في أيّ نموذج** — **إمّا يُصحَّح بجمعٍ صريحٍ مع الفارغ** (`OR: [{ f: null },
 * { f: { not: v } }]`) **وإمّا يُعلن أن الفارغَ غيرُ مقصودٍ هنا** بعلامة `DECLARATION`.
 *
 * ⚠️ **وحدُّها المعلَن**: تُطابق **بالاسم لا بالنموذج** — فحقلٌ فارغٌ في نموذجٍ وممتلئٌ في
 * آخر يُوقفها على الثاني كذلك. **وهذا إفراطٌ مقصود**: ثمنُه سطرُ إعلان، وثمنُ العكس
 * استعلامٌ يكذب صامتاً. **ولا تُقاس على «القصد» — فالقصدُ ما لا تحمله البيانات** (`ق-٥٠٠`).
 *
 * ⚠️ **وتمنع الغفلةَ لا الخطأ المتعمَّد**: من أعلن «الفارغُ غيرُ مقصود» وهو مقصودٌ يمرّ.
 */
const API = join(__dirname, '..', '..');
const SCHEMA = readFileSync(join(API, 'prisma', 'schema.prisma'), 'utf8');

/** علامةُ الإعلان — تُكتب في السطر نفسِه أو في السطر الذي قبله. */
export const DECLARATION = 'الفارغُ غيرُ مقصود';

/** الحقولُ القابلةُ للفراغ — **مشتقّةٌ من المخطّط**: `name Type?` داخل كتلة نموذج. */
export function nullableFields(schema: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    for (const raw of m[2].split(/\r?\n/)) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      const f = line.match(/^(\w+)\s+(\w+)\?(\s|$|\[)/);
      if (!f) continue;
      out.set(f[1], [...(out.get(f[1]) ?? []), m[1]]);
    }
  }
  return out;
}

export interface Negation {
  file: string;
  line: number;
  field: string;
  kind: 'not' | 'notIn' | 'NOT';
  text: string;
  /** أُعلن أن الفارغَ غيرُ مقصودٍ هنا. */
  declared: boolean;
  /** **جُمع الفارغُ صراحةً** — `OR: [{ f: null }, { f: { not: v } }]`؛ وهو الدواءُ لا الإعلان. */
  cured: boolean;
}

/** مواضعُ النفي في مرشِّحات `Prisma` — **بثلاثة أشكالها**، و`not: null` ليست منها. */
export function negations(text: string, file: string): Negation[] {
  const out: Negation[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const clean = raw.replace(/\/\/.*$/, '');
    const declared = raw.includes(DECLARATION) || (lines[i - 1] ?? '').includes(DECLARATION);
    // ⭐ **والدواءُ يُقرأ كما يُقرأ الداء**: جمعُ الفارغ صراحةً في السطر نفسِه أو جارَيه
    //    (`{ f: null }`) هو التصحيحُ القانونيّ — **فلو لم يُعرَف لَوجب إعلانٌ على كلِّ
    //    إصلاحٍ صحيح**، فيتعوّد الكاتبُ الإعلانَ بدل الإصلاح.
    const near = [lines[i - 1] ?? '', raw, lines[i + 1] ?? ''].join('\n');
    const push = (field: string, kind: Negation['kind']) =>
      out.push({ file, line: i + 1, field, kind, text: clean.trim(), declared, cured: new RegExp(`\\{\\s*${field}\\s*:\\s*null\\s*\\}`).test(near) });
    for (const m of clean.matchAll(/(\w+)\s*:\s*\{\s*not\s*:\s*([^}]+)\}/g)) {
      if (!/^null\b/.test(m[2].trim())) push(m[1], 'not');
    }
    for (const m of clean.matchAll(/(\w+)\s*:\s*\{\s*notIn\s*:/g)) push(m[1], 'notIn');
    for (const m of clean.matchAll(/NOT\s*:\s*\{\s*(\w+)\s*:\s*([^},]+)/g)) {
      if (!/^null\b/.test(m[2].trim())) push(m[1], 'NOT');
    }
  });
  return out;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== 'node_modules' && e !== 'dist') sourceFiles(p, acc);
    } else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}

describe('نفيٌ في مرشِّحٍ يستثني المجهولَ معه (ق-٥٩٦)', () => {
  const nullable = nullableFields(SCHEMA);
  const files = sourceFiles(join(API, 'src'));
  const found = files.flatMap((f) => negations(readFileSync(f, 'utf8'), f.replace(API, 'apps/api')));

  it('⓪ حارسٌ على المجسّ — بحالاتٍ معروفةِ النتيجة لا بمخطَّطٍ يتغيّر (ق-٣٧٠)', () => {
    // ⚠️ **الفحصُ على نصٍّ مصنوع**: ربطُ المجسّ بحقلٍ بعينه في المخطّط يجعله يسقط يوم
    //    يُعاد تسميةُ الحقل — **فيُقاس الشكلُ لا الاسم**.
    const fixture = 'model X {\n  gone DateTime?\n  companyId String\n  kind Kind\n}\n';
    expect([...nullableFields(fixture).keys()]).toEqual(['gone']);

    // موجبة: صيغةُ النفي التي وقعت فعلاً — تُمسَك وتُنسَب إلى حقلها.
    expect(negations('where: { NOT: { gone: v } }', 'x').map((n) => `${n.field}:${n.kind}`)).toEqual(['gone:NOT']);
    expect(negations('where: { gone: { not: v } }', 'x').map((n) => `${n.field}:${n.kind}`)).toEqual(['gone:not']);
    // سالبة: `not: null` ليست نفيَ قيمةٍ بل «ليس فارغاً» — ولا تُمسَك.
    expect(negations('where: { gone: { not: null } }', 'x')).toEqual([]);
    // وسالبةٌ ثانية: المعلَنُ لا يُعدّ خطراً.
    expect(negations(`where: { gone: { not: v } } // ${DECLARATION}`, 'x')[0].declared).toBe(true);
    // وثالثةٌ: **المداوى** — جمعُ الفارغ صراحةً — يُعرَف دواءً لا داءً.
    expect(negations('OR: [{ gone: null }, { gone: { not: v } }],', 'x')[0].cured).toBe(true);
    // ورابعةٌ تفرّق الدواءَ عن جارٍ لا يخصّه: فراغُ حقلٍ آخر لا يداوي هذا.
    expect(negations('OR: [{ other: null }, { gone: { not: v } }],', 'x')[0].cured).toBe(false);

    // والمخطّطُ الحقيقيُّ قُرئ فعلاً: حقولٌ قابلةٌ للفراغ كثيرة، وحقلٌ إلزاميٌّ في كلِّ
    // نماذجه ليس منها (`id` مفتاحٌ لا يكون فارغاً).
    expect(nullable.size).toBeGreaterThan(20);
    expect(nullable.has('id')).toBe(false);
    // ⚠️ **و`companyId` منها** — `PermissionTemplate` يقبل الفراغ فيه (قالبُ منصّةٍ بلا
    //    منشأة). **وهذا بعينه ما يجعل البوّابةَ تُطابق بالاسم لا بالنموذج**: نفيٌ على
    //    `companyId` في أيّ استعلامٍ يمرّ بهذا الاسم يستحقّ قراءةً لا عبوراً.
    expect(nullable.get('companyId')).toEqual(['PermissionTemplate']);
  });

  /**
   * ⭐ **البوّابة**: كلُّ نفيٍ على حقلٍ يقبل الفراغ **يُصحَّح أو يُعلن** — ولا ثالث.
   */
  it('⭐ لا نفيَ على حقلٍ يقبل الفراغ بلا تصحيحٍ أو إعلان', () => {
    const risky = found.filter((n) => nullable.has(n.field) && !n.declared && !n.cured);
    expect(risky.map((n) => `${n.file}:${n.line} — ${n.field} (${n.kind}) :: ${n.text}`)).toEqual([]);
  });

  it('⭐ والمسحُ يرى المصدرَ فعلاً — لا صفراً من مجلَّدٍ فارغ', () => {
    expect(files.length).toBeGreaterThan(200);
    // مواضعُ نفيٍ قائمةٌ فعلاً في المصدر — فصفرُ المخاطر أعلاه نتيجةُ فحصٍ لا نتيجةُ عمى.
    expect(found.length).toBeGreaterThan(5);
  });
});
