import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { DEFAULT_CHART } from '../src/accounts/default-chart';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (16.7 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(55000);

/**
 * دليل الحسابات الافتراضي (4.7) — الاختبار الحاسم: **منشأة عمرها ثوانٍ تصدر
 * مستنداً فيُرحَّل، بصفر إعداد**.
 *
 * قبل هذا التغيير كان `resolveAccountIds` يعيد `null` فيُحفظ المستند بلا قيد
 * وبلا رسالة — عطلٌ صامت لا يظهر إلا في تقرير فارغ بعد أسابيع. ولذلك يقيس هذا
 * الاختبار الأثر لا النية: لا يعدّ الحسابات المنشأة، بل يفتح منشأة من كل مسار
 * ميلاد ويطالبها بـ`journalEntryId` غير فارغ على فاتورة ومشترى وسند قبض وبيع
 * نقطة بيع. حسابٌ ناقص = قيد مفقود = اختبار ساقط.
 *
 * (هذا ما استغنى عنه invoice-purchase-auto-posting.e2e-spec.ts سابقاً بقوله إن
 * تهيئة منشأة بلا دليل «غير عملية هنا» — صارت عملية لأن الميلاد نفسه تغيّر.)
 */
describe('Default chart of accounts on company creation (e2e)', () => {
  let app: INestApplication;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const withToken = (r: request.Test, token: string) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  }, 90000);

  afterAll(async () => app.close());

  /** منشأة من مسار لوحة المدير — تُعاد بـtoken مالكها. */
  async function bornViaAdminPanel(tag: string): Promise<string> {
    const adminToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
    ).body.accessToken;
    const templates = (await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${adminToken}`).expect(200)).body;
    const fullAccess = templates.find((t: { isAllScreens: boolean; isSystem: boolean }) => t.isAllScreens && !t.isSystem);

    const username = `chart-admin-${tag}-${suffix}`;
    await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orgName: `منشأة الدليل (مدير) ${tag} ${suffix}`, username, password: 'ChartPass123!', email: `${username}@example.com`, permissionTemplateId: fullAccess.id })
      .expect(201);

    return (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'ChartPass123!' }).expect(200)).body.accessToken;
  }

  /** منشأة من مسار التسجيل الذاتي — التسجيل يعيد جلسة عاملة مباشرة. */
  async function bornViaSelfRegistration(tag: string): Promise<string> {
    const username = `chart-self-${tag}-${suffix}`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ orgName: `منشأة الدليل (ذاتي) ${tag} ${suffix}`, username, password: 'ChartPass123!', email: `${username}@example.com` })
      .expect(201);
    return res.body.accessToken;
  }

  const PATHS: [string, (tag: string) => Promise<string>][] = [
    ['لوحة المدير', bornViaAdminPanel],
    ['التسجيل الذاتي', bornViaSelfRegistration],
  ];

  describe.each(PATHS)('منشأة وُلدت عبر %s', (pathName, born) => {
    let token: string;
    const auth = (r: request.Test) => withToken(r, token);

    beforeAll(async () => {
      token = await born(pathName === 'لوحة المدير' ? 'a' : 'b');
    }, 90000);

    it('تُولد بدليل الحسابات كاملاً بلا أي إعداد', async () => {
      const accounts = (await auth(request(app.getHttpServer()).get('/accounts')).expect(200)).body as { code: string }[];
      const codes = new Set(accounts.map((a) => a.code));
      const missing = DEFAULT_CHART.map((a) => a.code).filter((c) => !codes.has(c));
      expect({ missing, born: accounts.length }).toEqual({ missing: [], born: accounts.length });
      expect(accounts.length).toBeGreaterThanOrEqual(DEFAULT_CHART.length);
    }, 90000);

    it('[SPEC 3.4] فاتورة أول يوم تُرحَّل — 1200 مديناً و4100/2200 دائنَين', async () => {
      const customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل ${suffix}` }).expect(201)).body.id;
      const inv = await auth(request(app.getHttpServer()).post('/invoices'))
        .send({ customerId, issueDate: '2026-07-20', dueDate: '2026-08-20', lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
        .expect(201);

      // المعيار الحاسم: قيدٌ فعلي، لا حسابٌ موجود.
      expect(inv.body.journalEntryId).toBeTruthy();

      const accounts = Object.fromEntries(
        ((await auth(request(app.getHttpServer()).get('/accounts')).expect(200)).body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]),
      );
      expect(accounts['1200']).toBeCloseTo(115, 2);
      expect(accounts['4100']).toBeCloseTo(100, 2);
      expect(accounts['2200']).toBeCloseTo(15, 2);
    }, 90000);

    it('[SPEC 5.3] مشترى أول يوم يُرحَّل — 5300 مديناً و2100 دائناً', async () => {
      const supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورد ${suffix}` }).expect(201)).body.id;
      const pur = await auth(request(app.getHttpServer()).post('/purchases')).send({ supplierId, date: '2026-07-20', subtotal: 200 }).expect(201);

      expect(pur.body.journalEntryId).toBeTruthy();
      const accounts = Object.fromEntries(
        ((await auth(request(app.getHttpServer()).get('/accounts')).expect(200)).body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]),
      );
      expect(accounts['5300']).toBeCloseTo(200, 2); // مستقرّ الفئة المجهولة
      expect(accounts['2100']).toBeCloseTo(230, 2);
    }, 90000);

    it('سند قبض أول يوم يُرحَّل — 1000 مديناً و1200 دائناً', async () => {
      const customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل قبض ${suffix}` }).expect(201)).body.id;
      const inv = await auth(request(app.getHttpServer()).post('/invoices'))
        .send({ customerId, issueDate: '2026-07-20', dueDate: '2026-08-20', lines: [{ description: `بند قبض ${suffix}`, quantity: 1, unitPrice: 300, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
        .expect(201);
      const bankId = (await auth(request(app.getHttpServer()).post('/banks')).send({ name: `صندوق ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: '2026-07-01' }).expect(201)).body.id;

      const pay = await auth(request(app.getHttpServer()).post('/payments'))
        .send({ customerId, date: '2026-07-21', amount: 300, method: 'CASH', bankId, allocations: [{ invoiceId: inv.body.id, amount: 300 }] })
        .expect(201);

      expect(pay.body.journalEntryId).toBeTruthy();
      expect(pay.body.status ?? 'PAID').toBeTruthy();
    }, 90000);

    it('بيع نقطة بيع أول يوم يُرحَّل كفاتورة مدفوعة', async () => {
      const productId = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف ${suffix}`, price: 50 }).expect(201)).body.id;
      await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);

      const sale = await auth(request(app.getHttpServer()).post('/pos/sales')).send({ lines: [{ productId, quantity: 2 }], paymentMethod: 'CASH' }).expect(201);

      expect(sale.body.status).toBe('PAID');
      expect(sale.body.journalEntryId).toBeTruthy();
    }, 90000);
  });

  /**
   * السكربت على منشأة ناقصة: ينشئ الناقص وحده، لا يكرر عند الإعادة، ولا يمسّ
   * رصيداً. يُستدعى هنا عبر نفس الدالة التي يستدعيها السكربت (`createDefaultChart`)
   * فما يُختبر هو المنطق نفسه لا نسخة منه.
   */
  describe('السكربت الاسترجاعي على منشأة ناقصة', () => {
    let token: string;
    let prisma: import('@mad-app/db').PrismaClient;
    let companyId: string;
    const auth = (r: request.Test) => withToken(r, token);

    beforeAll(async () => {
      token = await bornViaSelfRegistration('backfill');
      companyId = (await auth(request(app.getHttpServer()).get('/auth/me')).expect(200)).body.companyId;
      const { PrismaClient } = await import('@mad-app/db');
      prisma = new PrismaClient();
    }, 90000);

    afterAll(async () => prisma?.$disconnect());

    it('ينشئ الناقص وحده، ولا يكرر عند إعادة التشغيل، ولا يغيّر رصيداً', async () => {
      const { createDefaultChart } = await import('../src/accounts/default-chart');
      const run = () =>
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
          return createDefaultChart(tx, companyId);
        });

      // نصنع النقص عمداً: نحذف ثلاثة حسابات بلا قيود من منشأة وليدة.
      const removed = ['5700', '4300', '1600'];
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
        await tx.account.deleteMany({ where: { companyId, code: { in: removed } } });
      });

      const snapshot = async () => {
        const rows = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
          return tx.account.findMany({ where: { companyId }, select: { code: true, name: true, balance: true }, orderBy: { code: 'asc' } });
        });
        return rows.map((r) => `${r.code}|${r.name}|${String(r.balance)}`);
      };

      const before = await snapshot();
      expect(before.length).toBe(DEFAULT_CHART.length - removed.length);

      // التشغيل الأول: ينشئ الثلاثة الناقصة بالضبط، لا أكثر.
      expect(await run()).toBe(removed.length);
      const after = await snapshot();
      expect(after.length).toBe(DEFAULT_CHART.length);

      // التشغيل الثاني: صفر — لا تكرار ولا خطأ فهرس فريد.
      expect(await run()).toBe(0);
      // ولا أثر على شيء: نفس الصفوف بنفس الأسماء وبنفس الأرصدة حرفياً.
      expect(await snapshot()).toEqual(after);
      // والصفوف التي كانت قائمة قبل التشغيل لم يتغير منها حرف.
      expect(after.filter((r) => !removed.includes(r.split('|')[0]))).toEqual(before);
    }, 90000);
  });
});
