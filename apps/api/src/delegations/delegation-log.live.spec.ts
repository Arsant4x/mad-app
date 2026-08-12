import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * إثباتٌ **حيّ** لحرّاس سجل التفويض — على قاعدة بيانات حقيقية.
 *
 * ## لماذا هذا الملف موجود
 *
 * `delegation-log.spec.ts` يقرأ نصّ الترحيل ويثبت أن المنع **مكتوب**. وهو
 * فحصٌ لازم لا كافٍ: نصٌّ سليم قد لا يُطبَّق (ترحيلٌ لم يُشغَّل · مُشغِّل
 * أُسقط لاحقاً · صلاحية تتجاوز السياسة). **وحارس نظامي غير مُختبَر حيّاً
 * ليس امتثالاً** — قرار المالك 2026-08-12.
 *
 * فهنا تُجرَّب المسارات الأربعة **فعلاً**:
 *   ① `DELETE` مباشر            ② `deleteMany`
 *   ③ حذف متسلسل عبر الشركة      ④ كتابة `createdAt` من العميل
 *
 * ## شروط التشغيل
 *
 * يحتاج `DATABASE_URL` إلى قاعدة مُرحَّلة، **والاتصال بدور غير خارق**
 * (`app_user`): الدور الخارق يتجاوز RLS بصمت فيُبطل المعنى. يُتخطّى صراحةً
 * حين لا قاعدة — تخطٍّ معلَّل لا صامت.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

d('حرّاس سجل التفويض — إثباتٌ حيّ على قاعدة حقيقية', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    /**
     * ⚠️ **تُقرأ منشأة قائمة، ولا تُركَّب واحدة.**
     *
     * أول صياغة استدعت `prisma.company.create({ orgName, baseCurrency })`
     * — وسقطت الأربعة في `beforeAll` بـ`PrismaClientValidationError` **قبل
     * أن تلمس أي حارس**. والسبب أن `Company` يتطلّب `loginIdentityId`
     * و`permissionTemplateId` أيضاً: شكلٌ **افتُرض ولم يُقرأ من المخطط**.
     *
     * وتركيبها هنا يدوياً يعني إعادة بناء مسار التسجيل داخل اختبار —
     * فيصير الاختبار يحرس نسخته من المسار لا المسار نفسه. فالبذرة تُشغَّل
     * في السير (`prisma db seed`) وتُقرأ منها منشأة: مسار الإنشاء الحقيقي.
     *
     * و`findFirstOrThrow` مقصودة: قاعدةٌ بلا منشأة تعني أن البذرة لم
     * تُشغَّل — وذلك سقوطٌ صريح لا تخطٍّ صامت.
     */
    const company = await prisma.company.findFirstOrThrow({ select: { id: true } });
    companyId = company.id;
  });

  /**
   * ⚠️ التنظيف بالختم لا بالحذف — فالجدول نفسه يمنع الحذف، وهو المقصود.
   * الصفوف المضافة تبقى: بضعة صفوف في قاعدة CI تموت مع الوظيفة.
   */

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** كل عملية داخل سياق المستأجر — بدونه تحجب RLS كل شيء. */
  const inTenant = <T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    });

  const insertRow = (seq: number, createdAt?: Date) =>
    inTenant(async (tx) => {
      const id = randomUUID();
      if (createdAt) {
        await tx.$executeRaw`
          INSERT INTO "delegation_logs" ("id","companyId","seq","grantorId","granteeId","nodeKey","grants","state","createdAt")
          VALUES (${id}, ${companyId}, ${seq}, 'owner', 'emp', 'contracts', ARRAY['contracts:view'], 'ACTIVE', ${createdAt})`;
      } else {
        await tx.$executeRaw`
          INSERT INTO "delegation_logs" ("id","companyId","seq","grantorId","granteeId","nodeKey","grants","state")
          VALUES (${id}, ${companyId}, ${seq}, 'owner', 'emp', 'contracts', ARRAY['contracts:view'], 'ACTIVE')`;
      }
      return id;
    });

  it('① DELETE مباشر يُرفض من القاعدة', async () => {
    const id = await insertRow(1);
    await expect(
      inTenant((tx) => tx.$executeRaw`DELETE FROM "delegation_logs" WHERE "id" = ${id}`),
    ).rejects.toThrow(/ملحقٌ فقط|append/i);

    // والصفّ باقٍ — الرفض ليس صامتاً ولا جزئياً.
    const rows = await inTenant((tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "delegation_logs" WHERE "id" = ${id}`);
    expect(rows).toHaveLength(1);
  });

  it('② deleteMany عبر Prisma يُرفض كذلك — لا يلتفّ على المُشغِّل', async () => {
    await insertRow(2);
    await expect(
      inTenant((tx) => (tx as unknown as { delegationLog: { deleteMany: (a: unknown) => Promise<unknown> } }).delegationLog.deleteMany({ where: { companyId } })),
    ).rejects.toThrow();

    const count = await inTenant((tx) => tx.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "delegation_logs"`);
    expect(Number(count[0].c)).toBeGreaterThanOrEqual(2);
  });

  it('③ حذف الشركة يُرفض بـRESTRICT — الحذف المتسلسل الذي لا يمرّ بأي دالة', async () => {
    /**
     * ⚠️ **يُؤكَّد أن الرفض من `delegation_logs` بعينه.**
     *
     * منشأةٌ مبذورة لها علاقات كثيرة، فحذفها يفشل لأسبابٍ شتّى. وتوكيدٌ
     * على مجرّد `.rejects.toThrow()` **يمرّ لسببٍ خاطئ** — يبدو إثباتاً
     * وهو ليس منه. فالمقصود قيدُ سجل التفويض، فيُطابَق باسمه.
     */
    const err = await prisma.company.delete({ where: { id: companyId } }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toContain('delegation_logs');

    // والمنشأة باقية — الرفض ليس جزئياً.
    const still = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    expect(still).not.toBeNull();
  });

  it('④ `createdAt` المرسَل من العميل يُدهس بزمن الخادم', async () => {
    const clientTime = new Date('1999-01-01T00:00:00Z');
    const id = await insertRow(3, clientTime);

    const rows = await inTenant(
      (tx) => tx.$queryRaw<{ createdAt: Date }[]>`SELECT "createdAt" FROM "delegation_logs" WHERE "id" = ${id}`,
    );
    expect(rows).toHaveLength(1);
    // ⚠️ ليس «قريباً من الآن» بل **ليس ما أرسله العميل** — والفرق أن
    // الأول يمرّ لو كان الخادم مضبوطاً على 1999.
    expect(rows[0].createdAt.getUTCFullYear()).toBeGreaterThan(2020);
    expect(rows[0].createdAt.getTime()).not.toBe(clientTime.getTime());
  });
});
