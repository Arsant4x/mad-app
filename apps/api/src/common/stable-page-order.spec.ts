import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripCommentsAndStrings } from './source-scan.util';

/**
 * **صفحةٌ تُعطي الشيءَ نفسه مرتين — حارسٌ مشتقّ** (`ق-٣٥٦`).
 *
 * ── العطل المقيس ─────────────────────────────────────────────────────────
 *
 * كلُّ مسارٍ مصفَّحٍ عندنا كان يرتّب **بعمودٍ واحدٍ يوميّ الدقّة** (`@db.Date`):
 * اليومية · حركاتُ المخزون · المعاملات · العقود — **أربعةٌ من أربعة**. فكلُّ
 * صفوف اليوم **تتعادل تماماً**، **وترتيبُ المتساوين في Postgres غيرُ محدَّد**
 * ويتغيّر بالخطّة وبالترتيب المادّيّ للصفوف.
 *
 * ⚠️ **والأثرُ على التاجر لا على الاختبار**: صفحتان متتاليتان **قد تكرّران
 * صفّاً وتُسقطان آخر** — على البيانات نفسها بلا سببٍ ظاهر. **ومحاسبٌ يرى قيداً
 * مرتين ثم لا يجده يفقد الثقة في التقرير كلّه.**
 *
 * **وكشفه سقوطٌ متقطّع** في `bank-postings`: التوكيدُ يقرأ صفحةً ثم يبحث فيها،
 * **فكان يجد قيدَه بحظّ ترتيبِ التعادل لا بضمانة**.
 *
 * ── ما يحرسه ─────────────────────────────────────────────────────────────
 *
 * **كلُّ استعلامٍ فيه `skip:` (أي مصفَّح) يجب أن ينتهي ترتيبُه بحقلٍ فريد.**
 * والفريدُ الوحيد المضمون على كل نموذج هو `id`.
 *
 * ⚠️ **ولا يكفي `createdAt`**: هو أدقّ من `date` ولا يمنع التعادل — صفّان
 * يُكتبان في المللي‑ثانية نفسها **يقعان في ترتيبٍ غير محدَّد**، وهو ما يحدث
 * في `createMany` وفي الكتابة المتوازية.
 */
const SRC = join(__dirname, '..');

export interface PageOrderOffence {
  file: string;
  line: number;
}

/** يُعيد مواضعَ `skip:` التي لا يحسم ترتيبُ استعلامها بـ`id`. */
export function unstablePageOrders(source: string, file = '<inline>'): PageOrderOffence[] {
  const lines = stripCommentsAndStrings(source).split(/\r?\n/);
  const out: PageOrderOffence[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/\bskip\s*:/.test(lines[i])) continue;
    // ترتيبُ الاستعلام يقع قبل `skip` بأسطرٍ قليلة — تُقرأ نافذةٌ حولها.
    const window = lines.slice(Math.max(0, i - 12), i + 3).join('\n');
    const orderBy = window.match(/orderBy\s*:\s*(\[[^\]]*\]|\{[^}]*\})/);
    if (!orderBy) {
      out.push({ file, line: i + 1 });
      continue;
    }
    // ⚠️ **ولا يُطلب الاتجاه في النمط**: النصوصُ مُفرَّغةٌ قبل المطابقة
    // (`ق-٣٤٩`)، فـ`'desc'` صار فراغاً — **ونمطٌ يطلبه لا يطابق شيئاً أبداً**،
    // فيُدين كلَّ مسارٍ بما فيه السليم. **وقد وقع، وأمسكته حالةُ «يترك التامّ».**
    if (!/(?:^|[\s{,[])id\s*:/.test(orderBy[1])) out.push({ file, line: i + 1 });
  }
  return out;
}

describe('صفحةٌ بترتيبٍ تامّ — حارسٌ مشتقٌّ يمسح الشجرة', () => {
  it('المُكتشِف مُثبَت بحالتَين: يمسك الجزئيّ ويترك التامّ', () => {
    // ⚠️ **الصياغةُ الواقعية** — منقولةٌ عن `journal.service` قبل الإصلاح.
    const partial = ['      const items = await tx.journalEntry.findMany({', "        orderBy: { date: 'desc' },", '        skip: (page - 1) * pageSize,', '        take: pageSize,'].join('\n');
    expect(unstablePageOrders(partial)).toHaveLength(1);

    const total = ['      const items = await tx.journalEntry.findMany({', "        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],", '        skip: (page - 1) * pageSize,'].join('\n');
    expect(unstablePageOrders(total)).toEqual([]);

    // 🔴 **و`createdAt` وحده لا يكفي** — تعادلٌ في المللي‑ثانية وارد.
    const almost = ["        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],", '        skip: (page - 1) * pageSize,'].join('\n');
    expect(unstablePageOrders(almost)).toHaveLength(1);

    // وصفحةٌ بلا ترتيبٍ إطلاقاً تُدان — وهي أسوأ الأشكال.
    expect(unstablePageOrders(['await tx.x.findMany({', '  skip: (page - 1) * pageSize,'].join('\n'))).toHaveLength(1);
  });

  it('السطح غير فارغ — المسارات المصفَّحة تُقرأ فعلاً', () => {
    const paginated = sourceFiles(SRC).filter((f) => /\bskip\s*:/.test(stripCommentsAndStrings(readFileSync(f, 'utf8'))));
    expect(paginated.length).toBeGreaterThan(0);
    expect(paginated.some((f) => f.endsWith(join('journal', 'journal.service.ts')))).toBe(true);
  });

  it('🔴 كلُّ مسارٍ مصفَّحٍ ينتهي ترتيبُه بحقلٍ فريد', () => {
    const offences = sourceFiles(SRC).flatMap((f) =>
      unstablePageOrders(readFileSync(f, 'utf8'), relative(SRC, f).split('\\').join('/')),
    );
    expect(offences.map((o) => `${o.file}:${o.line}`)).toEqual([]);
  });
});
