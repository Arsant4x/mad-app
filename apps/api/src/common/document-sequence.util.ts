import { Prisma } from '@prisma/client';
import { documentYear } from './document-year.util';

/**
 * **رقمُ المستند التالي — من عدّادٍ ذرّيّ لا من مسح** (`ق-٣٢٨`).
 *
 * ── ما استُبدل ────────────────────────────────────────────────────────────
 *
 * كان كلُّ ترقيمٍ يقرأ **كلَّ صفوف السنة** ثم يأخذ الأعلى — في **سبعة مواضع**:
 * الفاتورة · القيد · السند · العقد · الشراء · إعدامُ المخزون · **عرضُ السعر**
 * (والسابعُ وجده الحارسُ المشتقُّ بعد أن قال القياسُ ستة). **فمتجرٌ بمئة
 * بيعةٍ يومياً يقرأ ملايينَ الصفوف** (ثلاثَ مرّاتٍ في كل بيعة)، **والبطءُ
 * يتضاعف حتى يتوقّف الكاشير** — **ولا يظهر في السير لأن قاعدته فارغة**.
 *
 * ⚠️ **ولم يكن يكفي أن نقرأ صفّاً واحداً**: `ORDER BY no DESC` **ترتيبٌ نصّيّ**
 * — `…-9999` يسبق `…-10000` أبجدياً، **فيُعطي رقماً مستعمَلاً**. **فالمشكلتان
 * واحدة، والعدّادُ يُلغي الترتيبَ النصّيّ أصلاً.**
 *
 * ── التزامن: بنيةٌ لا محاولةٌ تُعاد ───────────────────────────────────────
 *
 * `UPDATE … SET last = last + 1 RETURNING last` **يقفل الصفَّ** فيُسلسل
 * الطالبَين — **بخلاف `MAX+1` الذي يظلّ محتاجاً القيدَ الفريد وإعادةَ المحاولة
 * مهما سرُع** (وهو درسُ `ICV` بعينه: عدّادان يطلبان معاً لا يعطيان رقماً
 * واحداً بالقراءة وحدها).
 *
 * ── البذرُ مرّةً واحدة ────────────────────────────────────────────────────
 *
 * ⚠️ **بذرٌ يقع مرّتين يُعيد الترقيم من رقمٍ مستعمَل** — وهو أخطرُ ما في هذا
 * البناء. **فجُعل بنيةً لا انضباطاً**: الإدراجُ `ON CONFLICT DO NOTHING` تحت
 * قيدٍ فريد — **فالثاني لا يفعل شيئاً**، ولا يُكتب فوق عدّادٍ قائمٍ أبداً.
 *
 * **و`last` آخرُ ما صدر لا التالي**: فما لا يُبذَر يبدأ من صفرٍ وأولُ رقمٍ `1`.
 * **والصفُّ يُنشأ عند أول طلبٍ** لا عند بذرٍ شاملٍ لكل منشأة.
 */
export interface SequenceSpec {
  /** مفتاحُ السلسلة في العدّاد: `INV` · `CN` · `DN` · `JE` · `RCV` · `RFD` · `EJ` · `PUR` · `WO`. */
  kind: string;
  /** عرضُ الحشو — **يبقى كما كان لكل سلسلة، فلا شكلَ يتغيّر**. */
  pad: number;
  /**
   * ⚠️ **وسلسلةٌ بلا سنة موجودةٌ فعلاً**: `PUR-###` تسلسلٌ **عمريّ** لا سنويّ.
   * فحين تكون `false` يُستعمل `0` مفتاحاً للسنة وتُحذف السنةُ من البادئة —
   * **فالشكلُ يبقى كما هو، ولا رقمٌ صدر يتغيّر**.
   */
  perYear?: boolean;
}

/**
 * أعلى رقمٍ صدر فعلاً لهذه السلسلة — **يُقرأ مرّةً واحدة عند البذر وحده**،
 * لا في كل طلب. ويُمرَّر من المستدعي لأن كلَّ سلسلةٍ في جدولها.
 */
export type HighestExisting = (prefix: string) => Promise<number>;

/**
 * أعلى تسلسلٍ صدر تحت بادئةٍ ما — **يُقرأ مرّةً عند البذر لا في كل طلب**.
 *
 * ويقبل أيَّ مفوَّضٍ فيه `findMany` على حقل `no` — فالسلاسلُ الستُّ في ستةِ
 * جداول، **والقراءةُ واحدةٌ لا تُكرَّر في سبعة مواضع**.
 */
export async function highestSequenceOf(
  delegate: { findMany: (args: { where: { no: { startsWith: string } }; select: { no: true } }) => Promise<{ no: string }[]> },
  prefix: string,
): Promise<number> {
  const rows = await delegate.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });
  return rows.reduce((max, r) => {
    const n = parseInt(r.no.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
}

/**
 * يعيد الرقمَ التالي كاملاً (`INV-2026-0007`).
 *
 * ── الترتيب: الزيادةُ أولاً والمسحُ آخِراً ────────────────────────────────
 *
 * ⚠️ **والترتيبُ هو الغرضُ نفسه**: لو سبق البذرُ الزيادةَ لبقي **المسحُ الكامل
 * في كل طلب** — وهو العلّةُ التي بُني هذا كلُّه لإزالتها. **فالزيادةُ تُجرَّب
 * أولاً بلا قراءة**، ولا يُقرأ الأعلى القائم **إلا حين يعود الصفُّ غائباً**:
 * مرّةً واحدةً في عمر السلسلة، لا في كل بيعة.
 *
 * **والتزامنُ عند الإنشاء نفسه محكومٌ بالبنية لا بالترتيب**: طالبان معاً
 * يقرآن صفراً ويُدرجان — فالثاني يقف على القيد الفريد حتى يلتزم الأول ثم
 * **لا يفعل شيئاً**، وتُعطي الزيادتان `1` و`2`. **ولا رقمَ يتكرّر ولا يُكتب
 * فوق عدّادٍ قائم.**
 *
 * ⚠️ **والاستعلامان خامّان عمداً**: `ON CONFLICT DO NOTHING` و`UPDATE …
 * RETURNING` **لا مقابلَ لهما في واجهة Prisma** — و`upsert` ليس ذرّياً هنا
 * (يقرأ ثم يكتب). والذرّيّةُ هي الغرضُ كلُّه.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  date: Date,
  spec: SequenceSpec,
  highestExisting: HighestExisting,
): Promise<string> {
  const perYear = spec.perYear ?? true;
  const year = perYear ? documentYear(date) : 0;
  const prefix = perYear ? `${spec.kind}-${year}-` : `${spec.kind}-`;

  // ① الزيادةُ الذرّية — قفلُ الصفّ يُسلسل الطالبَين. وهذا **المسارُ المعتاد
  //    وحده**: استعلامٌ واحد، بلا قراءةٍ ولا مسح.
  const bump = () => tx.$queryRaw<{ last: number }[]>`
    UPDATE "document_sequences" SET "last" = "last" + 1, "updatedAt" = NOW()
    WHERE "companyId" = ${companyId} AND "kind" = ${spec.kind} AND "year" = ${year}
    RETURNING "last"
  `;

  let rows = await bump();

  if (!rows.length) {
    // ② أول طلبٍ لهذه السلسلة وحده: يُقرأ الأعلى القائم **مرّةً في عمرها**،
    //    والقيدُ الفريد يجعل بذراً ثانياً بلا أثر.
    const seed = await highestExisting(prefix);
    await tx.$executeRaw`
      INSERT INTO "document_sequences" ("id", "companyId", "kind", "year", "last", "updatedAt")
      VALUES (gen_random_uuid(), ${companyId}, ${spec.kind}, ${year}, ${seed}, NOW())
      ON CONFLICT ("companyId", "kind", "year") DO NOTHING
    `;
    rows = await bump();
    if (!rows.length) throw new Error(`عدّادُ التسلسل غائبٌ بعد إدراجه: ${spec.kind}-${year}`);
  }

  return `${prefix}${String(rows[0].last).padStart(spec.pad, '0')}`;
}
