import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (9.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

/**
 * Closing a period has to stop *every* way an entry can reach the ledger, not
 * just the manual Journal screen — so this exercises the invoice path too,
 * which posts automatically.
 */
describe('Fiscal year and period locking (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let customerId: string;
  const createdYearIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;

    // ②A1: عميلٌ يصنعه الملفّ لا «أوّلُ ما تجده».
    const customers = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${tokenA}`).send({ kind: 'NATURAL', name: `عميل الملف ${Date.now()}` }).expect(201);
    customerId = customers.body.id;
  }, 30000);

  afterAll(async () => {
    // Leaving a fiscal calendar behind would constrain every *other* suite's
    // postings by date, so this one must clean up after itself.
    for (const id of createdYearIds) {
      await request(app.getHttpServer()).delete(`/fiscal-years/${id}`).set('Authorization', `Bearer ${tokenA}`);
    }
    await app.close();
  });

  /** A far-future year, so its periods can't collide with dates other suites use. */
  const YEAR = 2091;

  async function createYear(token: string, year: number) {
    const res = await request(app.getHttpServer())
      .post('/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `سنة ${year}`, start: `${year}-01-01`, end: `${year}-12-31` })
      .expect(201);
    return res.body;
  }

  it('[SPEC 3.6] generates twelve monthly periods, all open, starting from the given date', async () => {
    const year = await createYear(tokenA, YEAR);
    createdYearIds.push(year.id);

    expect(year.periods).toHaveLength(12);
    expect(year.periods.every((p: { status: string }) => p.status === 'OPEN')).toBe(true);
    expect(year.periods[0]).toMatchObject({ month: 1, year: YEAR });
    expect(year.periods[11]).toMatchObject({ month: 12, year: YEAR });
  });

  it('[SPEC 3.6] starts the twelve periods at a non-January start date and rolls into the next year', async () => {
    const res = await request(app.getHttpServer())
      .post('/fiscal-years')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `سنة أبريل ${YEAR + 10}`, start: `${YEAR + 10}-04-01`, end: `${YEAR + 11}-03-31` })
      .expect(201);
    createdYearIds.push(res.body.id);

    expect(res.body.periods[0]).toMatchObject({ month: 4, year: YEAR + 10 });
    expect(res.body.periods[11]).toMatchObject({ month: 3, year: YEAR + 11 });
  });

  it('rejects a second fiscal year overlapping an existing one', async () => {
    await request(app.getHttpServer())
      .post('/fiscal-years')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'تداخل', start: `${YEAR}-06-01`, end: `${YEAR + 1}-05-31` })
      .expect(409);
  });

  it('rejects a fiscal year whose start is not before its end', async () => {
    await request(app.getHttpServer())
      .post('/fiscal-years')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'مقلوبة', start: `${YEAR + 20}-12-31`, end: `${YEAR + 20}-01-01` })
      .expect(400);
  });

  it('blocks a manual journal entry dated in a closed period, and allows it again once reopened', async () => {
    const years = await request(app.getHttpServer()).get('/fiscal-years').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const year = years.body.find((y: { id: string }) => createdYearIds.includes(y.id));
    const march = year.periods.find((p: { month: number; year: number }) => p.month === 3 && p.year === YEAR);

    const accounts = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const cash = accounts.body.find((a: { code: string }) => a.code === '1000');
    const revenue = accounts.body.find((a: { code: string }) => a.code === '4100');
    const entry = {
      date: `${YEAR}-03-15`,
      memo: 'قيد اختبار الإقفال',
      lines: [
        { accountId: cash.id, debit: 100, credit: 0 },
        { accountId: revenue.id, debit: 0, credit: 100 },
      ],
    };

    await request(app.getHttpServer()).patch(`/fiscal-years/periods/${march.id}/close`).set('Authorization', `Bearer ${tokenA}`).expect(200);

    const blocked = await request(app.getHttpServer()).post('/journal').set('Authorization', `Bearer ${tokenA}`).send(entry).expect(409);
    expect(blocked.body.message).toContain('مقفلة');

    await request(app.getHttpServer()).patch(`/fiscal-years/periods/${march.id}/reopen`).set('Authorization', `Bearer ${tokenA}`).expect(200);

    const posted = await request(app.getHttpServer()).post('/journal').set('Authorization', `Bearer ${tokenA}`).send(entry).expect(201);
    // التنظيفُ بالعكس لا بالحذف (ق-١٢٥٣/①): المرحَّلُ يُعكس — بتاريخ الأصل والفترةُ مفتوحة.
    await request(app.getHttpServer()).post(`/journal/${posted.body.id}/reverse`).set('Authorization', `Bearer ${tokenA}`).send({ date: entry.date }).expect(201);
  });

  it('blocks an invoice dated in a closed period too, since it posts automatically', async () => {
    const years = await request(app.getHttpServer()).get('/fiscal-years').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const year = years.body.find((y: { id: string }) => createdYearIds.includes(y.id));
    const may = year.periods.find((p: { month: number; year: number }) => p.month === 5 && p.year === YEAR);

    await request(app.getHttpServer()).patch(`/fiscal-years/periods/${may.id}/close`).set('Authorization', `Bearer ${tokenA}`).expect(200);

    await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerId,
        issueDate: `${YEAR}-05-10`,
        dueDate: `${YEAR}-06-10`,
        lines: [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }],
      })
      .expect(409);

    await request(app.getHttpServer()).patch(`/fiscal-years/periods/${may.id}/reopen`).set('Authorization', `Bearer ${tokenA}`).expect(200);
  });

  it("does not let one company's fiscal calendar constrain or be seen by another", async () => {
    const listB = await request(app.getHttpServer()).get('/fiscal-years').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(listB.body.some((y: { id: string }) => createdYearIds.includes(y.id))).toBe(false);

    // Company B has no calendar of its own, so it stays unrestricted — the
    // "no periods defined means no restriction" rule, per company.
    const accountsB = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenB}`).expect(200);
    const cashB = accountsB.body.find((a: { code: string }) => a.code === '1000');
    const revenueB = accountsB.body.find((a: { code: string }) => a.code === '4100');

    const posted = await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        date: `${YEAR}-03-15`,
        memo: 'قيد شركة ب في فترة مقفلة لدى شركة أ',
        lines: [
          { accountId: cashB.id, debit: 50, credit: 0 },
          { accountId: revenueB.id, debit: 0, credit: 50 },
        ],
      })
      .expect(201);

    // التنظيفُ بالعكس لا بالحذف (ق-١٢٥٣/①) — وشركةُ ب بلا تقويمٍ فلا قفلَ على أيّ تاريخ.
    await request(app.getHttpServer()).post(`/journal/${posted.body.id}/reverse`).set('Authorization', `Bearer ${tokenB}`).send({ date: `${YEAR}-03-15` }).expect(201);
  });
});
