import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (30.1 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(95000);

/**
 * Two small purchase fields with real accounting meaning:
 *
 * - `excludeFromVat` — a purchase whose input VAT can't be reclaimed (no valid
 *   tax invoice). It must drop out of the VAT declaration entirely, so it never
 *   reduces the net VAT owed.
 * - `amortize` — establishment-expense metadata, only valid for the
 *   'مصروفات تأسيس' category.
 *
 * The VAT-declaration assertions are written as **deltas** between two reads,
 * never absolutes: the shared dev DB carries other suites' purchases in every
 * quarter, so an absolute total would be flaky.
 */
describe('Purchase VAT exclusion + amortization (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: string;
  const created: string[] = [];

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const YEAR = 2089;
  const QUARTER = 1;
  const DATE = '2089-02-15';

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  function vatDeclaration() {
    return auth(request(app.getHttpServer()).get(`/obligations/vat-declaration?year=${YEAR}&quarter=${QUARTER}`)).expect(200);
  }

  async function createPurchase(body: Record<string, unknown>, expectStatus = 201) {
    const res = await auth(request(app.getHttpServer()).post('/purchases')).send({ supplierId, date: DATE, ...body }).expect(expectStatus);
    if (res.body?.id) created.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;

    const supplier = await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورد ض ${suffix}` }).expect(201);
    supplierId = supplier.body.id;
  }, 60000);

  afterAll(async () => {
    for (const id of created) await auth(request(app.getHttpServer()).delete(`/purchases/${id}`));
    if (supplierId) await auth(request(app.getHttpServer()).delete(`/suppliers/${supplierId}`));
    await app.close();
  });

  it('[SPEC 5.4] an excluded purchase never reduces the VAT owed, and is reported apart', async () => {
    // ② المالُ نصّاً (`ق-١٢٣٥`): الحقولُ تصل نصّاً بخانتين وتُقرأ رقماً قبل الحساب.
    const money = (d: Record<string, unknown>, key: string) => Number(d[key]);
    const before = (await vatDeclaration()).body;

    // A normal taxable purchase does reduce net VAT (reclaimable input VAT).
    await createPurchase({ subtotal: 1000, category: 'مواد خام' });
    const afterTaxable = (await vatDeclaration()).body;
    expect(money(afterTaxable, 'purchasesStandardVat')).toBeCloseTo(money(before, 'purchasesStandardVat') + 150, 2);
    expect(money(afterTaxable, 'netVat')).toBeCloseTo(money(before, 'netVat') - 150, 2);

    // An excluded purchase (VAT charged, no valid tax invoice) must NOT.
    await createPurchase({ subtotal: 2000, category: 'مواد خام', excludeFromVat: true });
    const afterExcluded = (await vatDeclaration()).body;
    expect(money(afterExcluded, 'purchasesStandardVat')).toBeCloseTo(money(afterTaxable, 'purchasesStandardVat'), 2);
    expect(money(afterExcluded, 'netVat')).toBeCloseTo(money(afterTaxable, 'netVat'), 2);
    // Reported separately for transparency.
    expect(money(afterExcluded, 'purchasesExcluded')).toBeCloseTo(money(afterTaxable, 'purchasesExcluded') + 2000, 2);
    expect(afterExcluded.excludedCount).toBe((afterTaxable.excludedCount ?? 0) + 1);
  }, 60000);

  it('[SPEC 5.4] stores excludeFromVat on the purchase itself', async () => {
    const res = await createPurchase({ subtotal: 500, category: 'مصروفات أخرى', excludeFromVat: true });
    expect(res.body.excludeFromVat).toBe(true);
    // VAT is still computed and (per the mockup) still posts to the ledger — the
    // flag only governs the declaration, not the tax figure.
    expect(Number(res.body.taxAmount)).toBeCloseTo(75, 2);
  }, 40000);

  it('[SPEC 5.5] amortization is establishment-only, and needs a month count', async () => {
    // Wrong category → rejected.
    await createPurchase({ subtotal: 900, category: 'مواد خام', amortize: true, amortizeMonths: 12 }, 400);
    // Right category, no months → rejected.
    await createPurchase({ subtotal: 900, category: 'مصروفات تأسيس', amortize: true }, 400);
    // Right category + months → stored.
    const ok = await createPurchase({ subtotal: 900, category: 'مصروفات تأسيس', amortize: true, amortizeMonths: 24 });
    expect(ok.body.amortize).toBe(true);
    expect(ok.body.amortizeMonths).toBe(24);
  }, 40000);
});
