import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * **هجرةُ نقل المنشآت عن القالب النظاميّ — تُشغَّل بنصّها على أربع حالاتٍ مصنوعة**
 * (`ق-٦٥١` · `ق-٦٥٩`).
 *
 * ## العطلُ الذي أنشأ هذا الملفّ
 *
 * صياغةُ الهجرة الأولى بحثت عن القالب الهدف **قبل** أن تعدّ ما يُنقل، فصرخت على
 * قاعدةٍ فارغة — **وهي حالُ CI ونشرٍ من الصفر، لأن البذرةَ تلي الهجرات** — وأسقطت
 * `db-integration` و`playwright` في #325. الهجرةُ كانت قد مرّت على التطوير
 * (٢٤٠ منشأة نُقلت) **فبدت مُثبَتة** — «إصلاحٌ يُثبَت بطُعمٍ دائمٍ لا بحالةٍ مرّت».
 *
 * ## كيف يُشغَّل نصُّ الهجرة بلا مساسٍ بالجداول الحقيقية
 *
 * جدولان مؤقّتان بالاسمَين نفسِهما (`companies` · `permission_templates`)
 * داخل معاملةٍ تُرجَع: **الجداولُ المؤقّتة تُظلّل جداولَ `public` في مسار البحث**،
 * فنصُّ الهجرة — **يُقرأ من ملفّها كما هو، لا نسخةً** — يعمل عليهما وحدهما.
 *
 * ⚠️ **والآليةُ تُثبَت لا تُفترض** («إثباتٌ عكسيٌّ يحتاج تحقّقاً من طُعمه»): قبل كل
 * حكمٍ يُقاس أن `companies` غيرَ المؤهَّل يعدّ صفراً بينما `public.companies` يعدّ
 * أكثرَ من صفر — فإن لم يتظلّل الاسمُ لكان الحكمُ على الجداول الحقيقية، **وهو ما
 * يُمنع**.
 *
 * ## الحالاتُ الأربع
 *
 *   ① فارغة (حالُ CI): لا قوالبَ ولا منشآت ⇒ **تمرّ** بلا صراخ.
 *   ② منشآتٌ على قالبٍ نظاميٍّ شامل ولا هدف ⇒ **تصرخ** (لا تعبئةَ بالظنّ).
 *   ③ منشأةٌ على نظاميٍّ شامل والهدفُ موجود ⇒ **تُنقل** والعدُّ بعدها صفر.
 *   ④ منشأةٌ على نظاميٍّ **غيرِ شامل** والهدفُ موجود ⇒ **تصرخ** (قبل ≠ نُقل) — شرطُ
 *      المالك ①: لا تُنقل منشأةٌ قالبُها ليس شاملاً.
 */

const MIGRATION = join(__dirname, '..', '..', 'prisma', 'migrations', '20260912130000_companies_off_system_template', 'migration.sql');
const MIGRATION_SQL = readFileSync(MIGRATION, 'utf8');

const HAS_DB = Boolean(process.env.DATABASE_URL);
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  off-system-template-migration.live.spec: تُخطّى — لا DATABASE_URL');
}
const d = HAS_DB ? describe : describe.skip;

/** علامةُ الإرجاع: المعاملةُ تُرجَع دائماً — لا أثرَ على القاعدة مهما كانت الحالة. */
const ROLLBACK = 'off-system-template-migration: rollback';

type Tx = Prisma.TransactionClient;

interface Scratch {
  /** عدُّ `companies` غيرِ المؤهَّل — يجب أن يكون صفراً (المؤقّت يُظلّل). */
  shadowed: number;
  /** عدُّ `public.companies` — يجب أن يكون أكبرَ من صفر (الحقيقيُّ ما زال هناك). */
  real: number;
}

const count = async (tx: Tx, sql: string) => Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(sql))[0].n);

/**
 * معاملةٌ فيها الجدولان المؤقّتان، تُرجَع في نهايتها. يعيد ما أنتجته `fn` **بعد** إثبات
 * التظليل — وإن فشل الإثباتُ لا يُنفَّذ نصُّ الهجرة أصلاً.
 */
async function inScratch<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<{ scratch: Scratch; out: T }> {
  let result: { scratch: Scratch; out: T } | undefined;
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE permission_templates (id TEXT PRIMARY KEY, "companyId" TEXT, "isSystem" BOOLEAN NOT NULL, "isAllScreens" BOOLEAN NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()) ON COMMIT DROP',
      );
      await tx.$executeRawUnsafe('CREATE TEMP TABLE companies (id TEXT PRIMARY KEY, "permissionTemplateId" TEXT) ON COMMIT DROP');
      const scratch: Scratch = {
        shadowed: await count(tx, 'SELECT count(*)::bigint AS n FROM companies'),
        real: await count(tx, 'SELECT count(*)::bigint AS n FROM public.companies'),
      };
      if (scratch.shadowed !== 0 || scratch.real === 0) {
        throw new Error(`التظليلُ لم يقع — غيرُ المؤهَّل ${scratch.shadowed} · public ${scratch.real}: لا يُشغَّل نصُّ الهجرة على الجداول الحقيقية`);
      }
      result = { scratch, out: await fn(tx) };
      throw new Error(ROLLBACK);
    })
    .catch((e: unknown) => {
      if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
    });
  if (!result) throw new Error('المعاملةُ لم تُنتج شيئاً');
  return result;
}

/** ينفّذ نصَّ الهجرة كما هو ويعيد خطأه إن صرخت — أو `null` إن مرّت. */
const runMigration = (tx: Tx) => tx.$executeRawUnsafe(MIGRATION_SQL).then(() => null as string | null, (e: Error) => String(e.message));

d('هجرة ق-٦٥١ — نصُّها يُشغَّل على أربع حالاتٍ مصنوعة', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠️ النصُّ المُشغَّل هو ملفُّ الهجرة نفسُه — كتلةُ DO واحدة تعدّ قبل أن تبحث عن الهدف', () => {
    expect(MIGRATION_SQL).toMatch(/DO \$\$/);
    // ⚠️ الترتيبُ هو الإصلاح: العدُّ قبل الهدف. لو عاد الهدفُ أولاً لعاد صراخُ القاعدة الفارغة.
    const countAt = MIGRATION_SQL.indexOf('SELECT count(*) INTO before_count');
    const targetAt = MIGRATION_SQL.indexOf('SELECT id INTO target_id');
    expect(countAt).toBeGreaterThan(-1);
    expect(targetAt).toBeGreaterThan(countAt);
  });

  it('🔴 ① قاعدةٌ فارغة (حالُ CI ونشرٍ من الصفر): تمرّ بلا صراخ', async () => {
    // العدُّ قبل التشغيل: لو صرخت الهجرةُ لأُجهضت المعاملةُ ولما قُرئ شيءٌ بعدها.
    const { scratch, out } = await inScratch(prisma, async (tx) => ({
      templates: await count(tx, 'SELECT count(*)::bigint AS n FROM permission_templates'),
      error: await runMigration(tx),
    }));
    expect(scratch).toEqual({ shadowed: 0, real: expect.any(Number) });
    expect(out.templates).toBe(0); // لا قوالبَ فعلاً — وهي عينُ الحالة التي صرخت.
    expect(out.error).toBeNull();
  });

  it('🔴 ② منشآتٌ على قالبٍ نظاميٍّ شامل ولا هدف: تصرخ ولا تعبّئ بالظنّ', async () => {
    const { out } = await inScratch(prisma, async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO permission_templates (id, "companyId", "isSystem", "isAllScreens") VALUES ('sys', NULL, true, true)`);
      await tx.$executeRawUnsafe(`INSERT INTO companies (id, "permissionTemplateId") VALUES ('c1', 'sys'), ('c2', 'sys')`);
      return { error: await runMigration(tx) };
    });
    expect(out.error).not.toBeNull();
    expect(out.error).toContain('ق-٦٥١');
    expect(out.error).toContain('لا تعبئةَ بالظنّ');
  });

  it('⭐ ③ منشأةٌ على نظاميٍّ شامل والهدفُ موجود: تُنقل إلى أقدم هدفٍ والعدُّ بعدها صفر', async () => {
    const { out } = await inScratch(prisma, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO permission_templates (id, "companyId", "isSystem", "isAllScreens", "createdAt") VALUES
           ('sys',    NULL, true,  true, '2026-01-01'),
           ('newer',  NULL, false, true, '2026-03-01'),
           ('target', NULL, false, true, '2026-02-01'),
           ('scoped', 'c9', false, true, '2026-01-15')`,
      );
      await tx.$executeRawUnsafe(`INSERT INTO companies (id, "permissionTemplateId") VALUES ('c1', 'sys'), ('c2', 'newer')`);
      const error = await runMigration(tx);
      const rows = await tx.$queryRawUnsafe<{ id: string; permissionTemplateId: string }[]>('SELECT id, "permissionTemplateId" FROM companies ORDER BY id');
      const onSystem = await count(tx, 'SELECT count(*)::bigint AS n FROM companies c JOIN permission_templates t ON t.id = c."permissionTemplateId" WHERE t."isSystem"');
      return { error, rows, onSystem };
    });
    expect(out.error).toBeNull();
    // c1 نُقلت إلى **أقدم** عامٍّ شاملٍ غيرِ نظاميّ (لا الأحدث ولا المخصوصَ بمنشأة)؛ وc2 لم تُمسّ.
    expect(out.rows).toEqual([
      { id: 'c1', permissionTemplateId: 'target' },
      { id: 'c2', permissionTemplateId: 'newer' },
    ]);
    expect(out.onSystem).toBe(0);
  });

  it('🔴 ④ منشأةٌ على نظاميٍّ غيرِ شامل والهدفُ موجود: تصرخ — قبل ≠ نُقل (شرطُ المالك ①)', async () => {
    const { out } = await inScratch(prisma, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO permission_templates (id, "companyId", "isSystem", "isAllScreens") VALUES
           ('sys-partial', NULL, true,  false),
           ('target',      NULL, false, true)`,
      );
      await tx.$executeRawUnsafe(`INSERT INTO companies (id, "permissionTemplateId") VALUES ('c1', 'sys-partial')`);
      return { error: await runMigration(tx) };
    });
    expect(out.error).not.toBeNull();
    expect(out.error).toContain('ق-٦٥١');
    expect(out.error).toContain('العدُّ لا يطابق');
  });
});
