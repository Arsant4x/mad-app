import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * **نموذجُ مستأجرٍ بلا أبٍ يُعلن سببَه** (`ق-٥٠١`).
 *
 * ── العلّة ────────────────────────────────────────────────────────────────
 *
 * **صفٌّ لا يشير إلى أبٍ لا تصله سلسلةُ حذف**: **حذفُ المستند لا يمسّه**، **ولا
 * مسارَ في الواجهة يحذفه** إن كان مستنبَطاً. ⇒ **فيتراكم في الأثر لا في
 * المصدر** (`ق-٤٩٥`) — **ومقيسٌ (2026-09-10): ٦١ واقعةَ انقطاعٍ متراكمة أسقطت
 * حزمةً كاملة**.
 *
 * ── ولماذا لا يفرز الحارسُ المستنبَطَ من الجذريّ ──────────────────────────
 *
 * 🔴 **جُرِّب الفرزُ الآليّ فأخفق في الاتجاهين معاً** (`ق-٥٠٠`): ثلاثُ إشاراتٍ
 * (ذكرٌ في متحكِّم · `DTO` إنشاء · كتابةٌ في الشيفرة) **أعطت `PermissionTemplate`
 * و`BusinessActivity` «مستنبَطة» وهي كياناتُ تاجر**، **و`TaskLog` و
 * `DocumentSequence` «جذريّة» وهي مستنبَطةٌ قطعاً**.
 *
 * ⇒ **فالتمييزُ في القصد لا في البنية — وما لا تحمله البياناتُ لا يُشتقّ منها.**
 *
 * ── فالبوّابةُ تسأل عن الإعلان لا عن الصنف ────────────────────────────────
 *
 * **لا تسأل «أمستنبَطٌ أنت؟» بل «قُل لماذا لا أبَ لك»** — **فيزول الفرزُ الذي
 * أخفق ويبقى الغرض**. وهي بوّابةُ `ق-٣٧٥` نفسُها: **تفرض الاختيارَ الواعي لا
 * التحويل**.
 *
 * **والأصنافُ مقروءةٌ من الواقع لا مفترَضة** — كما وُجدت في الاثنين والعشرين:
 * **كيانٌ جذريّ يملكه التاجر** · **سجلٌّ لا يُحذف** (`ق-١١٠`) · **عدّادٌ لا
 * يُعاد استعمالُه** · **ومستنبَطٌ ومَن ينظّفه**. ⚠️ **ومن احتاج صنفاً خامساً
 * يُعلنه — ولا يُقحم نفسَه في رابع.**
 *
 * ── حدّاه المعلَنان ───────────────────────────────────────────────────────
 *
 * ⚠️ **① يفرض الإعلانَ لا صحّتَه**: **من أعلن «جذريّ» وهو مستنبَطٌ يمرّ** —
 * **تمنع الغفلة لا الخطأ المتعمَّد**، كنظيرتها (`ق-٣٧٥` · `ق-٣٧٠`).
 *
 * ⚠️ **② وتمنع الغفلةَ في المخطَّط وحده** (حدُّ المالك): **ولا تمنع مستنبَطاً
 * يُكتب بلا نموذجٍ أصلاً** — صفٌّ يُضاف إلى جدولٍ قائم. **فلا تُقرأ تغطيةً
 * للنمط كلّه.**
 */
const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

/** علامةُ الإعلان — كلمتان تُقرآن في التعليق وتُمسكان بالبحث. */
export const PARENT_DECLARATION = 'بلا أبٍ';

/** The same declaration in English, for schema comments written in English: a doc line that starts with it. */
export const PARENT_DECLARATION_EN = 'No parent:';

const declaresNoParent = (doc: string) => doc.includes(PARENT_DECLARATION) || doc.split('\n').some((line) => line.replace(/^\/\/\/\s*/, '').startsWith(PARENT_DECLARATION_EN));

export interface SchemaModel {
  name: string;
  body: string;
  /** كتلةُ التعليق الملاصقة فوقه — `///` المتتالية. */
  doc: string;
}

/** نماذجُ المخطّط بأجسادها وتعليقاتها — **من المخطّط لا من قائمةِ أسماء**. */
export function schemaModelsWithDocs(schema: string): SchemaModel[] {
  const lines = schema.split(/\r?\n/);
  const out: SchemaModel[] = [];
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const header = `model ${m[1]} {`;
    const at = lines.findIndex((l) => l.startsWith(header));
    const doc: string[] = [];
    for (let i = at - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('///')) doc.unshift(line);
      else break;
    }
    out.push({ name: m[1], body: m[2], doc: doc.join('\n') });
  }
  return out;
}

/**
 * **الآباء**: روابطُ **مفردة** إلى نموذجٍ غير `Company`.
 *
 * ⚠️ **والمفردُ لا الجمع**: رابطٌ مفرد يعني أن هذا الصفَّ يحمل مفتاحاً إلى أبٍ
 * **فقد تجرّه سلسلةُ حذفه**؛ **ورابطٌ جمعٌ يعني أن غيرَه يشير إليه**، وحذفُ
 * الأبناء لا يمسّه. **والأوّلُ وحده سلسلةُ حذف.**
 */
export function parentsOf(model: SchemaModel, names: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of model.body.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line || line.startsWith('@@') || line.startsWith('///')) continue;
    const m = line.match(/^(\w+)\s+(\w+)(\[\])?\??/);
    if (m && names.has(m[2]) && m[2] !== 'Company' && !m[3]) out.push(m[2]);
  }
  return out;
}

/** نماذجُ المستأجر التي لا أبَ لها ولم تُعلن سببَها — **بأسمائها**. */
export function undeclaredOrphans(schema: string): string[] {
  const models = schemaModelsWithDocs(schema);
  const names = new Set(models.map((m) => m.name));
  return models
    .filter((m) => /^\s*companyId\s+String/m.test(m.body))
    .filter((m) => parentsOf(m, names).length === 0)
    .filter((m) => !declaresNoParent(m.doc))
    .map((m) => m.name);
}

describe('نموذجُ مستأجرٍ بلا أبٍ يُعلن سببَه (ق-٥٠١)', () => {
  it('🔴 لا نموذجَ بلا أبٍ وبلا إعلان', () => {
    const offenders = undeclaredOrphans(SCHEMA);
    if (offenders.length > 0) {
      throw new Error(
        [
          `⛔ نماذجُ مستأجرٍ لا أبَ لها ولم تُعلن سببَها: ${offenders.join(' · ')}`,
          '',
          `أضف إلى تعليق كلٍّ منها سطراً يبدأ بـ«${PARENT_DECLARATION}» يقول لماذا.`,
          'والأصنافُ الموجودة اليوم: كيانٌ جذريّ يملكه التاجر · سجلٌّ لا يُحذف ·',
          'عدّادٌ لا يُعاد استعمالُه · مستنبَطٌ ومَن ينظّفه. ومن احتاج خامساً يُعلنه.',
          '',
          '⚠️ والبوّابةُ تفرض الإعلانَ لا صحّتَه — فهي تمنع الغفلة لا الخطأ المتعمَّد.',
        ].join('\n'),
      );
    }
    expect(offenders).toEqual([]);
  });

  it('⓪ السطحُ غيرُ فارغ — والمرشَّحون موجودون فعلاً', () => {
    const models = schemaModelsWithDocs(SCHEMA);
    const names = new Set(models.map((m) => m.name));
    const tenant = models.filter((m) => /^\s*companyId\s+String/m.test(m.body));
    const orphans = tenant.filter((m) => parentsOf(m, names).length === 0);

    // مجسٌّ للمجسّ: صفرُ نماذجَ يعني أن القراءةَ أخفقت لا أن المخطّط خلا.
    expect(tenant.length).toBeGreaterThanOrEqual(60);
    expect(orphans.length).toBeGreaterThanOrEqual(15);
  });

  it('🔴 والمُكتشِفُ مُثبَتٌ بحالتَين: يُدين غيرَ المُعلِن ويترك المُعلِن', () => {
    // ⚠️ **الصياغةُ منقولةٌ عن المخطّط** (`ق-٤١٨`) — بترتيبها ومسافاتها.
    const undeclared = ['model Thing {', '  id        String  @id @default(uuid())', '  companyId String', '  company   Company @relation(fields: [companyId], references: [id])', '}'].join('\n');
    expect(undeclaredOrphans(undeclared)).toEqual(['Thing']);

    const declared = [`/// **${PARENT_DECLARATION}** — كيانٌ جذريّ يملكه التاجر.`, undeclared].join('\n');
    expect(undeclaredOrphans(declared)).toEqual([]);
  });

  it('accepts the English declaration only at the start of a doc line', () => {
    const undeclared = ['model Thing {', '  id        String  @id @default(uuid())', '  companyId String', '  company   Company @relation(fields: [companyId], references: [id])', '}'].join('\n');
    expect(undeclaredOrphans([`/// ${PARENT_DECLARATION_EN} a root entity the merchant owns.`, undeclared].join('\n'))).toEqual([]);
    expect(undeclaredOrphans([`/// Written in passing: ${PARENT_DECLARATION_EN} is not a declaration here.`, undeclared].join('\n'))).toEqual(['Thing']);
  });

  it('ولا يُدان مَن له أبٌ مفرد — ولو لم يُعلن', () => {
    const withParent = [
      'model Child {',
      '  id        String  @id @default(uuid())',
      '  companyId String',
      '  company   Company @relation(fields: [companyId], references: [id])',
      '  parentId  String',
      '  parent    Thing   @relation(fields: [parentId], references: [id])',
      '}',
      'model Thing {',
      `  /// **${PARENT_DECLARATION}** — جذريّ.`,
      '  id        String  @id',
      '  companyId String',
      '  company   Company @relation(fields: [companyId], references: [id])',
      '}',
    ].join('\n');
    expect(undeclaredOrphans(withParent)).toEqual(['Thing']);
  });

  it('⚠️ ورابطُ الجمع ليس أباً — فحذفُ الأبناء لا يمسّ من يشيرون إليه', () => {
    const listOnly = [
      'model Hub {',
      '  id        String  @id',
      '  companyId String',
      '  company   Company @relation(fields: [companyId], references: [id])',
      '  children  Child[]',
      '}',
      'model Child { id String @id }',
    ].join('\n');
    expect(undeclaredOrphans(listOnly)).toEqual(['Hub']);
  });
});
