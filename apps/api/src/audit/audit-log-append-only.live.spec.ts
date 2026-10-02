import { PrismaClient } from '@mad-app/db';
import { randomUUID } from 'node:crypto';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * إثباتٌ **حيّ** أن سجلَّ التدقيق ملحقٌ فقط (`ق-١٥٧٥` · البند 3 من مراجعة 3.3)، على قاعدةٍ حقيقية وبدور التطبيق.
 *
 * نظيرُ `tasks/task-log.live.spec.ts` وبحجّته: الترحيلُ يُثبت أن المنعَ **مكتوب**، وهذا يُثبت أنه **يعمل**. والمراجعُ
 * أثبت بالتشغيل أن دورَ التطبيق عدّل الأثرَ ثم محاه (PoC 3)، فلا يكفي هنا نصٌّ يقرأ الترحيل.
 *
 * أربعةُ مساراتٍ تُجرَّب فعلاً، ومسبارٌ قبلها:
 *   ⓪ المسبارُ يرى: المُشغِّلان قائمان في الكتالوج، والصفُّ المُدرَج يُقرأ (حالةٌ يجب أن تُصاب).
 *   ① `UPDATE` خامّ يُرفض والصفُّ كما كُتب   ② `DELETE` خامّ يُرفض
 *   ③ `deleteMany` عبر Prisma يُرفض           ④ `TRUNCATE` يُرفض (لا يمرّ عليه مُشغِّلُ الصفّ)
 *
 * ⚠️ والصفوفُ المُدرَجة هنا تبقى، فهي لا تُحذف بعد اليوم بحال: وهذا هو المطلوب لا أثرٌ جانبيّ. وعلى السير تموت
 * القاعدةُ مع الوظيفة، ومحلّياً تبقى بضعةُ صفوفٍ موسومة بكيانٍ لا يقرؤه شيء.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;
const ENTITY = 'append-only-probe';

d('سجلُّ التدقيق ملحقٌ فقط — إثباتٌ حيّ على قاعدةٍ حقيقية (ق-١٥٧٥)', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    // منشأةٌ قائمة من البذرة لا منشأةٌ تُركَّب: قاعدةٌ بلا منشأة تعني أن البذرة لم تُشغَّل، فيسقط صراحةً لا يُتخطّى.
    companyId = (await prisma.company.findFirstOrThrow({ select: { id: true }, orderBy: { createdAt: 'asc' } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const inTenant = <T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    });

  const insertRow = () =>
    inTenant(async (tx) => {
      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "audit_logs" ("id","companyId","actorType","actorId","actorName","screen","action","entity","summary")
        VALUES (${id}, ${companyId}, 'COMPANY', 'probe', 'مسبار', 'audit', 'add', ${ENTITY}, 'أثرٌ للإثبات')`;
      return id;
    });

  const readSummary = (id: string) =>
    inTenant((tx) => tx.$queryRaw<{ summary: string }[]>`SELECT "summary" FROM "audit_logs" WHERE "id" = ${id}`);

  it('⓪ المسبارُ يرى: المُشغِّلان قائمان على الجدول، والصفُّ المُدرَج يُقرأ', async () => {
    const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE tgrelid = '"audit_logs"'::regclass AND NOT tgisinternal ORDER BY tgname`;
    expect(triggers.map((t) => t.tgname)).toEqual(['audit_logs_append_only_guard', 'audit_logs_no_truncate_guard']);

    const id = await insertRow();
    expect(await readSummary(id)).toEqual([{ summary: 'أثرٌ للإثبات' }]);
  });

  it('① UPDATE خامّ يُرفض، والصفُّ كما كُتب', async () => {
    const id = await insertRow();
    await expect(inTenant((tx) => tx.$executeRaw`UPDATE "audit_logs" SET "summary" = 'مُعدَّل' WHERE "id" = ${id}`)).rejects.toThrow(/لا يُعدَّل/);
    expect(await readSummary(id)).toEqual([{ summary: 'أثرٌ للإثبات' }]);
  });

  it('② DELETE خامّ يُرفض، والصفُّ باقٍ', async () => {
    const id = await insertRow();
    await expect(inTenant((tx) => tx.$executeRaw`DELETE FROM "audit_logs" WHERE "id" = ${id}`)).rejects.toThrow(/ملحقٌ فقط/);
    expect(await readSummary(id)).toHaveLength(1);
  });

  it('③ deleteMany عبر Prisma يُرفض كذلك، فلا يلتفّ على المُشغِّل', async () => {
    const id = await insertRow();
    // محرّكُ Prisma يُهرّب الحركاتِ في رسالة القاعدة (`\u{64c}`)، فالنصُّ لا يطابَق حرفاً؛ ورمزُ `P0001` (`RAISE EXCEPTION`)
    // هو الرفضُ نفسُه، ولا يرفع في هذه العبارة غيرُ المُشغِّل. وبقاءُ الصفّ تحته هو الحكم.
    await expect(inTenant((tx) => tx.auditLog.deleteMany({ where: { entity: ENTITY } }))).rejects.toThrow(/P0001/);
    expect(await readSummary(id)).toHaveLength(1);
  });

  it('④ TRUNCATE يُرفض، ولا يمرّ عليه مُشغِّلُ الصفّ', async () => {
    const id = await insertRow();
    await expect(inTenant((tx) => tx.$executeRaw`TRUNCATE "audit_logs"`)).rejects.toThrow(/ملحقٌ فقط/);
    expect(await readSummary(id)).toHaveLength(1);
  });
});
