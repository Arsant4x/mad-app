import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * الحزمة ج (`ق-١٢٦١`) — **إيداعُ الدرج في البنك عبر «نقدٍ في الطريق» 1190** (⑦A3): الإيداعُ يخرج من الدرج إلى الطريق
 * (`مدين 1190 / دائن الدرج`)، ويؤكّده سطرُ كشف البنك من التسوية (⑦A1) بمبلغه نفسِه (`مدين البنك / دائن 1190`)؛
 * والإلغاءُ عكسٌ قبل التأكيد وحدَه. منشأةٌ معزولة وجوابٌ محسوبٌ يداً: درجٌ مموَّل `500`، إيداعٌ `300`.
 */
describe('Cash deposits through cash-in-transit (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let other: IsolatedCompany;
  let drawerId: string;
  let drawerAccountId: string;
  let bankId: string;
  let bankAccountId: string;
  let revenueId: string;
  let depositId: string;
  let transitAccountId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const ledgerClosing = async (accountId: string) => (await auth(http().get(`/reports/ledger?accountId=${accountId}`)).expect(200)).body.closing as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'cashdep');
    other = await registerIsolatedCompany(app, 'cashdep-other');
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    revenueId = accounts.find((a) => a.code === '4100')!.id;

    const drawer = await auth(http().post('/cash-drawers')).send({ name: 'درج الإيداع' }).expect(201);
    drawerId = drawer.body.id;
    drawerAccountId = drawer.body.account?.id ?? drawer.body.accountId;
    const bank = await auth(http().post('/banks')).send({ name: 'بنك الإيداع', openingBalance: 0, openingDate: '2026-01-01' }).expect(201);
    bankId = bank.body.id;
    bankAccountId = bank.body.accountId;

    // تمويلُ الدرج بقيدٍ يدويّ: مدين الدرج 500 / دائن إيراد — فالإيداعُ يُقاس على رصيدٍ حقيقيّ بالدفتر.
    await auth(http().post('/journal'))
      .send({ date: '2026-06-01', memo: 'تمويل الدرج', lines: [{ accountId: drawerAccountId, debit: 500, credit: 0 }, { accountId: revenueId, debit: 0, credit: 500 }] })
      .expect(201);
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    await app.close();
  }, 60000);

  it('[SPEC 7.7] ① a deposit leaves the drawer for 1190 — numbered CD, an auto entry, and the two ledgers say so', async () => {
    const res = await auth(http().post('/banks/cash-deposits')).send({ drawerId, bankId, amount: 300, date: '2026-06-05' }).expect(201);
    depositId = res.body.id;
    expect(res.body.no).toMatch(/^CD-\d{4}-\d{4}$/);
    expect(res.body.status).toBe('IN_TRANSIT');
    expect(res.body.amount).toBe('300.00');
    expect(await ledgerClosing(drawerAccountId)).toBe('200.00');
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    transitAccountId = accounts.find((a) => a.code === '1190')!.id;
    expect(await ledgerClosing(transitAccountId)).toBe('300.00');
    // البنكُ لم يتحرّك بعد — لا بالدفتر ولا بالمرآة.
    expect(await ledgerClosing(bankAccountId)).toBe('0.00');
    const list = await auth(http().get('/banks/cash-deposits')).expect(200);
    expect(list.body.inTransit).toEqual({ ledger: '300.00', documents: '300.00', matched: true });
  }, 30000);

  it('[SPEC 7.7] ② a deposit above what the drawer holds is refused by the drawer balance — named', async () => {
    const refused = await auth(http().post('/banks/cash-deposits')).send({ drawerId, bankId, amount: 250, date: '2026-06-06' }).expect(409);
    expect(refused.body.message).toContain('200.00');
    expect(await ledgerClosing(drawerAccountId)).toBe('200.00');
  }, 30000);

  it('[SPEC 7.7] ③ the bank statement confirms it through reconciliation with the exact amount — 1190 clears, the bank ledger and mirror move, the document closes', async () => {
    const wrongRow = (await auth(http().post('/transactions')).send({ bankId, date: '2026-06-07', description: 'إيداع ناقص', amount: 290 }).expect(201)).body.id;
    const mismatch = await auth(http().post(`/banks/${bankId}/reconciliation/post`)).send({ transactionId: wrongRow, depositId }).expect(409);
    expect(mismatch.body.message).toContain('300.00');

    const row = (await auth(http().post('/transactions')).send({ bankId, date: '2026-06-07', description: 'إيداع نقدي', amount: 300 }).expect(201)).body.id;
    await auth(http().post(`/banks/${bankId}/reconciliation/post`)).send({ transactionId: row, depositId }).expect(201);
    expect(await ledgerClosing(transitAccountId)).toBe('0.00');
    expect(await ledgerClosing(bankAccountId)).toBe('300.00');
    const bank = (await auth(http().get('/banks')).expect(200)).body.find((b: { id: string }) => b.id === bankId);
    expect(Number(bank.balance)).toBeCloseTo(300, 2);
    const list = await auth(http().get('/banks/cash-deposits')).expect(200);
    const doc = list.body.items.find((d: { id: string }) => d.id === depositId);
    expect(doc.status).toBe('CONFIRMED');
    expect(doc.confirmedTransactionId).toBe(row);
    expect(list.body.inTransit).toEqual({ ledger: '0.00', documents: '0.00', matched: true });
    // المؤكَّدُ لا يُلغى.
    await auth(http().post(`/banks/cash-deposits/${depositId}/void`)).send({}).expect(409);
  }, 30000);

  it('[SPEC 7.7] ④ voiding an in-transit deposit is a reversal that returns the cash to the drawer', async () => {
    const second = await auth(http().post('/banks/cash-deposits')).send({ drawerId, bankId, amount: 150, date: '2026-06-08' }).expect(201);
    expect(await ledgerClosing(drawerAccountId)).toBe('50.00');
    const voided = await auth(http().post(`/banks/cash-deposits/${second.body.id}/void`)).send({ reason: 'لم يُودَع' }).expect(201);
    expect(voided.body.status).toBe('VOID');
    expect(voided.body.voidEntryNo).toMatch(/^JE-/);
    expect(await ledgerClosing(drawerAccountId)).toBe('200.00');
    expect(await ledgerClosing(transitAccountId)).toBe('0.00');
  }, 30000);

  it('[SPEC 7.7] ⑤ another company sees nothing', async () => {
    await request(app.getHttpServer()).post(`/banks/cash-deposits/${depositId}/void`).set('Authorization', `Bearer ${other.token}`).send({}).expect(404);
    const list = await request(app.getHttpServer()).get('/banks/cash-deposits').set('Authorization', `Bearer ${other.token}`).expect(200);
    expect(list.body.items).toEqual([]);
  }, 30000);
});
