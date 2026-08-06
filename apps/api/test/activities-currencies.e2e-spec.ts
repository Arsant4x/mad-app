import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * The last of the structural wave: the activity and currency registries a
 * merchant maintains, and the realized FX gain/loss that multi-currency
 * settlement produces.
 *
 * The FX case is the one that matters most — it is the only place where the
 * ledger has to disagree with the document on purpose, crediting revenue at
 * the rate the contract was priced at while debiting the cash that actually
 * arrived.
 */
describe('Activities, currencies and FX difference (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let employeeToken: string;
  const createdActivityIds: string[] = [];
  const createdCurrencyIds: string[] = [];
  const createdCompanyUserIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  /** Currency.code is unique per company, so a literal 'USD' would pass on a
   * clean database and collide on every later run against the dev one. Letters
   * only — the code is validated as ISO 4217, which has no digits. Used by the
   * CRUD cases, which delete what they create. */
  const randomLetters = (n: number) =>
    Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  const testCode = `X${randomLetters(2)}`;

  /**
   * The FX cases need a currency that *survives* the run: their contracts and
   * payments reference it forever (a contract cannot be deleted), so deleting
   * it would leave documents pointing at a currency the company no longer
   * defines — which is exactly what CurrenciesService refuses to allow.
   *
   * XTS is ISO 4217's own reserved code for testing, and it is created once and
   * reused rather than generated per run, so repeated runs stop piling up
   * undeletable currencies.
   */
  const FX_CURRENCY = 'XTS';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;

    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${token}`).expect(200);
    const templateId = templates.body.find((t: { isSystem: boolean }) => !t.isSystem).id;
    const employee = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'موظف اختبار العملات', username: `fx-viewer-${suffix}`, password: 'ViewerPass123!', permissionTemplateId: templateId })
      .expect(201);
    createdCompanyUserIds.push(employee.body.id);

    const employeeLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: `fx-viewer-${suffix}`, password: 'ViewerPass123!' })
      .expect(200);
    employeeToken = employeeLogin.body.accessToken;

    // Find-or-create, never delete: see the comment on FX_CURRENCY.
    const existing = await request(app.getHttpServer()).get('/currencies').set('Authorization', `Bearer ${token}`).expect(200);
    if (!existing.body.some((c: { code: string }) => c.code === FX_CURRENCY)) {
      await request(app.getHttpServer())
        .post('/currencies')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: FX_CURRENCY, name: 'عملة اختبار فروق الصرف', rate: 3.75 })
        .expect(201);
    }
  }, 60000);

  afterAll(async () => {
    for (const id of createdCurrencyIds) {
      await request(app.getHttpServer()).delete(`/currencies/${id}`).set('Authorization', `Bearer ${token}`);
    }
    for (const id of createdActivityIds) {
      await request(app.getHttpServer()).delete(`/activities/${id}`).set('Authorization', `Bearer ${token}`);
    }
    for (const id of createdCompanyUserIds) {
      await request(app.getHttpServer()).delete(`/company-users/${id}`).set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  describe('activities', () => {
    it('creates, renames and reports how many branches and products use an activity', async () => {
      const created = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `صيدلية ${suffix}`, activityType: 'صيدلية' })
        .expect(201);
      createdActivityIds.push(created.body.id);

      const renamed = await request(app.getHttpServer())
        .patch(`/activities/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `صيدلية مركزية ${suffix}` })
        .expect(200);
      expect(renamed.body.name).toBe(`صيدلية مركزية ${suffix}`);

      const list = await request(app.getHttpServer()).get('/activities').set('Authorization', `Bearer ${token}`).expect(200);
      const row = list.body.find((a: { id: string }) => a.id === created.body.id);
      // The counts are what let the screen explain the delete guard *before*
      // the owner presses delete.
      expect(row.branchCount).toBe(0);
      expect(row.productCount).toBe(0);
    });

    it('rejects a duplicate activity name', async () => {
      const name = `مطاعم ${suffix}`;
      const first = await request(app.getHttpServer()).post('/activities').set('Authorization', `Bearer ${token}`).send({ name }).expect(201);
      createdActivityIds.push(first.body.id);

      await request(app.getHttpServer()).post('/activities').set('Authorization', `Bearer ${token}`).send({ name }).expect(409);
    });

    it('refuses to delete an activity that a branch still points at', async () => {
      const activity = await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `نشاط مرتبط ${suffix}` })
        .expect(201);
      createdActivityIds.push(activity.body.id);

      const branch = await request(app.getHttpServer())
        .post('/branches')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `فرع النشاط ${suffix}`, activityId: activity.body.id })
        .expect(201);

      // The FK is ON DELETE SET NULL, so without this guard the branch would
      // quietly lose its activity rather than the delete failing.
      await request(app.getHttpServer()).delete(`/activities/${activity.body.id}`).set('Authorization', `Bearer ${token}`).expect(409);

      await request(app.getHttpServer()).delete(`/branches/${branch.body.id}`).set('Authorization', `Bearer ${token}`).expect(204);
    });

    it('lets an employee read activities but not change them', async () => {
      await request(app.getHttpServer()).get('/activities').set('Authorization', `Bearer ${employeeToken}`).expect(200);
      await request(app.getHttpServer())
        .post('/activities')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: `نشاط موظف ${suffix}` })
        .expect(403);
    });
  });

  describe('currencies', () => {
    it('lists the seeded SAR base currency first', async () => {
      const res = await request(app.getHttpServer()).get('/currencies').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body[0].isBase).toBe(true);
      expect(res.body[0].code).toBe('SAR');
    });

    it('adds a currency, upper-cases its code, and updates its rate', async () => {
      const created = await request(app.getHttpServer())
        .post('/currencies')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: testCode.toLowerCase(), name: 'عملة اختبار', symbol: '$', rate: 3.75 })
        .expect(201);
      createdCurrencyIds.push(created.body.id);

      expect(created.body.code).toBe(testCode.toUpperCase());
      expect(created.body.isBase).toBe(false);

      const updated = await request(app.getHttpServer())
        .patch(`/currencies/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rate: 3.8 })
        .expect(200);
      expect(Number(updated.body.rate)).toBe(3.8);
    });

    it('rejects a duplicate code and a malformed one', async () => {
      await request(app.getHttpServer())
        .post('/currencies')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: testCode, name: 'مكرر' })
        .expect(409);

      await request(app.getHttpServer())
        .post('/currencies')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'DOLLAR', name: 'طويلة' })
        .expect(400);
    });

    it('refuses to reprice or delete the base currency', async () => {
      const list = await request(app.getHttpServer()).get('/currencies').set('Authorization', `Bearer ${token}`).expect(200);
      const base = list.body.find((c: { isBase: boolean }) => c.isBase);

      // The base is the unit everything else is measured in — a rate of 1.05
      // SAR per SAR would silently reprice the whole ledger.
      await request(app.getHttpServer()).patch(`/currencies/${base.id}`).set('Authorization', `Bearer ${token}`).send({ rate: 1.05 }).expect(400);
      await request(app.getHttpServer()).delete(`/currencies/${base.id}`).set('Authorization', `Bearer ${token}`).expect(409);
    });

    it('refuses to delete a currency that documents still reference', async () => {
      const currency = await request(app.getHttpServer())
        .post('/currencies')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `Y${randomLetters(2)}`, name: 'عملة مستخدمة', rate: 2 })
        .expect(201);
      createdCurrencyIds.push(currency.body.id);

      const customers = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${token}`).expect(200);
      const invoice = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId: customers.body[0].id,
          issueDate: '2026-06-01',
          dueDate: '2026-06-30',
          currency: currency.body.code,
          exchangeRate: 2,
          lines: [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }],
        })
        .expect(201);

      // Documents store the code, not a foreign key — nothing in the database
      // would stop this on its own.
      await request(app.getHttpServer()).delete(`/currencies/${currency.body.id}`).set('Authorization', `Bearer ${token}`).expect(409);

      await request(app.getHttpServer()).delete(`/invoices/${invoice.body.id}`).set('Authorization', `Bearer ${token}`).expect(204);
    }, 20000);

    it('records one rate per day and overwrites a re-recorded day', async () => {
      const first = await request(app.getHttpServer())
        .post('/currencies/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({ fromCode: testCode, toCode: 'SAR', rate: 3.75, date: '2026-06-01' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/currencies/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({ fromCode: testCode, toCode: 'SAR', rate: 3.8, date: '2026-06-01' })
        .expect(201);

      // A day has one official rate — the unique constraint says so, and a
      // second row would make "the rate on that date" ambiguous.
      expect(second.body.id).toBe(first.body.id);
      expect(Number(second.body.rate)).toBe(3.8);

      const rates = await request(app.getHttpServer())
        .get(`/currencies/rates?fromCode=${testCode}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(rates.body.filter((r: { date: string }) => r.date.startsWith('2026-06-01'))).toHaveLength(1);
    });

    it('rejects a rate between a currency and itself', async () => {
      await request(app.getHttpServer())
        .post('/currencies/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({ fromCode: 'SAR', toCode: 'SAR', rate: 1, date: '2026-06-01' })
        .expect(400);
    });
  });

  describe('realized FX difference', () => {
    /**
     * One contract for all three cases, each settling a different installment.
     *
     * The earlier version built a property, unit and contract per test. None of
     * those can be removed afterwards — a contract has no delete endpoint, and
     * a unit with contracts refuses to be deleted — so every run left three
     * more of each behind in the dev database permanently. One fixture and
     * three installments is the same coverage at a third of the residue.
     */
    let contractId: string;
    let installmentIds: string[] = [];

    beforeAll(async () => {
      const property = await request(app.getHttpServer())
        .post('/properties')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `عقار الصرف ${suffix}`, ownership: 'owned' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post('/units')
        .set('Authorization', `Bearer ${token}`)
        .send({ propertyId: property.body.id, unitNo: `FX-${suffix}`, type: 'سكني', rentMonthly: 1000 })
        .expect(201);

      const contract = await request(app.getHttpServer())
        .post('/contracts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          unitId: unit.body.id,
          tenant: 'مستأجر بالعملة الأجنبية',
          value: 12000,
          cycle: 'monthly',
          start: '2026-01-01',
          end: '2026-12-31',
          currency: FX_CURRENCY,
          exchangeRate: 3.75,
        })
        .expect(201);

      contractId = contract.body.id;
      installmentIds = contract.body.installments.map((i: { id: string }) => i.id);
    }, 40000);

    afterAll(async () => {
      // Frees the unit and cancels the ten installments left unpaid. The
      // contract itself stays — cancelling is the only close-out the domain
      // offers, and a rent payment has already posted to the ledger.
      await request(app.getHttpServer())
        .post(`/contracts/${contractId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancelDate: '2026-01-01' });
    });

    async function settle(installmentIndex: number, exchangeRate?: number) {
      return request(app.getHttpServer())
        .post(`/contracts/${contractId}/payments`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          installmentId: installmentIds[installmentIndex],
          date: '2026-01-05',
          amount: 1000,
          method: 'CASH',
          ...(exchangeRate ? { exchangeRate } : {}),
        })
        .expect(201);
    }

    async function accountBalance(code: string) {
      const accounts = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
      return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
    }

    it('posts the gap between the contract rate and the settlement rate to 5600', async () => {
      const [cashBefore, revenueBefore, fxBefore] = await Promise.all([accountBalance('1000'), accountBalance('4200'), accountBalance('5600')]);

      // 1000 units priced at 3.75 but settled at 3.80: 3800 arrives, 3750 was
      // earned, and the extra 50 is a currency gain — not rental revenue.
      const payment = await settle(0, 3.8);
      expect(payment.body.journalEntryId).not.toBeNull();

      expect((await accountBalance('1000')) - cashBefore).toBeCloseTo(3800);
      expect((await accountBalance('4200')) - revenueBefore).toBeCloseTo(3750);
      // Credit against an expense account: the balance moves by -50.
      expect((await accountBalance('5600')) - fxBefore).toBeCloseTo(-50);
    }, 40000);

    it('posts a loss to 5600 when the currency moved the other way', async () => {
      const fxBefore = await accountBalance('5600');

      await settle(1, 3.7);

      expect((await accountBalance('5600')) - fxBefore).toBeCloseTo(50);
    }, 40000);

    it('leaves 5600 untouched when the rate has not moved', async () => {
      const fxBefore = await accountBalance('5600');

      // No rate on the payment — it inherits the contract's, so there is
      // nothing to recognize. A single-currency company must never see an FX
      // line at all.
      await settle(2);

      expect(await accountBalance('5600')).toBeCloseTo(fxBefore);
    }, 40000);
  });
});
