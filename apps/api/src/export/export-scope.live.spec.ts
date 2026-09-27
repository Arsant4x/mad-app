import { Test } from '@nestjs/testing';
import { PrismaClient, Prisma } from '@mad-app/db';
import { AppModule } from '../app.module';
import { encryptSecret } from '../common/crypto/secret.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { ExportService } from './export.service';
import { EXPORT_EXCLUSIONS, delegateName, exportedModels, tenantOwnedModels } from './export-scope';
import { regionForNewCompany } from '../common/region/regions';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * تصدير بيانات المنشأة — **الاشتقاق والضمانة** (المرحلة صفر).
 *
 * ## ما يحرسه
 *
 * قبل هذا العمل كان التصدير يقوم على قائمةٍ يدوية بأربعين مندوباً، والقياس:
 * **٢٢ من ٦١ نموذجاً مملوكاً للمنشأة خارج التصدير — ٣٦٪**. فحقُّ التاجر في
 * بياناته كان قائماً بنسبة ٦٤٪ **وهو يبدو كاملاً**.
 *
 * والاختبار ① هنا هو ما يمنع عودة ذلك: يقارن **المخطط** بما يُصدَّر فعلاً،
 * فنموذجٌ جديد بلا قرار يُسقط الحزمة.
 *
 * ⚠️ ويجري على قاعدةٍ حيّة لأن الاشتقاق يُقرأ من `Prisma.dmmf` والمطابقة تسأل
 * القاعدة — ولا يقوم أيٌّ منهما على قاعدةٍ وهمية.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  export-scope.live.spec: تُخطّى — لا DATABASE_URL');
}

const d = HAS_DB ? describe : describe.skip;

/** سرٌّ يُزرع ليُبحث عنه: وجودُه في الحزمة عطلٌ لا رأي. */
const CANARY = 'CANARY-SECRET-DO-NOT-EXPORT-9f3a71';

d('تصدير المنشأة — الاشتقاق والضمانة', () => {
  const prisma = new PrismaClient();
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
  let exporter: ExportService;
  let tenantPrisma: TenantPrismaService;
  let companyId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    exporter = moduleRef.get(ExportService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const template = await prisma.permissionTemplate.findFirstOrThrow({
      where: { companyId: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const identity = await prisma.loginIdentity.create({
      data: {
        username: `probe-export-${stamp}`,
        passwordHash: 'probe-not-a-real-hash',
        actorType: 'COMPANY',
        company: { create: { orgName: `probe-export-${stamp}`, permissionTemplateId: template.id, ...regionForNewCompany(undefined) } },
      },
      include: { company: { select: { id: true } } },
    });
    companyId = identity.company!.id;

    await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // صفوفٌ في نماذج **كانت خارج القائمة اليدوية** — فغيابها من الحزمة عطل.
      const customer = await tx.customer.create({ data: { companyId, kind: 'NATURAL', name: 'عميل التصدير' } });
      await tx.quote.create({
        data: {
          companyId,
          no: `Q-EXPORT-${stamp}`,
          customerId: customer.id,
          issueDate: new Date('2026-01-10T00:00:00.000Z'),
          validUntil: new Date('2026-02-10T00:00:00.000Z'),
          subtotal: 100,
          taxTotal: 15,
          total: 115,
          baseSubtotal: 100,
          baseTaxTotal: 15,
          baseTotal: 115,
        },
      });

      // اعتمادٌ يحمل **قناريّاً**: يُبحث عنه في الحزمة كلها.
      await tx.zatcaCredential.create({
        data: {
          companyId,
          privateKeyEnc: encryptSecret(CANARY),
          productionCsidEnc: encryptSecret(CANARY),
          productionSecretEnc: encryptSecret(CANARY),
          csr: CANARY,
          status: 'PRODUCTION_ISSUED',
        },
      });
    });
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma.$disconnect();
  });

  it('⓪ حارسٌ على المجسّ: النموذجان المزروعان يحملان companyId فعلاً', () => {
    // بدونه قد يُختار نموذجٌ خارج نطاق التصدير أصلاً فلا يُثبت غيابُه شيئاً.
    const owned = tenantOwnedModels();
    expect(owned).toContain('Quote');
    expect(owned).toContain('ZatcaCredential');
  });

  it('① كل نموذج يحمل companyId يُصدَّر — أو له حجّة مكتوبة', () => {
    const owned = tenantOwnedModels();
    const exported = exportedModels();
    const unaccounted = owned.filter((m) => !exported.includes(m) && !(m in EXPORT_EXCLUSIONS));

    if (unaccounted.length > 0) {
      throw new Error(
        `نماذج تحمل companyId بلا قرار — لا تُصدَّر ولا استُثنيت بحجّة: ${unaccounted.join(', ')}`,
      );
    }
    expect(unaccounted).toEqual([]);

    // والعدد يُقرأ من المخطط لا من ثابتٍ مكتوب: رقمٌ مكتوب يشيخ كالقائمة.
    expect(exported.length).toBe(owned.length - Object.keys(EXPORT_EXCLUSIONS).length);
  });

  it('② الاستثناء الميت يُسقط الإقلاع — في الاتجاه الآخر', () => {
    // اسمٌ لا يقابله نموذج يعني استثناءً لا يمنع شيئاً، فيُصدَّر ما ظُنّ منعُه.
    EXPORT_EXCLUSIONS.NotARealModel = 'حجّة وهمية للفحص';
    try {
      expect(() => exportedModels()).toThrow(/NotARealModel/);
    } finally {
      delete EXPORT_EXCLUSIONS.NotARealModel;
    }
    // وتعود الحالة سليمة — وإلا سمّم الاختبار ما بعده.
    expect(() => exportedModels()).not.toThrow();
  });

  it('③ الحزمة تحمل النماذج التي كانت خارج القائمة اليدوية', async () => {
    const out = await exporter.exportAll(companyId, 'COMPANY');
    // `quote` و`payment` و`posShift` كانت جميعاً خارج التصدير قبل الاشتقاق.
    for (const key of ['quote', 'quoteLine', 'payment', 'paymentAllocation', 'posShift', 'attendanceRecord']) {
      expect(Object.keys(out.data)).toContain(key);
    }
    expect((out.data[delegateName('Quote')] as unknown[]).length).toBe(1);
  });

  it('④ⓐ ⭐ اللقطة واقعةٌ فعلاً — تُقرأ من الجلسة لا من نصّ البيان', async () => {
    /**
     * ⚠️ **البيان يُعلن `REPEATABLE READ`، والإعلان ليس ضمانة.**
     *
     * وقد كاد يقع الوهم هنا حرفياً: أول صياغة طلبت اللقطة **داخل** جسد
     * المعاملة، وPostgres يردّها لأن `set_config` سبقتها:
     *
     *     ERROR: SET TRANSACTION ISOLATION LEVEL must be called before any query
     *
     * فكانت المعاملة تمضي بـ`READ COMMITTED` **والبيان يقول لقطة**. فالتوكيد
     * هنا يسأل الجلسة نفسها، لا نصّ البيان (§8.7: الحارس يقرأ المصدر).
     */
    const [withSnapshot] = await tenantPrisma.runInTenantContext(
      companyId,
      (tx) => tx.$queryRaw<{ level: string }[]>`SELECT current_setting('transaction_isolation') AS level`,
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    expect(withSnapshot.level).toBe('repeatable read');

    // والحالة المقابلة: بلا الخيار تبقى الافتراضية — فالفرق من الخيار لا من
    // بيئة القاعدة (وإلا لمرّ التوكيد ولو لم يعمل الخيار إطلاقاً).
    const [without] = await tenantPrisma.runInTenantContext(
      companyId,
      (tx) => tx.$queryRaw<{ level: string }[]>`SELECT current_setting('transaction_isolation') AS level`,
    );
    expect(without.level).not.toBe('repeatable read');
  });

  it('④ البيان يطابق القاعدة — والعدد سؤالٌ مستقلّ لا طول مصفوفة', async () => {
    const out = await exporter.exportAll(companyId, 'COMPANY');
    expect(out.manifest.verifiedAgainstDatabase).toBe(true);
    expect(out.manifest.isolation).toBe('REPEATABLE READ');
    expect(out.manifest.tables).toBe(exportedModels().length);

    // كل جدولٍ في البيان يطابق طول مصفوفته — والخدمة أسقطت الحزمة لو لم يطابق.
    for (const [key, count] of Object.entries(out.manifest.rows)) {
      expect((out.data[key] as unknown[]).length).toBe(count);
    }
    expect(out.manifest.totalRows).toBe(
      Object.values(out.manifest.rows).reduce((a, b) => a + b, 0),
    );
  });

  it('⑤ ⭐ لا سرّ في الحزمة — بحثٌ في النصّ كلّه لا مراجعةُ عين', async () => {
    const out = await exporter.exportAll(companyId, 'COMPANY');
    const serialised = JSON.stringify(out);

    // القناريّ مزروعٌ في أربعة حقول من اعتماد الهيئة (مُعمّاة وصريحة).
    expect(serialised).not.toContain(CANARY);
    // ولا اسم النموذج نفسه بين الجداول.
    expect(Object.keys(out.data)).not.toContain('zatcaCredential');

    // ⚠️ ويُصدَّر **وجود الربط لا قيمته** — قرار المالك 2026-08-16.
    expect(out.zatcaLink).toBeTruthy();
    expect((out.zatcaLink as { status?: string }).status).toBe('PRODUCTION_ISSUED');
    expect(Object.keys(out.zatcaLink as object).sort()).toEqual(
      ['createdAt', 'environment', 'onboardedAt', 'status', 'updatedAt'],
    );
  });

  it('⑥ الحدود مكتوبة في الحزمة — لا يكتشفها التاجر بنفسه', async () => {
    const out = await exporter.exportAll(companyId, 'COMPANY');
    expect(out.notes['المحذوفات']).toContain('تسعة نماذج');
    expect(out.notes['أسرار الفوترة الإلكترونية']).toContain('لا تُصدَّر');
  });

  it('⑦ التصدير مقصورٌ على المالك — والتضييق مقصود', async () => {
    await expect(exporter.exportAll(companyId, 'EMPLOYEE')).rejects.toThrow();
    await expect(exporter.exportAll(companyId, 'PLATFORM_ADMIN')).rejects.toThrow();
  });
});



