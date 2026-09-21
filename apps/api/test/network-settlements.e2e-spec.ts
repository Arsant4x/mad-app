import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * الحزمة ج (`ق-١٢٦١`) — **تسويةُ الشبكة `1251`** (⑦A2): سندُ قبضٍ بطريقة الشبكة يرحّل `مدين 1251` (كما يقول تعريفُ
 * الطريقة `ق-٣٢٠` — وكان المسارُ اليدويّ يُسقطه إلى `1000`)، والتسويةُ تطالب بسندات المدى فتقفل `1251` بإجماليّها:
 * `مدين البنك (الصافي) · مدين 5910 · مدين 1250 · دائن 1251`. جوابٌ محسوبٌ يداً: سندان `1000 + 500`، عمولةٌ `30`
 * وضريبتُها `4.50` ⟵ الصافي `1465.50`.
 */
describe('Network settlement of 1251 (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let other: IsolatedCompany;
  let bankId: string;
  let bankAccountId: string;
  let customerId: string;
  let settlementId: string;
  let settlementEntryNo: string;
  const codes: Record<string, string> = {};

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const ledgerClosing = async (accountId: string) => (await auth(http().get(`/reports/ledger?accountId=${accountId}`)).expect(200)).body.closing as string;
  const accountByCode = async (code: string) => {
    if (!codes[code]) {
      const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
      const hit = accounts.find((a) => a.code === code);
      if (!hit) throw new Error(`account ${code} missing`);
      codes[code] = hit.id;
    }
    return codes[code];
  };
  const cardReceipt = (amount: number, date: string) => auth(http().post('/payments')).send({ customerId, date, amount, method: 'CARD' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'netset');
    other = await registerIsolatedCompany(app, 'netset-other');
    const bank = await auth(http().post('/banks')).send({ name: 'بنك الشبكة', openingBalance: 0, openingDate: '2026-01-01' }).expect(201);
    bankId = bank.body.id;
    bankAccountId = bank.body.accountId;
    const customer = await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل الشبكة' }).expect(201);
    customerId = customer.body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    await app.close();
  }, 60000);

  it('[SPEC 7.8] ① a manual network receipt lands on 1251 — not 1000 — and the open list carries it with its ledger amount', async () => {
    await cardReceipt(1000, '2026-06-03').expect(201);
    await cardReceipt(500, '2026-06-10').expect(201);
    expect(await ledgerClosing(await accountByCode('1251'))).toBe('1500.00');
    expect(await ledgerClosing(await accountByCode('1000'))).toBe('0.00');
    const open = await auth(http().get('/banks/network-settlements/open?from=2026-06-01&to=2026-06-30')).expect(200);
    expect(open.body.receipts).toHaveLength(2);
    expect(open.body.gross).toBe('1500.00');
    expect(open.body.summary).toEqual({ ledger: '1500.00', open: '1500.00', openCount: 2, matched: true });
  }, 30000);

  it('[SPEC 7.8] ② the settlement claims the period, gross from the ledger, net to the bank, fee and its VAT in their month — and 1251 clears', async () => {
    const res = await auth(http().post('/banks/network-settlements'))
      .send({ bankId, date: '2026-07-02', periodFrom: '2026-06-01', periodTo: '2026-06-30', feeAmount: 30, feeVatAmount: 4.5 })
      .expect(201);
    settlementId = res.body.id;
    settlementEntryNo = res.body.entryNo;
    expect(res.body.no).toMatch(/^NS-\d{4}-\d{4}$/);
    expect(res.body).toMatchObject({ status: 'POSTED', grossAmount: '1500.00', feeAmount: '30.00', feeVatAmount: '4.50', netAmount: '1465.50', receiptCount: 2 });
    expect(await ledgerClosing(await accountByCode('1251'))).toBe('0.00');
    expect(await ledgerClosing(bankAccountId)).toBe('1465.50');
    expect(await ledgerClosing(await accountByCode('5910'))).toBe('30.00');
    expect(await ledgerClosing(await accountByCode('1250'))).toBe('4.50');
    const bank = (await auth(http().get('/banks')).expect(200)).body.find((b: { id: string }) => b.id === bankId);
    expect(Number(bank.balance)).toBeCloseTo(1465.5, 2);
    const list = await auth(http().get('/banks/network-settlements')).expect(200);
    expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([settlementId]);
    expect(list.body.summary).toEqual({ ledger: '0.00', open: '0.00', openCount: 0, matched: true });
  }, 30000);

  it('[SPEC 7.8] ③ nothing open, fee above gross, and a backwards period are refused by name — and a claimed receipt is not claimed twice', async () => {
    await auth(http().post('/banks/network-settlements'))
      .send({ bankId, date: '2026-07-03', periodFrom: '2026-06-01', periodTo: '2026-06-30', feeAmount: 0, feeVatAmount: 0 })
      .expect(409);
    await cardReceipt(100, '2026-07-01').expect(201);
    const tooMuch = await auth(http().post('/banks/network-settlements'))
      .send({ bankId, date: '2026-07-05', periodFrom: '2026-07-01', periodTo: '2026-07-31', feeAmount: 100, feeVatAmount: 0 })
      .expect(400);
    expect(tooMuch.body.message).toContain('100.00');
    await auth(http().post('/banks/network-settlements'))
      .send({ bankId, date: '2026-07-05', periodFrom: '2026-07-31', periodTo: '2026-07-01', feeAmount: 0, feeVatAmount: 0 })
      .expect(400);
    // المدى الواسع لا يعيد المطالبة بما طُولب به: السندان في يونيو صارا لتسوية، فالمفتوح سندُ يوليو وحده.
    const open = await auth(http().get('/banks/network-settlements/open?from=2026-06-01&to=2026-07-31')).expect(200);
    expect(open.body.receipts).toHaveLength(1);
    expect(open.body.gross).toBe('100.00');
  }, 30000);

  it('[SPEC 7.8] ④ a settlement matched by the bank statement cannot be voided; unmatched, its void is a reversal that reopens the receipts', async () => {
    const row = (await auth(http().post('/transactions')).send({ bankId, date: '2026-07-02', description: 'تحويل المستحوذ', amount: 1465.5 }).expect(201)).body.id;
    const overview = (await auth(http().get(`/banks/${bankId}/reconciliation`)).expect(200)).body;
    const line = overview.ledger.rows.find((r: { entryNo: string }) => r.entryNo === settlementEntryNo);
    expect(line).toBeDefined();
    expect(overview.suggestions.find((s: { transactionId: string }) => s.transactionId === row)?.lineIds).toContain(line.lineId);
    await auth(http().post(`/banks/${bankId}/reconciliation/match`)).send({ transactionId: row, lineId: line.lineId }).expect(201);
    const locked = await auth(http().post(`/banks/network-settlements/${settlementId}/void`)).send({}).expect(409);
    // الرفضُ يسمّي التسويةَ برقمها ويدلّ على الفعل الصحيح: فكُّ المطابقة من التسوية البنكية.
    expect(locked.body.message).toContain('NS-');
    expect(locked.body.message).toContain('المطابقة');
    await auth(http().post(`/banks/${bankId}/reconciliation/unmatch`)).send({ transactionId: row }).expect(201);

    const voided = await auth(http().post(`/banks/network-settlements/${settlementId}/void`)).send({ reason: 'إشعار خاطئ' }).expect(201);
    expect(voided.body.status).toBe('VOID');
    expect(voided.body.voidEntryNo).toMatch(/^JE-/);
    expect(await ledgerClosing(await accountByCode('1251'))).toBe('1600.00');
    expect(await ledgerClosing(bankAccountId)).toBe('0.00');
    expect(await ledgerClosing(await accountByCode('5910'))).toBe('0.00');
    const open = await auth(http().get('/banks/network-settlements/open')).expect(200);
    expect(open.body.receipts).toHaveLength(3);
    expect(open.body.summary).toEqual({ ledger: '1600.00', open: '1600.00', openCount: 3, matched: true });
    await auth(http().post(`/banks/network-settlements/${settlementId}/void`)).send({}).expect(409);
  }, 30000);

  it('[SPEC 7.8] ⑤ another company sees nothing', async () => {
    await request(app.getHttpServer()).post(`/banks/network-settlements/${settlementId}/void`).set('Authorization', `Bearer ${other.token}`).send({}).expect(404);
    const list = await request(app.getHttpServer()).get('/banks/network-settlements').set('Authorization', `Bearer ${other.token}`).expect(200);
    expect(list.body.items).toEqual([]);
  }, 30000);
});
