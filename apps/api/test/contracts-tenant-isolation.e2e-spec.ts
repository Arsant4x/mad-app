import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { round2 } from '../src/common/money/rounding';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (27.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(85000);

describe('Properties/Units/Contracts (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  // منشأتان معزولتان (ق-٧٢٢): العقودُ والبنكُ تُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأتَي العرض.
  let companyA: IsolatedCompany;
  let companyB: IsolatedCompany;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    companyA = await registerIsolatedCompany(app, 'contracts-a');
    companyB = await registerIsolatedCompany(app, 'contracts-b');
    tokenA = companyA.token;
    tokenB = companyB.token;
  }, 30000);

  afterAll(async () => {
    await removeIsolatedCompany(app, companyA);
    await removeIsolatedCompany(app, companyB);
    await app.close();
  }, 60000);

  async function setupPropertyAndUnit(token: string, opts: { activityType?: string; unitType?: string } = {}) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار اختبار ${suffix}`, ownership: 'owned', ...(opts.activityType ? { activityType: opts.activityType } : {}) })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `U-${suffix}`, type: opts.unitType ?? 'سكني', rentMonthly: 1000 })
      .expect(201);
    return { property: property.body, unit: unit.body };
  }

  // ⚠️ المهلُ صريحة: إنشاءُ العقد يستحقّ أقساطَه التي حلّت في المعاملة نفسِها (ق-٩١٧) — قيدٌ لكلِّ قسط،
  // فعقدُ 2026 وقد مضى منه تسعةُ أشهرٍ يتجاوز الخمسَ ثوانٍ الافتراضية على قاعدةٍ باردة.
  it('[SPEC 16.2 16.6] creates a contract, generates an even installment schedule, and rejects an overlapping contract on the same unit', async () => {
    const { unit } = await setupPropertyAndUnit(tokenA);

    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: await createTenantCustomer(app, tokenA, 'مستأجر اختبار'), value: 12000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31', deposit: 1000 })
      .expect(201);
    expect(contract.body.installments).toHaveLength(12);
    expect(contract.body.installments.every((i: { amount: string }) => Number(i.amount) === 1000)).toBe(true);
    expect(contract.body.customerId).not.toBeNull();

    await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: await createTenantCustomer(app, tokenA, 'مستأجر آخر'), value: 6000, cycle: 'monthly', start: '2026-06-01', end: '2026-08-31' })
      .expect(409);
  }, 60000);

  // كان هنا «قفلُ نشاط العقار»: يُرفض عقدٌ على وحدةٍ كلمةُ نوعها لا تطابق نشاطَ العقار — بخريطة كلماتٍ
  // خمس تتخطّى ما لا تعرفه. حُذفت بحكم المالك (ق-٨٩٨): التصنيفُ يُعلَن على العقد ولا يُستنبَط من كلمة —
  // فوحدةٌ اسمُ نوعها «محل» في عقارٍ سكنيّ تُعقَد بتصنيفها المعلَن، والكلمةُ لا تحكم.
  it('a contract is classified by its own declaration — the unit-type word neither locks nor classifies it', async () => {
    const { unit } = await setupPropertyAndUnit(tokenA, { activityType: 'residential', unitType: 'محل' });

    const created = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: await createTenantCustomer(app, tokenA, 'محل تجاري'), value: 3000, cycle: 'monthly', start: '2026-01-01', end: '2026-06-30' })
      .expect(201);
    expect(created.body.classification).toBe('COMMERCIAL');
  }, 60000);

  it('records a cash rent payment (posts to the ledger, marks the installment paid) and a bank payment (updates the bank balance and creates a matched BankTransaction)', async () => {
    const { unit } = await setupPropertyAndUnit(tokenA);
    const readBalances = async () => {
      const accounts = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
      const of = (code: string) => Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
      return { cash: of('1000'), receivable: of('1200'), revenue: of('4200'), deferred: of('2400') };
    };
    const beforeContract = await readBalances();
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: await createTenantCustomer(app, tokenA, 'دافع الإيجار'), value: 3000, cycle: 'monthly', start: '2026-01-01', end: '2026-03-31' })
      .expect(201);
    const installmentId = contract.body.installments[0].id;

    // ⚖️ **الاستحقاقُ عند الإنشاء لما حلّ** (ق-٩١٧): ثلاثةُ أقساطٍ حلّت ⇒ ذمّةٌ على المستأجر
    // بالثلاثة آلاف، وصافيها بين `4200` (ما مضى من كلِّ فترةٍ حتى نقطتها) و`2400` (الباقي)
    // — والقبضُ بعدها يسدّد الذمّةَ ولا يمسّ الإيراد.
    const accrued = await readBalances();
    expect(accrued.receivable - beforeContract.receivable).toBeCloseTo(3000, 2);
    expect(accrued.revenue + accrued.deferred - (beforeContract.revenue + beforeContract.deferred)).toBeCloseTo(3000, 2);

    const cashPayment = await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ installmentId, date: '2026-01-01', amount: 1000, method: 'CASH' })
      .expect(201);
    expect(cashPayment.body.journalEntryId).not.toBeNull();
    expect(cashPayment.body.installment.status).toBe('PAID');

    const paid = await readBalances();
    expect(paid.cash - accrued.cash).toBeCloseTo(1000);
    expect(paid.receivable - accrued.receivable).toBeCloseTo(-1000, 2);
    // ولا ريالَ من القبض يذهب إلى الإيراد أو الالتزام — فقد استُحقّا قبله.
    expect(paid.revenue + paid.deferred - (accrued.revenue + accrued.deferred)).toBeCloseTo(0, 2);

    // Create the bank this test needs instead of assuming one already exists:
    // seed.ts creates no banks at all, and banks-tenant-isolation deletes the
    // one it makes, so `GET /banks` is legitimately empty on a clean DB.
    const bank = (
      await request(app.getHttpServer())
        .post('/banks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: `بنك اختبار الإيجار ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'BANK_ACCOUNT', openingBalance: 5000, openingDate: '2026-01-01' })
        .expect(201)
    ).body;
    const bankBalanceBefore = Number(bank.balance);

    const bankPayment = await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date: '2026-02-01', amount: 1000, discount: 100, method: 'BANK', bankId: bank.id })
      .expect(201);
    expect(Number(bankPayment.body.netAmount)).toBe(900);

    const banksAfter = await request(app.getHttpServer()).get('/banks').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(Number(banksAfter.body.find((b: { id: string }) => b.id === bank.id).balance) - bankBalanceBefore).toBeCloseTo(900);

    // The transactions list is paginated — the payment's transaction is found
    // through the server-side search on the bank's unique per-run name, not by
    // assuming it lands on page 1 of the accumulated demo data.
    const transactions = await request(app.getHttpServer())
      .get('/transactions')
      .query({ search: bank.name })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const tx = transactions.body.items.find((t: { amount: string }) => Number(t.amount) === 900);
    expect(tx).toBeDefined();
    expect(tx.matched).toBe(true);
  }, 60000);

  it('[SPEC 16.2 16.5] cancelling a contract shrinks its end date and cancels future unpaid installments while leaving already-due ones alone', async () => {
    const { unit } = await setupPropertyAndUnit(tokenA);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: await createTenantCustomer(app, tokenA, 'عقد للإلغاء'), value: 3000, cycle: 'monthly', start: '2030-01-01', end: '2030-03-31' })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ cancelDate: '2030-01-15', cancelReason: 'اختبار', installmentDisposition: 'cancel' })
      .expect(201);

    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.end.slice(0, 10)).toBe('2030-01-15');
    const byDueDate = (d: string) => cancelled.body.installments.find((i: { dueDate: string }) => i.dueDate.slice(0, 10) === d);
    expect(byDueDate('2030-01-01').status).toBe('DUE');
    expect(byDueDate('2030-02-01').status).toBe('CANCELLED');
    expect(byDueDate('2030-03-01').status).toBe('CANCELLED');
  }, 60000);

  it("keeps company B from seeing, fetching, or referencing company A's units/contracts", async () => {
    const { unit } = await setupPropertyAndUnit(tokenA);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: await createTenantCustomer(app, tokenA, 'عزل بين الشركات'), value: 1200, cycle: 'monthly', start: '2031-01-01', end: '2031-12-31' })
      .expect(201);

    // Searched by the exact tenant name rather than scanning page 1 — with the
    // list paginated, "not on the first page" would be a much weaker check
    // than "the search finds nothing across the whole tenant".
    const listB = await request(app.getHttpServer())
      .get('/contracts')
      .query({ search: 'عزل بين الشركات' })
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(listB.body.total).toBe(0);
    expect(listB.body.items.some((c: { id: string }) => c.id === contract.body.id)).toBe(false);

    await request(app.getHttpServer()).get(`/contracts/${contract.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: await createTenantCustomer(app, tokenA, 'محاولة عبور الشركات'), value: 500, cycle: 'monthly', start: '2032-01-01', end: '2032-06-30' })
      .expect(404);
  }, 60000);
});
