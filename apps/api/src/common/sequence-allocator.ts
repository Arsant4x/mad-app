import { PrismaClient } from '@prisma/client';

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

/** يُنشأ عند أول طلبٍ ولا يُعاد إنشاؤه — والحدُّ يُحقن في العنوان نفسه. */
function sequencePort(): PrismaClient {
  if (port) return port;

  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL غائب — لا منفذَ للعدّاد');
  const url = `${base}${base.includes('?') ? '&' : '?'}connection_limit=${SEQUENCE_PORT_CONNECTION_LIMIT}`;

  port = new PrismaClient({ datasources: { db: { url } } });
  return port;
}

/** يُغلق مع دورة حياة التطبيق — فلا يبقى اتصالٌ معلّقٌ بعد الإغلاق. */
export async function disconnectSequencePort(): Promise<void> {
  const open = port;
  port = null;
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
): Promise<number> {
  const client = sequencePort();

  // ⚠️ **والسياقُ يُضبط داخل كل معاملةٍ هنا**: `set_config` بعمرِ المعاملة
  // (`is_local = true`)، فاتصالٌ مُعادُ استعماله **لا يرث سياقَ منشأةٍ سابقة**.
  const bump = () =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return tx.$queryRaw<{ last: number }[]>`
        UPDATE "document_sequences" SET "last" = "last" + 1, "updatedAt" = NOW()
        WHERE "companyId" = ${companyId} AND "kind" = ${kind} AND "year" = ${year}
        RETURNING "last"
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
