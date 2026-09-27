import { Prisma, PrismaClient } from '@mad-app/db';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { SLUG_CHECK_SQL, SLUG_PATTERN, isValidSlug } from './slug.util';

jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * **شكلُ معرّف النطاق: مصدرٌ واحد، مقروءٌ من كتالوج القاعدة** (`ق-١٣٠٣` · ك/⑬A2).
 *
 * الشكلُ مكتوبٌ في موضعين — نمطُ `TypeScript` في `slug.util.ts` وقيدُ `CHECK` في
 * القاعدة — **وموضعان يفترقان بلا حارس**. فهذا الحارس:
 *
 * ① يقرأ نصَّ القيد **من `pg_constraint`** لا من ملفّ الهجرة (`§8.21`: مسافةٌ للمحاذاة
 *   أبطلت حارساً يقرأ نصَّ ترحيل، **والكتالوجُ لا تُعميه مسافة**؛ وترحيلٌ لاحق قد يُسقط
 *   ما أثبته الأوّل فيبقى النصُّ شاهداً على ماضٍ).
 * ② ويقارنه بالنمط وبالثابت معاً — فلا يكفي أن يتطابق اثنان من ثلاثة.
 * ③ **ويُثبت أن القيدَ يردّ فعلاً** — لا أن نصَّه مكتوب: كتابةٌ مباشرةٌ لا تمرّ بالخدمة،
 *   بقيمةٍ خاطئةٍ تُرفض **باسم القيد** وبقيمةٍ صحيحةٍ تمرّ، في معاملتين تُرجَعان.
 *
 * ⚠️ **والرفضُ يُطابَق باسم القيد لا بمجرّد وقوعه** (`§8.14`): توكيدٌ على «رُفض» يمرّ على
 * تعارض الفهرس الفريد وعلى «الصفُّ غيرُ موجود» كذلك — **فيشهد للقيد وهو ساقط**.
 *
 * ⚠️ **وفرضٌ أسقطه الإثباتُ العكسيّ** (`§8.14` · الوجه المقابل): كُتب المسبارُ أوّلاً داخل
 * سياق مستأجر بحجّة أن الكتابةَ بلا سياقٍ **يردّها العزل** فيُقرأ رفضُ العزل رفضَ قيد.
 * **والقياسُ أسقطه**: حذفُ السياق تركَ الحارسَ أخضر، ثم قراءةُ الكتالوج بيّنت السبب —
 * **`companies` بلا عزل صفوفٍ أصلاً** (`relrowsecurity = false` · صفرُ سياسة): هي **صفُّ
 * المستأجر نفسِه**، وعزلُها في الطبقة الأولى بالمفتاح `id`. ⇒ **فالسياقُ حُذف ولم يُترك
 * بحجّةٍ لا تصحّ** — وتوكيدُ الاسم وحدَه هو ما يفصل القيدَ عن غيره.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const ROLLBACK = 'ROLLBACK_PROBE';
type Tx = Prisma.TransactionClient;

async function rolledBack<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  let ran = false;
  await prisma
    .$transaction(async (tx) => {
      out = await fn(tx);
      ran = true;
      throw new Error(ROLLBACK);
    })
    .catch((e: unknown) => {
      if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
    });
  if (!ran) throw new Error('المعاملةُ لم تكتمل');
  return out as T;
}

d('شكلُ معرّف النطاق واحدٌ في الشيفرة والقاعدة — مقروءاً من الكتالوج (ق-١٣٠٣)', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    const one = await prisma.company.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (!one) throw new Error('الحارسُ يحتاج منشأةً واحدةً على الأقل — تحقّق من البذرة');
    companyId = one.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⭐ ① نصُّ القيد من pg_constraint يطابق النمطَ والثابت — لا موضعان يفترقان', async () => {
    const rows = await prisma.$queryRaw<{ def: string }[]>`
      SELECT pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'companies' AND c.conname = 'companies_slug_format'`;
    expect(rows).toHaveLength(1);

    // الكتالوجُ يكتب النمطَ سلسلةً: `… ~ '<النمط>'::text`.
    const inDb = /~\s*'([^']+)'/.exec(rows[0].def)?.[1];
    expect(inDb).toBe(SLUG_CHECK_SQL);
    expect(SLUG_PATTERN.source).toBe(SLUG_CHECK_SQL);
    // **والفارغُ يُقبل**: منشأةٌ بلا معرّفٍ حالٌ مشروعة لا مخالفة.
    expect(rows[0].def).toMatch(/slug.{0,4} IS NULL/);
  });

  it('② الفهرسُ الفريدُ على مستوى المنصّة — لا على المنشأة', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'companies' AND indexname = 'companies_slug_key'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/CREATE UNIQUE INDEX/);
    expect(rows[0].indexdef).not.toMatch(/companyId/);
  });

  it('🔴 ③ والقيدُ يردّ فعلاً — قيمةٌ خاطئةٌ تُرفض باسمه، وصحيحةٌ تمرّ', async () => {
    const bad = await rolledBack(prisma, (tx) =>
      tx.company.update({ where: { id: companyId }, data: { slug: 'BAD_SLUG!' } }).then(
        () => null as string | null,
        (e: Error) => String(e.message),
      ),
    );
    // ⚠️ **باسم القيد**: «رُفض» وحدَه يمرّ على تعارض الفهرس الفريد وعلى «الصفُّ غيرُ موجود».
    expect(bad).toContain('companies_slug_format');

    const good = await rolledBack(prisma, async (tx) => {
      const row = await tx.company.update({ where: { id: companyId }, data: { slug: `probe-slug-${Date.now()}` }, select: { slug: true } });
      return row.slug;
    });
    expect(good).toMatch(SLUG_PATTERN);
  });

  it('④ محجوزاتُ المنصّة مزروعةٌ فعلاً — لا نيّةً في هجرة', async () => {
    const rows = await prisma.$queryRaw<{ slug: string }[]>`SELECT slug FROM reserved_slugs ORDER BY slug`;
    const held = new Set(rows.map((r) => r.slug));
    for (const name of ['www', 'api', 'admin', 'mail', 'rikzapp']) expect(held.has(name)).toBe(true);
    // وكلُّها شرعيّةٌ بالشكل نفسِه — فمحجوزٌ لا يطابق الشكلَ لا يحجب شيئاً أصلاً.
    for (const slug of held) expect(isValidSlug(slug)).toBe(true);
  });

  it('🔴 والمجسُّ مُثبَتٌ بحالتَين: النمطُ يقبل المشروع ويردّ ما ليس معرّفاً', () => {
    expect(isValidSlug('alfa-2026')).toBe(true);
    expect(isValidSlug('-alfa')).toBe(false);
  });
});
