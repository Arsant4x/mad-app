import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

jest.setTimeout(90000);

/**
 * A bank transaction that the reconciliation relies on is not edited or deleted by hand: a line matched to a ledger
 * line is corrected by unmatching it, a line written by a posting follows its entry, and nothing on or before the
 * reconciled-through date changes or is added until the reconciliation is reopened.
 */
describe('Bank transactions tied to the reconciliation are locked (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let bankId: string;
  let feeAccountId: string;
  let depositRowId: string;
  let feeRowId: string;
  let mirrorRowId: string;
  let mirrorEntryNo: string;
  let paymentLineId: string;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`).set('Accept-Language', 'en');

  type Row = { id: string; amount: string; description: string; date: string; matched: boolean; matchedLineId: string | null; entryNo: string | null; source: string | null };
  const rowOf = async (id: string): Promise<Row | undefined> =>
    ((await auth(http().get('/transactions?pageSize=100')).expect(200)).body.items as Row[]).find((r) => r.id === id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'banktx-lock');
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    feeAccountId = accounts.find((a) => a.code === '5300')!.id;

    bankId = (await auth(http().post('/banks')).send({ name: 'Locked bank', kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body.id;

    // Ledger side: a customer payment of 500 into the bank on 2026-06-10, which also writes its mirror row.
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'Lock customer' }).expect(201)).body.id;
    const invoice = await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-06-01', dueDate: '2026-07-01', lines: [{ description: 'Service', quantity: 1, unitPrice: 500, taxRate: 15 }] })
      .expect(201);
    await auth(http().post('/payments'))
      .send({ customerId, date: '2026-06-10', amount: 500, method: 'BANK', bankId, allocations: [{ invoiceId: invoice.body.id, amount: 500 }] })
      .expect(201);

    // Statement side: the same deposit two days later, and a bank fee with no ledger line.
    depositRowId = (await auth(http().post('/transactions')).send({ bankId, date: '2026-06-12', description: 'Customer deposit', amount: 500 }).expect(201)).body.id;
    feeRowId = (await auth(http().post('/transactions')).send({ bankId, date: '2026-06-15', description: 'Bank fee', amount: -35 }).expect(201)).body.id;

    const items = (await auth(http().get('/transactions?pageSize=100')).expect(200)).body.items as Row[];
    const mirror = items.find((r) => r.source === 'customer-payment' && r.entryNo !== null);
    if (!mirror) throw new Error('the payment did not write its mirror row');
    mirrorRowId = mirror.id;
    mirrorEntryNo = mirror.entryNo!;

    const overview = (await auth(http().get(`/banks/${bankId}/reconciliation`)).expect(200)).body as { ledger: { rows: { lineId: string }[] } };
    paymentLineId = overview.ledger.rows[0].lineId;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses to edit or delete a matched statement line until it is unmatched', async () => {
    await auth(http().post(`/banks/${bankId}/reconciliation/match`)).send({ transactionId: depositRowId, lineId: paymentLineId }).expect(201);

    const edited = await auth(http().patch(`/transactions/${depositRowId}`)).send({ amount: 600 }).expect(409);
    expect(edited.body.message).toContain('unmatch it first');
    const deleted = await auth(http().delete(`/transactions/${depositRowId}`)).expect(409);
    expect(deleted.body.message).toContain('unmatch it first');
    const kept = await rowOf(depositRowId);
    expect({ amount: Number(kept?.amount), matchedLineId: kept?.matchedLineId }).toEqual({ amount: 500, matchedLineId: paymentLineId });

    // The correction path: unmatch, then the line is an ordinary statement line again.
    await auth(http().post(`/banks/${bankId}/reconciliation/unmatch`)).send({ transactionId: depositRowId }).expect(201);
    await auth(http().patch(`/transactions/${depositRowId}`)).send({ description: 'Customer deposit (corrected)' }).expect(200);
    await auth(http().post(`/banks/${bankId}/reconciliation/match`)).send({ transactionId: depositRowId, lineId: paymentLineId }).expect(201);
  });

  it('refuses to edit or delete a line written by a posting, naming its entry', async () => {
    const edited = await auth(http().patch(`/transactions/${mirrorRowId}`)).send({ amount: 50 }).expect(409);
    expect(edited.body.message).toContain(mirrorEntryNo);
    const deleted = await auth(http().delete(`/transactions/${mirrorRowId}`)).expect(409);
    expect(deleted.body.message).toContain(mirrorEntryNo);
    const kept = await rowOf(mirrorRowId);
    expect({ amount: Number(kept?.amount), entryNo: kept?.entryNo }).toEqual({ amount: 500, entryNo: mirrorEntryNo });
  });

  it('after closing through a date, nothing on or before it is edited, deleted or moved into it', async () => {
    await auth(http().post(`/banks/${bankId}/reconciliation/post`)).send({ transactionId: feeRowId, counterpartyAccountId: feeAccountId }).expect(201);
    await auth(http().post(`/banks/${bankId}/reconciliation/close`)).send({ until: '2026-06-30' }).expect(201);

    // The closed date is named first: the reconciliation has to be reopened before anything else.
    const edited = await auth(http().patch(`/transactions/${depositRowId}`)).send({ description: 'Changed after close' }).expect(409);
    expect(edited.body.message).toContain('2026-06-30');
    const deleted = await auth(http().delete(`/transactions/${depositRowId}`)).expect(409);
    expect(deleted.body.message).toContain('2026-06-30');
    const movedOut = await auth(http().patch(`/transactions/${depositRowId}`)).send({ date: '2026-07-10' }).expect(409);
    expect(movedOut.body.message).toContain('2026-06-30');

    // A later unmatched line stays editable, but cannot be moved into the closed range.
    const laterId = (await auth(http().post('/transactions')).send({ bankId, date: '2026-07-05', description: 'July transfer', amount: 80 }).expect(201)).body.id;
    const moved = await auth(http().patch(`/transactions/${laterId}`)).send({ date: '2026-06-20' }).expect(409);
    expect(moved.body.message).toContain('2026-06-30');
    expect(await rowOf(laterId)).toMatchObject({ date: expect.stringMatching(/^2026-07-05/) });
    await auth(http().patch(`/transactions/${laterId}`)).send({ description: 'July transfer (corrected)' }).expect(200);
    await auth(http().delete(`/transactions/${laterId}`)).expect(204);

    // Reopening lifts the date lock; the matched line is then guarded by its match alone.
    await auth(http().post(`/banks/${bankId}/reconciliation/reopen`)).expect(201);
    const afterReopen = await auth(http().patch(`/transactions/${depositRowId}`)).send({ description: 'Changed after reopen' }).expect(409);
    expect(afterReopen.body.message).toContain('unmatch it first');
  });

  it('refuses a new line dated on or before the reconciled-through date, and accepts one after it', async () => {
    await auth(http().post(`/banks/${bankId}/reconciliation/close`)).send({ until: '2026-06-30' }).expect(201);
    const count = async () => ((await auth(http().get('/transactions?pageSize=100')).expect(200)).body.items as Row[]).length;
    const before = await count();

    const onClosedDay = await auth(http().post('/transactions')).send({ bankId, date: '2026-06-30', description: 'Fee on the closed day', amount: -5 }).expect(409);
    expect(onClosedDay.body.message).toContain('2026-06-30');
    const inside = await auth(http().post('/transactions')).send({ bankId, date: '2026-06-03', description: 'Fee inside the closed range', amount: -5 }).expect(409);
    expect(inside.body.message).toContain('reopen the reconciliation first');
    expect(await count()).toBe(before);

    const afterId = (await auth(http().post('/transactions')).send({ bankId, date: '2026-07-01', description: 'Fee after the close', amount: -5 }).expect(201)).body.id;
    expect(await rowOf(afterId)).toMatchObject({ date: expect.stringMatching(/^2026-07-01/) });

    // Reopening lifts the lock for new lines too.
    await auth(http().post(`/banks/${bankId}/reconciliation/reopen`)).expect(201);
    await auth(http().post('/transactions')).send({ bankId, date: '2026-06-03', description: 'Fee after reopen', amount: -5 }).expect(201);
  });
});
