import { PrismaClient } from '@mad-app/db';

/**
 * **منفذُ العدّاد — اتصالٌ مخصَّصٌ لزيادة التسلسل وحدها** (`ق-٣٤٨`).
 *
 * ── لماذا منفذٌ ثانٍ أصلاً ────────────────────────────────────────────────
 *
 * زيادةُ العدّاد داخل معاملة العمل **تقفل صفَّه حتى الالتزام**، فتُسلسل
 * **معاملةَ البيع كاملةً** لا خطوةَ الترقيم: فاتورةً وترحيلاً وأرصدةً وسنداً.
 * **وقِيس على `CI`**: ثلاثُ بيوعٍ تصل متزامنة ⇒ `500` ورسالتُها
 * `Unable to start a transaction in the given time` (`ق-٣٤٢`).
 *
 * **فالزيادةُ تجري هنا على اتصالٍ خاصّ ثم تلتزم فوراً** — والقفلُ ميكروثوانٍ.
 *
 * ⚠️ **وثمنُه معلَنٌ لا مخفيّ** (`ق-٣٤٨` · `ق-٣٥٠`):
 *   · **الرقمُ لا يرتدّ** مع معاملةِ العمل — فمعاملةٌ تسقط **تحرق رقماً**،
 *     وهي فجوةٌ من صنفِ ما أُقرّ في `ق-٣٣٢`.
 *   · **ونقطةُ فشلٍ حيث لم تكن**: منفذٌ لا يستجيب ⇒ **لا يصدر رقمٌ إطلاقاً**
 *     ⇒ تتوقف كلُّ إنشاءات المستندات. **يُراقَب في «العين»**.
 *
 * ── وعجزُه عن غير غرضه — بنيةً لا اتفاقاً ────────────────────────────────
 *
 * ⚠️ **«لا نتّفق ألّا نستعمله بل لا يستطيع»** (شرطُ المالك الأول): العميلُ
 * **لا يُصدَّر إطلاقاً** — لا اسمَ له خارج هذه الوحدة، والمُصدَّرُ دالّةٌ
 * واحدةٌ لا تقبل إلا مفاتيحَ العدّاد. **وحارسٌ مشتقّ**
 * (`sequence-port-sealed.spec`) **يُسقط الحزمة** إن ظهر `PrismaClient` جديدٌ
 * في غير هذا الملف، أو ظهرت في هذا الملف جملةُ `SQL` غيرُ الثلاث المأذونة.
 *
 * ⚠️ **والشكلُ الأقوى معلَنٌ فراغاً**: دورٌ في القاعدة لا يملك إلا
 * `document_sequences` **يجعل العجزَ في القاعدة لا في الشيفرة** — ويحتاج
 * صلاحيةَ إنشاء أدوار، **وهي عملُ تشغيلٍ لا هجرة**، والمنشورةُ عندنا للقراءة
 * فقط. **فيُعلَن ولا يُدَّعى**.
 *
 * ── والعزل ───────────────────────────────────────────────────────────────
 *
 * هذا المنفذُ **يتجاوز امتدادَ العزل** (الطبقة الأولى) لأنه لا يمرّ بـ
 * `TenantPrismaService`. **فتبقى الطبقةُ الثانية وحدها**: `set_config` ثم
 * `FORCE ROW LEVEL SECURITY` على الجدول، **ومعها شرطُ `companyId` في الجملة
 * نفسها**. ⚠️ **ويُثبَت حيّاً على هذا المسار تحديداً** لا بقراءة الهجرة —
 * فقد قِيس خمس مراتٍ أن `FORCE` هو الفارق (`ق-٣٤٩`).
 */

/**
 * **حدُّ اتصالات المنفذ — مُعلَنٌ لا افتراضيّ** (شرطُ المالك الثاني).
 *
 * اثنان: واحدٌ يعمل وآخرُ يسدّ فجوةَ التبديل. **والعملُ عليه ميكروثوانٍ**
 * (زيادةٌ ثم التزام) فلا طابور، **ولا يزاحم المجموعَ الأصلي عند الذروة**.
 */
export const SEQUENCE_PORT_CONNECTION_LIMIT = 2;

let port: PrismaClient | null = null;
let ready = false;

/**
 * **هل فُتح الاتصالُ عند الإقلاع؟** — يُقرأ في الإثبات العكسيّ (`ق-٣٥٥`).
 *
 * ⚠️ **ويُثبَت بالآليّة لا بالزمن**: توكيدٌ على «الطلبُ الأول سريع» **يقيس
 * عتادَ الجهاز لا الإصلاح** ويسقط على سيرٍ بطيء. **فيُقرأ أن الاتصال قائمٌ
 * فعلاً** — وهو ما بُني ليقع.
 */
export function isSequencePortReady(): boolean {
  return ready;
}

/** يُنشأ عند أول طلبٍ ولا يُعاد إنشاؤه — والحدُّ يُحقن في العنوان نفسه. */
function sequencePort(): PrismaClient {
  if (port) return port;

  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL غائب — لا منفذَ للعدّاد');
  const url = `${base}${base.includes('?') ? '&' : '?'}connection_limit=${SEQUENCE_PORT_CONNECTION_LIMIT}`;

  port = new PrismaClient({ datasources: { db: { url } } });
  return port;
}

/**
 * **يُفتح الاتصالُ عند إقلاع الوحدة لا عند أول فاتورة** (`ق-٣٥٥`).
 *
 * ⚠️ **العطلُ المقيس**: الاتصالُ الكسول يجعل **كلفةَ الفتح تقع على أول إنشاء
 * مستندٍ** — فسقطت مجموعتان في الحزمة النظيفة بمهلة الخمس ثوانٍ، **وفي
 * المنشورة تقع على أول فاتورةٍ بعد كل نشر**. **ومجموعٌ من اثنين يجعلها
 * متكرّرة لا مرّةً واحدة** (`ق-٣٥٤`).
 *
 * ⚠️ **ولا يمنع الإقلاع** (شرطُ المالك الأول): فشلُ الاتصال **يُسجَّل ويُمضى**
 * — **وتُعاد المحاولة عند أول طلبٍ** لأن `sequencePort()` كسولةٌ أصلاً.
 * **وإلا صار عطلٌ في القاعدة يمنع النظام من القيام أصلاً** — وهو أسوأ من
 * بطءِ أول فاتورة.
 */
export async function connectSequencePort(): Promise<void> {
  try {
    await sequencePort().$connect();
    ready = true;
  } catch (e) {
    // ولا يُبتلع صامتاً: يُسمّى بما هو، **ويبقى المسارُ عاملاً بإعادة المحاولة**.
    console.error(`⚠️ منفذُ العدّاد لم يتصل عند الإقلاع — تُعاد المحاولة عند أول طلب: ${String(e)}`);
  }
}

/** يُغلق مع دورة حياة التطبيق — فلا يبقى اتصالٌ معلّقٌ بعد الإغلاق. */
export async function disconnectSequencePort(): Promise<void> {
  const open = port;
  port = null;
  ready = false;
  if (open) await open.$disconnect();
}

/**
 * يزيد عدّاد (منشأة · نوع · سنة) **ويلتزم فوراً**، ويعيد آخرَ رقمٍ صدر.
 *
 * و`seed` تُستدعى **مرّةً في عمر السلسلة وحدها** — حين يعود الصفُّ غائباً —
 * وتقرأ أعلى رقمٍ قائمٍ **من معاملة العمل** (فهي قراءةُ مستنداتٍ لا عدّاد).
 */
export async function allocateSequence(
  companyId: string,
  kind: string,
  year: number,
  seed: () => Promise<number>,
  label: { prefix: string; pad: number },
): Promise<number> {
  const client = sequencePort();

  // ⚠️ **والسياقُ يُضبط داخل كل معاملةٍ هنا**: `set_config` بعمرِ المعاملة
  // (`is_local = true`)، فاتصالٌ مُعادُ استعماله **لا يرث سياقَ منشأةٍ سابقة**.
  //
  // ⚖️ (`ق-٣٤٥` · توجيه ٢٨٦) **والأخذُ يُسجَّل في الجملة نفسِها**: الزيادةُ وصفُّ الأخذ يلتزمان معاً أو لا يقعان،
  // فلا رقمَ يُؤخذ بلا أثر. والختمُ «مستعمَلاً» في معاملة العمل (`document-sequence.util.ts`)، لا هنا.
  // والحشوُ كـ`padStart` في الشيفرة: لا يقصّ رقماً أطولَ من حشوه (و`lpad` وحدَها تقصّ).
  const bump = () =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return tx.$queryRaw<{ last: number }[]>`
        WITH bumped AS (
          UPDATE "document_sequences" SET "last" = "last" + 1, "updatedAt" = NOW()
          WHERE "companyId" = ${companyId} AND "kind" = ${kind} AND "year" = ${year}
          RETURNING "last"
        ), taken AS (
          INSERT INTO "document_number_allocations" ("id", "companyId", "kind", "year", "number", "no")
          SELECT gen_random_uuid(), ${companyId}, ${kind}, ${year}, "last",
                 ${label.prefix}::text || CASE WHEN length("last"::text) >= ${label.pad}::int THEN "last"::text ELSE lpad("last"::text, ${label.pad}::int, '0') END
          FROM bumped
          RETURNING "number"
        )
        SELECT "number" AS "last" FROM taken
      `;
    });

  let rows = await bump();
  if (rows.length) return rows[0].last;

  const from = await seed();
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    return tx.$executeRaw`
      INSERT INTO "document_sequences" ("id", "companyId", "kind", "year", "last", "updatedAt")
      VALUES (gen_random_uuid(), ${companyId}, ${kind}, ${year}, ${from}, NOW())
      ON CONFLICT ("companyId", "kind", "year") DO NOTHING
    `;
  });

  rows = await bump();
  if (!rows.length) throw new Error(`عدّادُ التسلسل غائبٌ بعد إدراجه: ${kind}-${year}`);
  return rows[0].last;
}
