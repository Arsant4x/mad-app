import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripComments } from './source-scan.util';

/**
 * `ق-٣٢٨` — **حارسٌ مشتقّ: رقمُ المستند يُشتقّ من عدّادٍ لا من مسح**.
 *
 * ── لماذا حارسٌ لا قائمة ──────────────────────────────────────────────────
 *
 * `count-numbering.spec` يقول في صدره: **«المشكلة ليست في المواضع بل في أن
 * النمط يُكتب من جديد كلما احتاجه أحد»** — ثلاثةٌ أُصلحت ثم عاد رابع. **وهذا
 * وقع هنا حرفياً**: قياسٌ عُرض على المالك قال **ستة** مواضع، **فوجد هذا
 * الحارسُ سابعاً** (`Q-` في العروض) لم يظهر في القياس. **فالقائمةُ تحرس
 * الماضي، والحارسُ يمسح الشجرة.**
 *
 * ── الشكلان المُدانان ─────────────────────────────────────────────────────
 *
 * **① المسحُ الكامل**: `findMany({ where: { no: { startsWith: prefix } } })` —
 * يقرأ **كلَّ صفوف السنة** في كل طلب. فمتجرٌ بمئة بيعةٍ يومياً يقرأ ملايين
 * الصفوف، **والبطءُ يتضاعف حتى يتوقّف الكاشير**.
 *
 * ⚠️ **② والإصلاحُ السريع أخطرُ من العطل**: `orderBy: { no: 'desc' }, take: 1`
 * **ترتيبٌ نصّيّ** — `…-9999` يسبق `…-10000` أبجدياً، **فيُعطي رقماً
 * مستعمَلاً**. وهو أوّلُ ما تمتدّ إليه اليدُ حين يُشتكى من البطء، **فيُدان
 * صراحةً كي لا يُكتب**.
 *
 * ── والاستثناءُ واحدٌ ومكتوب ──────────────────────────────────────────────
 *
 * `document-sequence.util.ts` وحدَه يمسح — **مرّةً في عمر السلسلة عند بذرها**،
 * لا في كل طلب. فالاستثناءُ **بالمسار لا بالنيّة**، ولا يُوسَّع بلا قرار.
 */
const SRC = join(__dirname, '..');
/** المسارُ الوحيدُ المأذون له بالمسح — عند البذر وحده. */
const SEEDER = join('common', 'document-sequence.util.ts');

/** حقلُ الرقم المتسلسل — ما يُبنى منه رقمُ مستند. */
const NO_FIELD = /^(?:no|number|serial|reference|ref)$/;

export interface ScanOffence {
  file: string;
  line: number;
  reason: string;
}

export function sequenceScanOffences(source: string, file = '<inline>'): ScanOffence[] {
  const code = stripComments(source);
  const lineOf = (index: number) => code.slice(0, index).split('\n').length;
  const out: ScanOffence[] = [];

  // ① الشرطُ على حقل الرقم: يُقرأ **جسمُ القوسين** لا مطلعُهما، فالتمييزُ فيه.
  for (const m of code.matchAll(/\b(no|number|serial|reference|ref)\s*:\s*\{([^{}]*)\}/g)) {
    const [field, body] = [m[1], m[2]];
    const line = lineOf(m.index ?? 0);

    if (/\bstartsWith\s*:/.test(body)) {
      out.push({ file, line, reason: `مسحُ بادئةٍ على «${field}» — الرقمُ يُشتقّ من عدّاد` });
      continue;
    }

    // ⚠️ **وبحثُ التاجر ليس ترقيماً**: `contains` مع `mode: 'insensitive'` هو
    // شكلُ البحث في الشاشات — **قِيس فوُجد في موضعين حقيقيّين** (العقود ·
    // اليومية). **فالاستثناءُ بالشكل لا بالملفّ**، إذ لا مولّدَ ترقيمٍ يطلب
    // تجاهلَ حالة الأحرف على بادئةٍ يصنعها هو بنفسه.
    if (/\bcontains\s*:/.test(body) && !/\bmode\s*:/.test(body)) {
      out.push({ file, line, reason: `مسحٌ بـ«contains» على «${field}» — الرقمُ يُشتقّ من عدّاد` });
    }
  }

  // ② الترتيبُ النصّيّ: `orderBy: { no: 'desc' }` — ينكسر بعد `9999`.
  for (const m of code.matchAll(/orderBy\s*:\s*\{\s*(\w+)\s*:\s*['"]desc['"]/g)) {
    if (!NO_FIELD.test(m[1])) continue;
    out.push({ file, line: lineOf(m.index ?? 0), reason: `ترتيبٌ نصّيّ تنازليّ على «${m[1]}» — ‎…-9999‎ يسبق ‎…-10000‎` });
  }

  return out;
}

describe('رقمُ المستند من عدّادٍ لا من مسح — حارسٌ مشتقٌّ يمسح الشجرة', () => {
  it('المُكتشِف مُثبَت بحالتَين: يمسك الشكلين ويترك ما ليس ترقيماً', () => {
    // ⚠️ **الشكلان الواقعيّان** — منقولان عن مصدرٍ كان قائماً فعلاً، لا كسرٌ مصطنع.
    expect(sequenceScanOffences(`const rows = await tx.quote.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });`)).toHaveLength(1);
    expect(sequenceScanOffences(`const last = await tx.invoice.findFirst({ where: { companyId }, orderBy: { no: 'desc' }, take: 1 });`)).toHaveLength(1);
    expect(sequenceScanOffences(`await tx.payment.findMany({ where: { no: { contains: year } } });`)).toHaveLength(1);

    // وما ليس ترقيماً يمرّ: بحثٌ باسم · ترتيبٌ بتاريخ · ترتيبٌ صاعد على غير الرقم.
    expect(sequenceScanOffences(`await tx.customer.findMany({ where: { name: { contains: q } } });`)).toEqual([]);
    expect(sequenceScanOffences(`await tx.invoice.findMany({ orderBy: { issueDate: 'desc' } });`)).toEqual([]);
    expect(sequenceScanOffences(`await tx.invoice.findMany({ orderBy: { createdAt: 'desc' } });`)).toEqual([]);
    // ⚠️ **وبحثُ التاجر على الرقم نفسه يمرّ** — الصياغةُ منقولةٌ عن `journal.service`
    // كما هي: **الاستثناءُ مُقاسٌ لا مفترض**.
    expect(sequenceScanOffences(`{ no: { contains: q, mode: 'insensitive' } },`)).toEqual([]);
    // والتعليقُ لا يُدان — وإلا لأدان هذا الملفُّ نفسَه.
    expect(sequenceScanOffences(`// كان: where: { no: { startsWith: prefix } }\nconst no = await nextDocumentNumber(tx, companyId, date, spec, h);`)).toEqual([]);
  });

  it('🔴 ورقمُ السطر يصدق — وهو ما لا يُقرأ إلا لحظةَ السقوط', () => {
    // ⚠️ **العطلُ المُقاس**: `^\s*//` كان يبتلع أسطراً فارغةً قبل كل تعليق،
    // فانحرف التبليغُ ٨٢ سطراً في `contracts.service`. **ولا يظهر ما دام
    // الحارسُ أخضر** — فيُثبَّت هنا بسطرٍ معلوم: التوكيدُ في السطر الخامس.
    const source = ['const a = 1;', '', '  // تعليقٌ بعد سطرٍ فارغ', '', 'await tx.quote.findMany({ where: { no: { startsWith: p } } });'].join('\n');
    expect(sequenceScanOffences(source)).toEqual([expect.objectContaining({ line: 5 })]);
  });

  it('السطح غير فارغ — الشجرةُ تُقرأ فعلاً ومنها الخدماتُ السبع', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(100);
    for (const service of [
      join('invoices', 'invoices.service.ts'),
      join('payments', 'payments.service.ts'),
      join('journal', 'journal-posting.util.ts'),
      join('contracts', 'contracts.service.ts'),
      join('purchases', 'purchases.service.ts'),
      join('inventory', 'write-offs.service.ts'),
      join('quotes', 'quotes.service.ts'),
    ]) {
      expect(files.some((f) => f.endsWith(service))).toBe(true);
    }
  });

  it('🔴 لا مسحَ بادئةٍ ولا ترتيبَ نصّيّ على رقمِ مستند — إلا في الباذر وحده', () => {
    const offences = sourceFiles(SRC)
      .filter((f) => !f.endsWith(SEEDER))
      .flatMap((f) => sequenceScanOffences(readFileSync(f, 'utf8'), relative(SRC, f).split('\\').join('/')));
    expect(offences.map((o) => `${o.file}:${o.line} — ${o.reason}`)).toEqual([]);
  });
});
