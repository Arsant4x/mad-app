import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared here rather than assumed.
jest.setTimeout(150000);

/**
 * The cash a shift expects in its drawer is the opening float plus every posting on the drawer account
 * while the shift is open: sales, cash refunds and deposits alike. Each case reads the drawer balance
 * from the ledger, so a close that posts a false variance shows up as a moved balance.
 */
describe('POS expected drawer cash follows the drawer ledger (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let cashierToken: string;
  let cashierUserId: string;
  let cashierTemplateId: string;
  let productId: string;
  let drawer = { id: '', accountId: '' };
  let bankId = '';
  let bareBranchId = '';
  const stamp = Date.now();
  const today = () => new Date().toISOString().slice(0, 10);

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const asCashier = (r: request.Test) => r.set('Authorization', `Bearer ${cashierToken}`);

  const balanceOf = async (accountId: string): Promise<number> => {
    const account = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.account.findUniqueOrThrow({ where: { id: accountId }, select: { balance: true } }),
    );
    return Number(account.balance);
  };
  const codeBalance = async (code: string): Promise<number> => {
    const account = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.account.findFirst({ where: { code }, select: { balance: true } }),
    );
    return Number(account?.balance ?? 0);
  };

  /** Price 100 at 15% VAT: one unit rings 115.00. */
  const ringCash = (quantity: number, as = auth) =>
    as(http().post('/pos/sales')).send({ paymentMethod: 'CASH', lines: [{ productId, quantity }] }).expect(201);

  const refundCash = async (saleId: string) => {
    const note = (await auth(http().post(`/invoices/${saleId}/credit-note`)).send({ reason: `refund ${stamp}` }).expect(201)).body as { id: string };
    await auth(http().post('/payments/refund')).send({ creditNoteId: note.id, method: 'CASH', date: today() }).expect(201);
  };

  const current = async (as = auth) => (await as(http().get('/pos/shifts/current')).expect(200)).body.shift as { id: string; expectedCash: string; cashTotal: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'pos-expected');
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `expected cash item ${stamp}`, price: 100 }).expect(201)).body.id;
    const created = (await auth(http().post('/cash-drawers')).send({ name: `drawer ${stamp}` }).expect(201)).body as { id: string; account: { id: string } };
    drawer = { id: created.id, accountId: created.account.id };
    bankId = (await auth(http().post('/banks')).send({ name: `bank ${stamp}`, kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body.id;
    bareBranchId = (await auth(http().post('/branches')).send({ name: `branch without drawer ${stamp}` }).expect(201)).body.id;

    cashierTemplateId = (
      await auth(http().post('/templates')).send({ name: `expected cash cashier ${stamp}`, isAllScreens: false, allowedScreens: ['pos'], screenActions: { pos: ['view', 'record'] } }).expect(201)
    ).body.id;
    cashierUserId = (
      await auth(http().post('/company-users')).send({ name: 'Expected cash cashier', username: `expected-cashier-${stamp}`, password: 'CashierPass123!', permissionTemplateId: cashierTemplateId }).expect(201)
    ).body.id;
    cashierToken = (await http().post('/auth/login').send({ username: `expected-cashier-${stamp}`, password: 'CashierPass123!' })).body.accessToken;
    expect(typeof cashierToken).toBe('string');
  });

  // A case that fails mid-way leaves its shift open; close it so the next case starts from no open shift.
  afterEach(async () => {
    for (const as of [auth, asCashier]) {
      const open = await current(as);
      if (open) await auth(http().post(`/pos/shifts/${open.id}/close`)).send({ declaredClosing: Number(open.expectedCash) });
    }
  });

  afterAll(async () => {
    await auth(http().delete(`/company-users/${cashierUserId}`));
    await auth(http().delete(`/templates/${cashierTemplateId}`));
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('a cash refund in the same shift lowers the expected cash, and a full count closes with no variance', async () => {
    const drawerBefore = await balanceOf(drawer.accountId);
    const varianceBefore = await codeBalance('5900');
    const shift = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0, drawerId: drawer.id }).expect(201)).body as { id: string };

    const sale = (await ringCash(1)).body as { id: string };
    await refundCash(sale.id);

    expect((await current()).expectedCash).toBe('0.00');
    const closed = await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 0 }).expect(201);
    expect(closed.body.variance).toBe('0.00');
    expect(closed.body.expectedCash).toBe('0.00');
    expect(await codeBalance('5900')).toBe(varianceBefore);
    expect(await balanceOf(drawer.accountId)).toBe(drawerBefore);

    // The closed shift keeps the expected cash it was closed against.
    const listed = (await auth(http().get('/pos/shifts')).expect(200)).body as { id: string; expectedCash: string }[];
    expect(listed.find((s) => s.id === shift.id)?.expectedCash).toBe('0.00');
  });

  it('a deposit taken from the drawer during the shift lowers the expected cash', async () => {
    const shift = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0, drawerId: drawer.id }).expect(201)).body as { id: string };
    await ringCash(2); // 230.00
    await auth(http().post('/banks/cash-deposits')).send({ drawerId: drawer.id, bankId, amount: 100, date: today() }).expect(201);

    expect((await current()).expectedCash).toBe('130.00');
    const closed = await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 130 }).expect(201);
    expect(closed.body.variance).toBe('0.00');
  });

  it('a shift without a drawer subtracts its own cash refunds', async () => {
    const shift = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0, branchId: bareBranchId }).expect(201)).body as { id: string; drawerId: string | null };
    expect(shift.drawerId).toBeNull();
    const cashBefore = await codeBalance('1000');

    const sale = (await ringCash(1)).body as { id: string };
    await refundCash(sale.id);

    expect((await current()).expectedCash).toBe('0.00');
    const closed = await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 0 }).expect(201);
    expect(closed.body.variance).toBe('0.00');
    expect(await codeBalance('1000')).toBe(cashBefore);
  });

  it('two shifts open on one drawer each count only their own sales, refunds and variance', async () => {
    const ownerShift = (await auth(http().post('/pos/shifts')).send({ openingFloat: 10, drawerId: drawer.id }).expect(201)).body as { id: string };
    const cashierShift = (await asCashier(http().post('/pos/shifts')).send({ openingFloat: 20, drawerId: drawer.id }).expect(201)).body as { id: string };

    const ownerSale = (await ringCash(1)).body as { id: string }; // 115.00
    await ringCash(2, asCashier); // 230.00
    await refundCash(ownerSale.id);

    expect((await current()).expectedCash).toBe('10.00');
    expect((await current(asCashier)).expectedCash).toBe('250.00');

    // The owner counts 3 short; that shortage is the owner's, not the cashier's.
    const ownerClosed = await auth(http().post(`/pos/shifts/${ownerShift.id}/close`)).send({ declaredClosing: 7 }).expect(201);
    expect(ownerClosed.body.variance).toBe('-3.00');
    expect((await current(asCashier)).expectedCash).toBe('250.00');

    const cashierClosed = await auth(http().post(`/pos/shifts/${cashierShift.id}/close`)).send({ declaredClosing: 250 }).expect(201);
    expect(cashierClosed.body.variance).toBe('0.00');
  });
});
