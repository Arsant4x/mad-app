import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * تقرير مصاريف التأسيس (gap-analysis §1).
 *
 * Grouped by line item and kept apart from the general expense report, because
 * setting a business up is a one-off investment — folding it into running costs
 * makes the first year's operating performance read far worse than it is.
 *
 * Assertions are **deltas** between two reads: the shared dev DB carries other
 * runs' establishment purchases, so absolute totals would be flaky.
 */
describe('Incorporation expenses report (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: string;
  const created: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ITEM = `رسوم ترخيص ${suffix}`;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  interface Report {
    total: number;
    invoiceCount: number;
    amortizedCount: number;
    items: { item: string; count: number; total: number; method: string }[];
  }

  const report = async (): Promise<Report> => (await auth(request(app.getHttpServer()).get('/purchases/incorporation-report')).expect(200)).body;

  async function buy(body: Record<string, unknown>) {
    const res = await auth(request(app.getHttpServer()).post('/purchases'))
      .send({ supplierId, date: '2025-05-01', ...body })
      .expect(201);
    created.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    const s = await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورد تأسيس ${suffix}` }).expect(201);
    supplierId = s.body.id;
  }, 60000);

  afterAll(async () => {
    for (const id of created) await auth(request(app.getHttpServer()).delete(`/purchases/${id}`));
    if (supplierId) await auth(request(app.getHttpServer()).delete(`/suppliers/${supplierId}`));
    await app.close();
  });

  it('counts only establishment purchases, grouped by line item', async () => {
    const before = await report();

    // Two on the same item, plus an unrelated category that must NOT appear.
    await buy({ subtotal: 1000, category: 'مصروفات تأسيس', incorpItem: ITEM });
    await buy({ subtotal: 500, category: 'مصروفات تأسيس', incorpItem: ITEM });
    await buy({ subtotal: 900, category: 'مواد خام' });

    const after = await report();
    expect(after.invoiceCount).toBe(before.invoiceCount + 2);

    const row = after.items.find((i) => i.item === ITEM);
    expect(row).toBeTruthy();
    expect(row!.count).toBe(2);
    // 1500 net + 15% VAT = 1725 total, in base currency.
    expect(row!.total).toBeCloseTo(1725, 2);
    expect(row!.method).toBe('دفعة واحدة');
  }, 60000);

  it('labels an amortized item with its period, and counts it', async () => {
    const before = await report();
    const amortItem = `تجهيزات ${suffix}`;
    await buy({ subtotal: 2400, category: 'مصروفات تأسيس', incorpItem: amortItem, amortize: true, amortizeMonths: 24 });

    const after = await report();
    expect(after.amortizedCount).toBe(before.amortizedCount + 1);
    expect(after.items.find((i) => i.item === amortItem)!.method).toBe('استهلاك (24 شهر)');
  }, 60000);

  it('still reports an establishment purchase that has no line item', async () => {
    const before = await report();
    await buy({ subtotal: 300, category: 'مصروفات تأسيس' });

    const after = await report();
    const unlabelled = after.items.find((i) => i.item === 'بدون بند محدَّد');
    expect(unlabelled).toBeTruthy();
    // Dropping unlabelled rows would make the report disagree with the ledger.
    expect(after.total).toBeCloseTo(before.total + 345, 2);
  }, 60000);
});
