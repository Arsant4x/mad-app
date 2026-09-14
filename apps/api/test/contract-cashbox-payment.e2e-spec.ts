import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * A cash rent receipt can name the branch cash box it landed in.
 *
 * A cash box here is just a Bank record (optionally pointed at a branch,
 * CLAUDE.md 6.8). Before this, only bank transfers moved a specific holder's
 * balance and cash receipts hit the general ledger alone — so a branch's cash
 * box never reflected the notes actually in its drawer. The behaviour worth
 * protecting: naming a box on a CASH payment moves that box's balance, exactly
 * like the bank path, while omitting it keeps the old ledger-only behaviour.
 */
describe('Cash rent payment into a branch cash box (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): الصندوقُ (بنكٌ) يُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  let contractId: string;
  let boxId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  async function boxBalance(): Promise<number> {
    const res = await auth(request(app.getHttpServer()).get('/banks')).expect(200);
    const box = (res.body as { id: string; balance: string }[]).find((b) => b.id === boxId);
    return Number(box?.balance ?? NaN);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'cashbox');
    token = company.token;

    const property = await auth(request(app.getHttpServer()).post('/properties')).send({ name: `عقار الصندوق ${suffix}`, ownership: 'owned' }).expect(201);
    const unit = await auth(request(app.getHttpServer()).post('/units'))
      .send({ propertyId: property.body.id, unitNo: `BOX-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ unitId: unit.body.id, tenant: `مستأجر ${suffix}`, value: 12000, cycle: 'monthly', start: '2025-01-01', end: '2025-12-31' })
      .expect(201);
    contractId = contract.body.id;

    const box = await auth(request(app.getHttpServer()).post('/banks'))
      .send({ name: `صندوق فرع اختبار ${suffix}`, openingBalance: 0, openingDate: '2025-01-01' })
      .expect(201);
    boxId = box.body.id;
  }, 60000);

  afterAll(async () => {
    await auth(request(app.getHttpServer()).post(`/contracts/${contractId}/cancel`)).send({
      cancelDate: '2025-12-31',
      cancelReason: 'تنظيف بيانات الاختبار',
      installmentDisposition: 'cancel',
    });
    // The box carries a rent transaction now, so deletion may be refused — best
    // effort only; the isolated company's hard delete takes the rest with it.
    await auth(request(app.getHttpServer()).delete(`/banks/${boxId}`));
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('[SPEC 7.3] a cash receipt naming a box raises that box balance', async () => {
    const before = await boxBalance();
    await auth(request(app.getHttpServer()).post(`/contracts/${contractId}/payments`))
      .send({ date: '2025-02-01', amount: 1000, method: 'CASH', bankId: boxId })
      .expect(201);
    expect(await boxBalance()).toBeCloseTo(before + 1000, 2);
  }, 40000);

  it('a cash receipt with no box leaves every box untouched', async () => {
    const before = await boxBalance();
    const res = await auth(request(app.getHttpServer()).post(`/contracts/${contractId}/payments`))
      .send({ date: '2025-03-01', amount: 500, method: 'CASH' })
      .expect(201);
    // Recorded as cash, holding nothing — the ledger still gets it, no box moves.
    expect(res.body.method).toBe('CASH');
    expect(res.body.bankId ?? null).toBeNull();
    expect(await boxBalance()).toBeCloseTo(before, 2);
  }, 40000);

  it('a cash receipt naming a box that does not exist is rejected', async () => {
    await auth(request(app.getHttpServer()).post(`/contracts/${contractId}/payments`))
      .send({ date: '2025-04-01', amount: 100, method: 'CASH', bankId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  }, 40000);
});
