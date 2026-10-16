import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { ISOLATED_PASSWORD, IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

jest.setTimeout(180000);

/**
 * Reversals and cancellations dated "today" take the merchant's day, not the UTC day. The clock is fixed at
 * 22:30 UTC on the last day of October, which is already 1 November for a company three hours east of UTC:
 * every reversal below must book on 1 November, in the month that is open, not on 31 October.
 */
describe('Reversals dated today take the merchant day (e2e)', () => {
  const LATE_NIGHT = new Date('2026-10-31T22:30:00.000Z');
  const MERCHANT_DAY = '2026-11-01';

  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const day = (iso: string) => String(iso).slice(0, 10);

  const accountId = async (code: string): Promise<string> => {
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const hit = accounts.find((a) => a.code === code);
    if (!hit) throw new Error(`account ${code} missing`);
    return hit.id;
  };
  const entryByNo = async (no: string): Promise<{ no: string; date: string; memo: string }> => {
    const page = (await auth(http().get('/journal').query({ search: no, pageSize: 100 })).expect(200)).body as { items: { no: string; date: string; memo: string }[] };
    const hit = page.items.find((e) => e.no === no);
    if (!hit) throw new Error(`journal entry ${no} not listed`);
    return hit;
  };
  const entryByMemo = async (search: string, memoStart: string): Promise<{ no: string; date: string; memo: string }> => {
    const page = (await auth(http().get('/journal').query({ search, pageSize: 100 })).expect(200)).body as { items: { no: string; date: string; memo: string }[] };
    const hits = page.items.filter((e) => e.memo.startsWith(memoStart));
    if (hits.length !== 1) throw new Error(`expected one entry starting "${memoStart}", found ${hits.length}`);
    return hits[0];
  };

  // Documents created under the real clock, dated inside October, and reversed later under the fixed clock.
  let manualEntryId: string;
  let depositId: string;
  let settlementId: string;
  let purchase: { id: string; no: string };
  let supplierPaymentId: string;
  let usdPayment: { id: string; no: string };
  let usdPurchaseId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    company = await registerIsolatedCompany(app, 'reversal-day');
    token = company.token;

    const cash = await accountId('1000');
    const revenue = await accountId('4100');

    manualEntryId = (
      (await auth(http().post('/journal'))
        .send({ date: '2026-10-10', memo: `entry to reverse ${suffix}`, lines: [{ accountId: cash, debit: 120, credit: 0 }, { accountId: revenue, debit: 0, credit: 120 }] })
        .expect(201)).body as { id: string }
    ).id;

    const drawer = (await auth(http().post('/cash-drawers')).send({ name: `drawer ${suffix}` }).expect(201)).body as { id: string; accountId?: string; account?: { id: string } };
    const drawerAccountId = drawer.account?.id ?? drawer.accountId!;
    const bank = (await auth(http().post('/banks')).send({ name: `bank ${suffix}`, kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body as { id: string };
    await auth(http().post('/journal'))
      .send({ date: '2026-10-01', memo: `drawer funding ${suffix}`, lines: [{ accountId: drawerAccountId, debit: 500, credit: 0 }, { accountId: revenue, debit: 0, credit: 500 }] })
      .expect(201);
    depositId = ((await auth(http().post('/banks/cash-deposits')).send({ drawerId: drawer.id, bankId: bank.id, amount: 300, date: '2026-10-05' }).expect(201)).body as { id: string }).id;

    const customerId = ((await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `card customer ${suffix}` }).expect(201)).body as { id: string }).id;
    await auth(http().post('/payments'))
      .send({ customerId, date: '2026-10-03', amount: 1000, method: 'CARD', unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } })
      .expect(201);
    settlementId = (
      (await auth(http().post('/banks/network-settlements'))
        .send({ bankId: bank.id, date: '2026-10-08', periodFrom: '2026-10-01', periodTo: '2026-10-07', feeAmount: 20, feeVatAmount: 3 })
        .expect(201)).body as { id: string }
    ).id;

    const supplierId = ((await auth(http().post('/suppliers')).send({ name: `supplier ${suffix}` }).expect(201)).body as { id: string }).id;
    const boxId = ((await auth(http().post('/banks')).send({ name: `box ${suffix}`, kind: 'CASH_BOX', openingBalance: 5000, openingDate: '2026-01-01' }).expect(201)).body as { id: string }).id;
    const buy = (body: Record<string, unknown>) => auth(http().post('/purchases')).send({ supplierId, category: `item ${suffix}`, subtotal: 100, exempt: true, ...body }).expect(201);

    purchase = (await buy({ date: '2026-10-06' })).body as { id: string; no: string };
    const paid = (await buy({ date: '2026-10-07' })).body as { id: string };
    supplierPaymentId = (
      (await auth(http().post('/supplier-payments'))
        .send({ supplierId, date: '2026-10-09', amount: 100, method: 'CASH', bankId: boxId, allocations: [{ purchaseId: paid.id, amount: 100 }] })
        .expect(201)).body as { id: string }
    ).id;

    // A prepayment at one rate later applied to a purchase at another rate: its reallocation writes an entry dated today.
    usdPayment = (
      (await auth(http().post('/supplier-payments'))
        .send({ supplierId, date: '2026-10-02', amount: 100, method: 'CASH', bankId: boxId, currency: 'USD', exchangeRate: 3.8 })
        .expect(201)).body as { id: string; no: string }
    );
    usdPurchaseId = ((await buy({ date: '2026-10-04', currency: 'USD', exchangeRate: 3.7 })).body as { id: string }).id;
  });

  afterAll(async () => {
    jest.useRealTimers();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  describe('at 22:30 UTC on 31 October', () => {
    beforeAll(async () => {
      // The fixed instant is a real moment only for a company three hours east of UTC: check it before relying on it.
      const { timeZone } = await app.get(PrismaService).company.findUniqueOrThrow({ where: { id: company.companyId }, select: { timeZone: true } });
      const local = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).format(LATE_NIGHT);
      expect(local).toBe(`${MERCHANT_DAY}, 01`);

      // Only Date is faked, so the database driver and the HTTP server keep their real timers.
      jest.useFakeTimers({
        now: LATE_NIGHT,
        advanceTimers: true,
        doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
      });
      expect(new Date().toISOString().slice(0, 13)).toBe('2026-10-31T22');
      // The registration token expired under the moved clock; sign in again at the fixed instant.
      token = ((await http().post('/auth/login').send({ username: company.username, password: ISOLATED_PASSWORD }).expect(200)).body as { accessToken: string }).accessToken;
    });

    it('reverses a manual journal entry on the merchant day', async () => {
      const reversal = (await auth(http().post(`/journal/${manualEntryId}/reverse`)).send({}).expect(201)).body as { date: string };
      expect(day(reversal.date)).toBe(MERCHANT_DAY);
    });

    it('voids a cash deposit on the merchant day', async () => {
      const voided = (await auth(http().post(`/banks/cash-deposits/${depositId}/void`)).send({}).expect(201)).body as { voidEntryNo: string };
      expect(day((await entryByNo(voided.voidEntryNo)).date)).toBe(MERCHANT_DAY);
    });

    it('voids a network settlement on the merchant day, in the ledger and in the bank movement', async () => {
      const voided = (await auth(http().post(`/banks/network-settlements/${settlementId}/void`)).send({}).expect(201)).body as { voidEntryNo: string };
      expect(day((await entryByNo(voided.voidEntryNo)).date)).toBe(MERCHANT_DAY);
      const rows = (await auth(http().get('/transactions')).query({ search: voided.voidEntryNo }).expect(200)).body as { items: { entryNo: string | null; date: string }[] };
      const movement = rows.items.filter((r) => r.entryNo === voided.voidEntryNo);
      expect(movement.map((r) => day(r.date))).toEqual([MERCHANT_DAY]);
    });

    it('cancels a purchase with its reversal on the merchant day', async () => {
      await auth(http().delete(`/purchases/${purchase.id}`)).expect(204);
      expect(day((await entryByMemo(purchase.no, `إلغاءُ فاتورة شراء ${purchase.no}`)).date)).toBe(MERCHANT_DAY);
    });

    it('reverses a supplier payment on the merchant day, the document and its entry', async () => {
      const reversal = (await auth(http().post(`/supplier-payments/${supplierPaymentId}/reverse`)).send({}).expect(201)).body as { no: string; date: string; journalEntryId: string };
      expect(day(reversal.date)).toBe(MERCHANT_DAY);
      expect(day((await entryByMemo(reversal.no, 'عكس سداد لمورّد')).date)).toBe(MERCHANT_DAY);
    });

    it('posts a supplier payment reallocation on the merchant day', async () => {
      await auth(http().post(`/supplier-payments/${usdPayment.id}/allocate`)).send({ allocations: [{ purchaseId: usdPurchaseId, amount: 100 }] }).expect(201);
      expect(day((await entryByMemo(usdPayment.no, 'إعادة توزيع سداد لمورّد')).date)).toBe(MERCHANT_DAY);
    });
  });
});
