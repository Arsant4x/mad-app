import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (19.4 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(60000);

/**
 * الحزمة ج (`ق-١٢٦١`) — **التسويةُ البنكية**: سطورُ الكشف اليدوية مقابل سطور الدفتر على حساب البنك (بمحرّك الأستاذ)،
 * مطابقةٌ واحدٌ لواحد بمبلغٍ مساوٍ ومقترَحاتٌ بالمبلغ والتاريخ، وسطرٌ بلا دفتر يُرحَّل بطرفٍ يختاره المحاسب (`ق-٢٨١`)،
 * وإقفالٌ حتى تاريخٍ يحرس حسابَ البنك كما يحرس إقفالُ الفترة القيود. منشأةٌ معزولة وجوابٌ محسوبٌ يداً.
 */
describe('Bank reconciliation (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let other: IsolatedCompany;
  let bankId: string;
  let bankAccountId: string;
  let feeAccountId: string;
  let revenueId: string;
  let customerId: string;
  let depositRowId: string;
  let feeRowId: string;
  let paymentLineId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const overview = async (q = '') => (await auth(http().get(`/banks/${bankId}/reconciliation${q}`)).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'bankrec');
    other = await registerIsolatedCompany(app, 'bankrec-other');
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    revenueId = accounts.find((a) => a.code === '4100')!.id;
    feeAccountId = accounts.find((a) => a.code === '5300')!.id;

    const bank = await auth(http().post('/banks')).send({ name: 'بنك التسوية', kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201);
    bankId = bank.body.id;
    bankAccountId = bank.body.accountId;

    // دفترٌ: قبضُ 500 من عميل إلى البنك بتاريخ 2026-06-10 — سطرُ بنكٍ مدينٌ 500.
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل التسوية' }).expect(201)).body.id;
    const invoice = await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-06-01', dueDate: '2026-07-01', lines: [{ description: 'خدمة', quantity: 1, unitPrice: 500, taxRate: 15 }] })
      .expect(201);
    await auth(http().post('/payments'))
      .send({ customerId, date: '2026-06-10', amount: 500, method: 'BANK', bankId, allocations: [{ invoiceId: invoice.body.id, amount: 500 }] })
      .expect(201);

    // كشفٌ يدويّ: الإيداعُ نفسُه بعد يومين، ورسمٌ بنكيٌّ لا دفترَ له.
    depositRowId = (await auth(http().post('/transactions')).send({ bankId, date: '2026-06-12', description: 'إيداع عميل', amount: 500 }).expect(201)).body.id;
    feeRowId = (await auth(http().post('/transactions')).send({ bankId, date: '2026-06-15', description: 'رسوم البنك', amount: -35 }).expect(201)).body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    await app.close();
  }, 60000);

  it('[SPEC 7.4] ① the overview reads the statement side (manual lines only) against the ledger side, and suggests the equal-amount line within ±3 days', async () => {
    const o = await overview('?from=2026-06-01&to=2026-06-30');
    expect(o.bank).toMatchObject({ id: bankId, accountId: bankAccountId, reconciledUntil: null });
    // جانبُ الكشف: السطران اليدويان لا المرآةُ التي كتبها القبض.
    expect(o.statement.map((s: { id: string; amount: string }) => [s.id, s.amount])).toEqual([[depositRowId, '500.00'], [feeRowId, '-35.00']]);
    // جانبُ الدفتر: سطرُ القبض على حساب البنك، غيرُ مطابَق.
    expect(o.ledger.rows).toHaveLength(1);
    expect(o.ledger.rows[0]).toMatchObject({ debit: '500.00', matched: false, source: { type: 'PAYMENT' } });
    paymentLineId = o.ledger.rows[0].lineId;
    expect(o.suggestions).toEqual([{ transactionId: depositRowId, lineIds: [paymentLineId] }, { transactionId: feeRowId, lineIds: [] }]);
    expect(o.totals).toEqual({ unmatchedStatement: '465.00', unmatchedStatementCount: 2, unmatchedLedger: '500.00', unmatchedLedgerCount: 1 });
  }, 30000);

  it('[SPEC 7.4] ② matching is one-to-one with equal amounts — the fee cannot take the deposit line, the deposit can', async () => {
    const wrong = await auth(http().post(`/banks/${bankId}/reconciliation/match`)).send({ transactionId: feeRowId, lineId: paymentLineId }).expect(409);
    expect(wrong.body.message).toContain('500.00');
    await auth(http().post(`/banks/${bankId}/reconciliation/match`)).send({ transactionId: depositRowId, lineId: paymentLineId }).expect(201);
    await auth(http().post(`/banks/${bankId}/reconciliation/match`)).send({ transactionId: depositRowId, lineId: paymentLineId }).expect(409);
    const o = await overview();
    expect(o.ledger.rows[0].matched).toBe(true);
    expect(o.totals).toEqual({ unmatchedStatement: '-35.00', unmatchedStatementCount: 1, unmatchedLedger: '0.00', unmatchedLedgerCount: 0 });
  }, 30000);

  it('[SPEC 7.4] ③ a statement line with no ledger is posted with a chosen counterparty — the entry lands on the bank ledger and the mirror, and the line is matched', async () => {
    const before = (await auth(http().get('/banks')).expect(200)).body.find((b: { id: string }) => b.id === bankId).balance;
    await auth(http().post(`/banks/${bankId}/reconciliation/post`)).send({ transactionId: feeRowId, counterpartyAccountId: bankAccountId }).expect(400);
    await auth(http().post(`/banks/${bankId}/reconciliation/post`)).send({ transactionId: feeRowId, counterpartyAccountId: feeAccountId, memo: 'رسوم يونيو' }).expect(201);
    const o = await overview();
    const fee = o.ledger.rows.find((r: { credit: string }) => r.credit === '35.00');
    expect(fee).toMatchObject({ date: '2026-06-15', memo: 'رسوم يونيو', matched: true });
    expect(o.totals).toEqual({ unmatchedStatement: '0.00', unmatchedStatementCount: 0, unmatchedLedger: '0.00', unmatchedLedgerCount: 0 });
    // المرآةُ تحرّكت من مسار الترحيل: 500 − 35.
    const after = (await auth(http().get('/banks')).expect(200)).body.find((b: { id: string }) => b.id === bankId).balance;
    expect(Number(after)).toBeCloseTo(Number(before) - 35, 2);
    // وكشفُ الأستاذ يرى السطرَ قيداً يدويّاً بمصدره.
    const ledger = await auth(http().get(`/reports/ledger?accountId=${bankAccountId}`)).expect(200);
    expect(ledger.body.closing).toBe('465.00');
  }, 30000);

  it('[SPEC 7.4] ④ closing through a date needs no pending statement lines, then locks the bank account for entries and unmatching on or before it', async () => {
    // سطرٌ معلَّق قبل التاريخ يمنع الإقفال بعدده.
    const pendingId = (await auth(http().post('/transactions')).send({ bankId, date: '2026-06-20', description: 'تحويل غير مسجَّل', amount: 80 }).expect(201)).body.id;
    const refused = await auth(http().post(`/banks/${bankId}/reconciliation/close`)).send({ until: '2026-06-30' }).expect(409);
    expect(refused.body.message).toContain('1');
    await auth(http().post(`/banks/${bankId}/reconciliation/post`)).send({ transactionId: pendingId, counterpartyAccountId: revenueId }).expect(201);
    const closed = await auth(http().post(`/banks/${bankId}/reconciliation/close`)).send({ until: '2026-06-30' }).expect(201);
    expect(closed.body.reconciledUntil).toBe('2026-06-30');

    // قيدٌ على حساب البنك بتاريخٍ ≤ الإقفال يُرفض من مسار الترحيل الواحد — وبعده يمرّ.
    const lines = [{ accountId: bankAccountId, debit: 10, credit: 0 }, { accountId: revenueId, debit: 0, credit: 10 }];
    const locked = await auth(http().post('/journal')).send({ date: '2026-06-30', memo: 'قيدٌ قبل الإقفال', lines }).expect(409);
    expect(locked.body.message).toContain('2026-06-30');
    await auth(http().post('/journal')).send({ date: '2026-07-01', memo: 'قيدٌ بعد الإقفال', lines }).expect(201);
    // وفكُّ مطابقةٍ قبل الإقفال يُرفض؛ وإعادةُ الفتح تُعيد الأمرَ.
    await auth(http().post(`/banks/${bankId}/reconciliation/unmatch`)).send({ transactionId: depositRowId }).expect(409);
    await auth(http().post(`/banks/${bankId}/reconciliation/reopen`)).expect(201);
    await auth(http().post(`/banks/${bankId}/reconciliation/unmatch`)).send({ transactionId: depositRowId }).expect(201);
    // المعلَّقُ في الدفتر الآن اثنان: الإيداعُ المفكوك وقيدُ ما بعد الإقفال الذي لا كشفَ له.
    expect((await overview()).totals.unmatchedLedgerCount).toBe(2);
  }, 30000);

  it('[SPEC 7.4] ⑤ another company sees nothing', async () => {
    await request(app.getHttpServer()).get(`/banks/${bankId}/reconciliation`).set('Authorization', `Bearer ${other.token}`).expect(404);
    await request(app.getHttpServer()).post(`/banks/${bankId}/reconciliation/close`).set('Authorization', `Bearer ${other.token}`).send({ until: '2026-06-30' }).expect(404);
  }, 30000);
});
