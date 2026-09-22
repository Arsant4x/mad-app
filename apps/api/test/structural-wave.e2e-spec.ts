import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';

/**
 * The structural wave (activities + branches, multi-currency, fiscal year) has
 * no HTTP surface yet — services and screens come in later stages. What must
 * be locked in *now* is the part that's expensive to get wrong later: that the
 * new tables are genuinely tenant-isolated, and that every financial table
 * still computes its base-currency figures correctly.
 */
describe('Structural wave — isolation and base amounts (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let tokenA: string;
  let companyAId: string;
  let companyBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    tenantPrisma = app.get(TenantPrismaService);

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    companyAId = loginA.body.user.companyId;
    companyBId = loginB.body.user.companyId;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('seeds each company its own default activity and SAR base currency', async () => {
    for (const companyId of [companyAId, companyBId]) {
      const { activities, currencies } = await tenantPrisma.runInTenantContext(companyId, async (tx) => ({
        activities: await tx.businessActivity.findMany(),
        currencies: await tx.currency.findMany(),
      }));

      // Asserting the seeded defaults *exist* rather than an exact row count:
      // other suites legitimately add activities/currencies to these demo
      // companies, and a count assertion would make this test depend on them.
      expect(activities.some((a) => a.name === 'النشاط الرئيسي')).toBe(true);

      const base = currencies.find((c) => c.isBase);
      expect(base).toBeDefined();
      expect(base!.code).toBe('SAR');
      expect(Number(base!.rate)).toBe(1);
    }
  });

  it("does not leak one company's activities, branches, currencies or fiscal periods to another", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Currency.code is unique per company, so a fixed 'USD' would pass once
    // and then collide on every later run against the same dev database —
    // the exact flaky-test shape this suite already learned to avoid.
    const currencyCode = `T${suffix.slice(-2)}`;

    const created = await tenantPrisma.runInTenantContext(companyAId, async (tx) => {
      const activity = await tx.businessActivity.create({ data: { name: `نشاط ${suffix}`, activityType: 'مطاعم' } as never });
      const branch = await tx.branch.create({ data: { name: `فرع ${suffix}`, activityId: activity.id } as never });
      const currency = await tx.currency.create({ data: { code: currencyCode, name: 'عملة اختبار', rate: 3.75 } as never });
      const year = await tx.fiscalYear.create({
        data: { name: `سنة ${suffix}`, start: new Date('2026-01-01'), end: new Date('2026-12-31') } as never,
      });
      return { activity, branch, currency, year };
    });

    // Company B must not see any of it, through the same tenant-scoped path.
    const seenByB = await tenantPrisma.runInTenantContext(companyBId, async (tx) => ({
      activities: await tx.businessActivity.findMany({ where: { id: created.activity.id } }),
      branches: await tx.branch.findMany({ where: { id: created.branch.id } }),
      currencies: await tx.currency.findMany({ where: { id: created.currency.id } }),
      years: await tx.fiscalYear.findMany({ where: { id: created.year.id } }),
    }));

    expect(seenByB.activities).toHaveLength(0);
    expect(seenByB.branches).toHaveLength(0);
    expect(seenByB.currencies).toHaveLength(0);
    expect(seenByB.years).toHaveLength(0);

    // ...and company A still does, so the emptiness above is isolation, not a
    // failed create.
    const seenByA = await tenantPrisma.runInTenantContext(companyAId, (tx) => tx.branch.findMany({ where: { id: created.branch.id } }));
    expect(seenByA).toHaveLength(1);

    // Clean up so repeated runs don't accumulate rows in the dev database.
    await tenantPrisma.runInTenantContext(companyAId, async (tx) => {
      await tx.branch.delete({ where: { id: created.branch.id } });
      await tx.businessActivity.delete({ where: { id: created.activity.id } });
      await tx.currency.delete({ where: { id: created.currency.id } });
      await tx.fiscalYear.delete({ where: { id: created.year.id } });
    });
  });

  it('stores base amounts equal to the original when the invoice is in the base currency', async () => {
    // ②A1: عميلٌ يصنعه الملفّ لا «أوّلُ ما تجده».
    const customers = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${tokenA}`).send({ kind: 'NATURAL', name: `عميل الملف ${Date.now()}` }).expect(201);

    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerId: customers.body.id,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        lines: [{ description: 'بند بالريال', quantity: 2, unitPrice: 100, taxRate: 15 }],
      })
      .expect(201);

    // Read through the tenant-scoped client: PrismaService is the raw client and
    // RLS hides every row from it unless app.company_id is set.
    const row = await tenantPrisma.runInTenantContext(companyAId, (tx) => tx.invoice.findUniqueOrThrow({ where: { id: res.body.id } }));
    expect(row.currency).toBe('SAR');
    expect(Number(row.exchangeRate)).toBe(1);
    expect(Number(row.baseSubtotal)).toBeCloseTo(Number(row.subtotal), 2);
    expect(Number(row.baseTotal)).toBeCloseTo(Number(row.total), 2);

    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(tenantPrisma, companyAId, [res.body.id]);
  });

  it('converts to the base currency when the invoice is issued in a foreign one', async () => {
    // ②A1: عميلٌ يصنعه الملفّ لا «أوّلُ ما تجده».
    const customers = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${tokenA}`).send({ kind: 'NATURAL', name: `عميل الملف ${Date.now()}` }).expect(201);

    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerId: customers.body.id,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        exchangeRate: 3.75,
        lines: [{ description: 'بند بالدولار', quantity: 1, unitPrice: 100, taxRate: 15 }],
      })
      .expect(201);

    // Read through the tenant-scoped client: PrismaService is the raw client and
    // RLS hides every row from it unless app.company_id is set.
    const row = await tenantPrisma.runInTenantContext(companyAId, (tx) => tx.invoice.findUniqueOrThrow({ where: { id: res.body.id } }));
    expect(row.currency).toBe('USD');
    // 100 USD + 15% = 115 USD -> 431.25 SAR at 3.75
    expect(Number(row.total)).toBeCloseTo(115, 2);
    expect(Number(row.baseTotal)).toBeCloseTo(431.25, 2);
    expect(Number(row.baseSubtotal)).toBeCloseTo(375, 2);

    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(tenantPrisma, companyAId, [res.body.id]);
  });

  it('rejects a malformed currency code or a non-positive rate', async () => {
    // ②A1: عميلٌ يصنعه الملفّ لا «أوّلُ ما تجده».
    const customers = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${tokenA}`).send({ kind: 'NATURAL', name: `عميل الملف ${Date.now()}` }).expect(201);
    const base = {
      customerId: customers.body.id,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'x', quantity: 1, unitPrice: 10, taxRate: 15 }],
    };

    await request(app.getHttpServer()).post('/invoices').set('Authorization', `Bearer ${tokenA}`).send({ ...base, currency: 'DOLLAR' }).expect(400);
    await request(app.getHttpServer()).post('/invoices').set('Authorization', `Bearer ${tokenA}`).send({ ...base, exchangeRate: 0 }).expect(400);
  });
});
