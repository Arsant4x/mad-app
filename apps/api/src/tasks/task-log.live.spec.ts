import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * إثباتٌ **حيّ** لحرّاس سجل المهام — على قاعدة بيانات حقيقية.
 *
 * نظير `delegations/delegation-log.live.spec.ts` وبنفس الحجّة: الفحص
 * البنيوي يقرأ نصّ الترحيل ويثبت أن المنع **مكتوب** — وهو لازمٌ لا كافٍ.
 * **وحارس غير مُختبَر حيّاً ليس امتثالاً** (قرار المالك 2026-08-12).
 *
 * وخمسة مسارات تُجرَّب فعلاً:
 *   ① `DELETE` مباشر            ② `deleteMany`
 *   ③ حذف متسلسل عبر الشركة      ④ كتابة `createdAt` من العميل
 *   ⑤ `UPDATE` يُرفض — **يخصّ المهام**: السجل وقائع لا حالات، وهو قرارٌ
 *      يحتاج إثباتاً حيّاً لا نصّاً في ترحيل.
 *
 * ⚠️ والاتصال بدور **غير خارق** (`app_user`): الخارق يتجاوز RLS بصمت
 * فيُبطل المعنى. يُتخطّى صراحةً حين لا قاعدة — تخطٍّ معلَّل لا صامت.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

d('حرّاس سجل المهام — إثباتٌ حيّ على قاعدة حقيقية', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    /**
     * ⚠️ تُقرأ منشأة قائمة ولا تُركَّب واحدة — درس `delegation-log.live`:
     * تركيبها يدوياً يعني إعادة بناء مسار التسجيل داخل اختبار، فيصير
     * الاختبار يحرس نسخته من المسار لا المسار نفسه. والبذرة تُشغَّل في السير.
     *
     * و`findFirstOrThrow` مقصودة: قاعدةٌ بلا منشأة تعني أن البذرة لم
     * تُشغَّل — وذلك سقوطٌ صريح لا تخطٍّ صامت.
     */
    const company = await prisma.company.findFirstOrThrow({ select: { id: true } });
    companyId = company.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const inTenant = <T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    });

  /** `seq` فريد لكل منشأة، فيُشتقّ من أكبر موجود — لا رقمٌ ثابت يتصادم. */
  const insertRow = (createdAt?: Date) =>
    inTenant(async (tx) => {
      const id = randomUUID();
      const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
        SELECT COALESCE(MAX("seq"), 0) + 1 AS next FROM "task_logs"`;
      if (createdAt) {
        await tx.$executeRaw`
          INSERT INTO "task_logs" ("id","companyId","seq","taskId","actorId","fromStatus","toStatus","createdAt")
          VALUES (${id}, ${companyId}, ${next}, 'task-1', 'emp', 'OPEN', 'IN_PROGRESS', ${createdAt})`;
      } else {
        await tx.$executeRaw`
          INSERT INTO "task_logs" ("id","companyId","seq","taskId","actorId","fromStatus","toStatus")
          VALUES (${id}, ${companyId}, ${next}, 'task-1', 'emp', 'OPEN', 'IN_PROGRESS')`;
      }
      return id;
    });

  it('① DELETE مباشر يُرفض من القاعدة', async () => {
    const id = await insertRow();
    await expect(
      inTenant((tx) => tx.$executeRaw`DELETE FROM "task_logs" WHERE "id" = ${id}`),
    ).rejects.toThrow(/ملحقٌ فقط/);

    const rows = await inTenant((tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "task_logs" WHERE "id" = ${id}`);
    expect(rows).toHaveLength(1);
  });

  it('② deleteMany عبر Prisma يُرفض كذلك — لا يلتفّ على المُشغِّل', async () => {
    await insertRow();
    await expect(
      inTenant((tx) =>
        (tx as unknown as { taskLog: { deleteMany: (a: unknown) => Promise<unknown> } }).taskLog.deleteMany({
          where: { companyId },
        }),
      ),
    ).rejects.toThrow();

    const count = await inTenant((tx) => tx.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "task_logs"`);
    expect(Number(count[0].c)).toBeGreaterThanOrEqual(2);
  });

  it('③ حذف الشركة يُرفض بـRESTRICT — والرفض من `task_logs` بعينه', async () => {
    /**
     * ⚠️ توكيدٌ على مجرّد `.rejects.toThrow()` **يمرّ لسببٍ خاطئ**: منشأةٌ
     * مبذورة لها علاقات كثيرة، وقيدُ `delegation_logs` وحده كافٍ لإفشال
     * الحذف. فيُطابَق الاسم صراحةً وإلا لم يُثبت هذا الجدول شيئاً.
     */
    const err = await prisma.company.delete({ where: { id: companyId } }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toContain('task_logs');

    const still = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    expect(still).not.toBeNull();
  });

  it('④ `createdAt` المرسَل من العميل يُدهس بزمن الخادم', async () => {
    const clientTime = new Date('1999-01-01T00:00:00Z');
    const id = await insertRow(clientTime);

    const rows = await inTenant(
      (tx) => tx.$queryRaw<{ createdAt: Date }[]>`SELECT "createdAt" FROM "task_logs" WHERE "id" = ${id}`,
    );
    expect(rows).toHaveLength(1);
    // ليس «قريباً من الآن» بل **ليس ما أرسله العميل**.
    expect(rows[0].createdAt.getUTCFullYear()).toBeGreaterThan(2020);
    expect(rows[0].createdAt.getTime()).not.toBe(clientTime.getTime());
  });

  it('⑤ ⭐ UPDATE يُرفض — السجل وقائع لا حالات', async () => {
    /**
     * هذا ما يميّز سجل المهام عن سجل التفويض: ذاك يسمح بختمٍ واحد
     * (`ACTIVE → SEALED → REVOKED`)، وهذا **لا يسمح بشيء**. والانتقال
     * التالي صفٌّ جديد لا تعديلٌ لسابقه — وهو قرارٌ يحتاج إثباتاً حيّاً.
     */
    const id = await insertRow();
    await expect(
      inTenant((tx) => tx.$executeRaw`UPDATE "task_logs" SET "toStatus" = 'DONE' WHERE "id" = ${id}`),
    ).rejects.toThrow(/لا يُعدَّل/);

    // والقيمة لم تتغيّر — الرفض ليس جزئياً.
    const rows = await inTenant(
      (tx) => tx.$queryRaw<{ toStatus: string }[]>`SELECT "toStatus" FROM "task_logs" WHERE "id" = ${id}`,
    );
    expect(rows[0].toStatus).toBe('IN_PROGRESS');
  });
});
