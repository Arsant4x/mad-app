import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (15.2 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(50000);

/**
 * الحزمة ج (`ق-١٢٦١`) — **محرّكُ الأستاذ العام وكشف الحساب**: تقريرٌ واحد يقرأ `journal_lines` بمرشِّح
 * (حسابٌ أو بُعد) على مدىً وفرع، برصيدٍ افتتاحيٍّ قبل المدى ورصيدٍ جارٍ على كلِّ سطر ومصدرِ كلِّ قيد
 * مشتقّاً من علاقاته. صفوفُه من صنعه على منشأةٍ معزولة، وجوابُها محسوبٌ يداً (`§8.30`): قيدٌ يدويّ `200`
 * قبل المدى، فاتورةٌ `100 + 15%` ثم قبضٌ `50` داخله.
 */
describe('General ledger and party statement (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let other: IsolatedCompany;
  let cashId: string;
  let receivableId: string;
  let revenueId: string;
  let customerId: string;
  let bankAccountId: string;
  let invoiceNo: string;
  let paymentNo: string;
  let manualNo: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'ledger');
    other = await registerIsolatedCompany(app, 'ledger-other');
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    cashId = accounts.find((a) => a.code === '1000')!.id;
    receivableId = accounts.find((a) => a.code === '1200')!.id;
    revenueId = accounts.find((a) => a.code === '4100')!.id;

    // قيدٌ يدويّ قبل المدى — يصنع الافتتاحيّ.
    const manual = await auth(http().post('/journal'))
      .send({ date: '2026-05-01', memo: 'قيدٌ قبل المدى', lines: [{ accountId: cashId, debit: 200, credit: 0 }, { accountId: revenueId, debit: 0, credit: 200 }] })
      .expect(201);
    manualNo = manual.body.no;

    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل الكشف' }).expect(201)).body.id;
    const invoice = await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-06-10', dueDate: '2026-07-10', lines: [{ description: 'خدمة', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    invoiceNo = invoice.body.no;

    const bank = await auth(http().post('/banks')).send({ name: 'صندوق الكشف', openingBalance: 0, openingDate: '2026-01-01' }).expect(201);
    bankAccountId = bank.body.accountId;
    const payment = await auth(http().post('/payments'))
      .send({ customerId, date: '2026-06-20', amount: 50, method: 'CASH', bankId: bank.body.id, allocations: [{ invoiceId: invoice.body.id, amount: 50 }] })
      .expect(201);
    paymentNo = payment.body.no;
  }, 90000);

  afterAll(async () => {
    // إزالةُ منشأتين بحذفٍ متتالٍ — تُقاس لا تُترك للمهلة الافتراضية.
    const t0 = Date.now();
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    // eslint-disable-next-line no-console
    console.log(`removeIsolatedCompany ×2: ${Date.now() - t0} ms`);
    await app.close();
  }, 60000);

  it('[SPEC 10.16] ① a debit-normal account: opening before the range by aggregation, rows inside it with a running balance and the source document', async () => {
    const res = await auth(http().get(`/reports/ledger?accountId=${cashId}&from=2026-06-01&to=2026-06-30`)).expect(200);
    expect(res.body.account).toMatchObject({ id: cashId, code: '1000' });
    expect(res.body.side).toBe('debit');
    // الافتتاحيُّ من القيد اليدويّ قبل المدى — بالتجميع لا بالقراءة.
    expect(res.body.opening).toBe('200.00');
    // لا سطرَ في المدى على `1000`: القبضُ ذهب إلى حساب الصندوق المُنشأ لا إلى `1000`.
    expect(res.body.rows).toEqual([]);
    expect(res.body.closing).toBe('200.00');
    expect(res.body.truncated).toBe(false);

    const box = await auth(http().get(`/reports/ledger?accountId=${bankAccountId}&from=2026-06-01&to=2026-06-30`)).expect(200);
    expect(box.body.opening).toBe('0.00');
    expect(box.body.rows).toHaveLength(1);
    expect(box.body.rows[0]).toMatchObject({ date: '2026-06-20', debit: '50.00', credit: '0.00', balance: '50.00', source: { type: 'PAYMENT', no: paymentNo }, customerId });
    expect(box.body.closing).toBe('50.00');
  }, 30000);

  it('[SPEC 10.16] ② receivables: the invoice then the receipt, in date order, each with its document', async () => {
    const res = await auth(http().get(`/reports/ledger?accountId=${receivableId}`)).expect(200);
    expect(res.body.opening).toBe('0.00');
    expect(res.body.rows.map((r: { source: { type: string; no: string }; debit: string; credit: string; balance: string }) => [r.source.type, r.source.no, r.debit, r.credit, r.balance])).toEqual([
      ['INVOICE', invoiceNo, '115.00', '0.00', '115.00'],
      ['PAYMENT', paymentNo, '0.00', '50.00', '65.00'],
    ]);
    expect(res.body.totalDebit).toBe('115.00');
    expect(res.body.totalCredit).toBe('50.00');
    expect(res.body.closing).toBe('65.00');
    expect(res.body.count).toBe(2);
  }, 30000);

  it('[SPEC 10.16] ③ a credit-normal account runs on its own side, and a manual entry names itself as the source', async () => {
    const res = await auth(http().get(`/reports/ledger?accountId=${revenueId}`)).expect(200);
    expect(res.body.side).toBe('credit');
    expect(res.body.rows.map((r: { source: { type: string; no: string }; credit: string; balance: string }) => [r.source.type, r.source.no, r.credit, r.balance])).toEqual([
      ['MANUAL', manualNo, '200.00', '200.00'],
      ['INVOICE', invoiceNo, '100.00', '300.00'],
    ]);
    expect(res.body.closing).toBe('300.00');
  }, 30000);

  it('[SPEC 4.2] ④ the customer statement reads the party dimension across accounts and closes on the receivable the aging reports', async () => {
    const res = await auth(http().get(`/reports/statement?customerId=${customerId}`)).expect(200);
    expect(res.body.party).toMatchObject({ kind: 'customer', id: customerId, name: 'عميل الكشف' });
    expect(res.body.side).toBe('debit');
    expect(res.body.account).toMatchObject({ code: '1200' });
    expect(res.body.rows.map((r: { accountCode: string; debit: string; credit: string; balance: string }) => [r.accountCode, r.debit, r.credit, r.balance])).toEqual([
      ['1200', '115.00', '0.00', '115.00'],
      ['1200', '0.00', '50.00', '65.00'],
    ]);
    expect(res.body.closing).toBe('65.00');

    // المطابقةُ بالبناء: الأعمارُ تقرأ الذمّةَ نفسَها من التخصيصات — `115 − 50`.
    const aging = await auth(http().get(`/reports/receivables-aging?customerId=${customerId}&asOf=2026-06-30`)).expect(200);
    const row = aging.body.rows.find((r: { customerId: string }) => r.customerId === customerId);
    expect(row?.total).toBe(res.body.closing);
  }, 30000);

  it('[SPEC 10.16] ⑤ refuses a ledger without a filter and a statement with two parties — and the other company sees nothing', async () => {
    const noFilter = await auth(http().get('/reports/ledger')).expect(400);
    expect(noFilter.body.message).toContain('ميزان المراجعة');
    await auth(http().get(`/reports/statement?customerId=${customerId}&supplierId=x`)).expect(400);
    await request(app.getHttpServer()).get(`/reports/ledger?accountId=${cashId}`).set('Authorization', `Bearer ${other.token}`).expect(404);
    await request(app.getHttpServer()).get(`/reports/statement?customerId=${customerId}`).set('Authorization', `Bearer ${other.token}`).expect(404);
  }, 30000);

  it('[SPEC 10.16] ⑥ exports both as CSV with a BOM and the same columns', async () => {
    const ledger = await auth(http().get(`/reports/ledger/export?accountId=${receivableId}`)).expect(200);
    expect(ledger.headers['content-type']).toContain('text/csv');
    expect(ledger.text.charCodeAt(0)).toBe(0xfeff);
    expect(ledger.text).toContain('رقم القيد');
    expect(ledger.text).toContain(invoiceNo);
    const statement = await auth(http().get(`/reports/statement/export?customerId=${customerId}`)).expect(200);
    expect(statement.text).toContain(paymentNo);
  }, 30000);
});
