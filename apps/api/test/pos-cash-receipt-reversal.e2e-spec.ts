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
 * Reversing a receipt credits the account the receipt debited. A POS cash sale on a shift with a drawer debits
 * the drawer account, so its reversal takes the cash back out of the drawer, not out of 1000. A manual cash
 * receipt with no cash box debits 1000 and its reversal still credits 1000.
 */
describe('Reversing a receipt credits the account it debited (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let productId: string;
  let customerId: string;
  let drawer = { id: '', accountId: '' };
  const stamp = Date.now();
  // The company's day in Riyadh, so a run between 21:00 and 24:00 UTC dates documents on the same day as the server.
  const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  const balanceOf = async (accountId: string): Promise<number> => {
    const account = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.account.findUniqueOrThrow({ where: { id: accountId }, select: { balance: true } }));
    return Number(account.balance);
  };
  const codeBalance = async (code: string): Promise<number> => {
    const account = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.account.findFirst({ where: { code }, select: { balance: true } }));
    return Number(account?.balance ?? 0);
  };
  /** The cash side of a receipt entry: the line that is not the receivable. */
  const cashLineOf = async (paymentId: string) =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { journalEntryId: true } });
      const lines = await tx.journalLine.findMany({ where: { journalEntryId: payment.journalEntryId! }, include: { account: { select: { code: true } } } });
      return lines.filter((l) => l.account.code !== '1200').map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) }));
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'receipt-reversal');
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `reversal item ${stamp}`, price: 100 }).expect(201)).body.id;
    const created = (await auth(http().post('/cash-drawers')).send({ name: `drawer ${stamp}` }).expect(201)).body as { id: string; account: { id: string } };
    drawer = { id: created.id, accountId: created.account.id };
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `reversal customer ${stamp}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    const open = (await auth(http().get('/pos/shifts/current')).expect(200)).body.shift as { id: string; expectedCash: string } | null;
    if (open) await auth(http().post(`/pos/shifts/${open.id}/close`)).send({ declaredClosing: Number(open.expectedCash) });
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('a POS cash receipt reversed in its shift takes the cash out of the drawer, not out of 1000', async () => {
    const shift = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0, drawerId: drawer.id }).expect(201)).body as { id: string };
    const sale = (await auth(http().post('/pos/sales')).send({ paymentMethod: 'CASH', lines: [{ productId, quantity: 1 }] }).expect(201)).body as { id: string };
    const receipt = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.payment.findFirstOrThrow({ where: { reversesId: null, method: 'CASH', allocations: { some: { invoiceId: sale.id } } }, select: { id: true } }),
    );
    expect(await cashLineOf(receipt.id)).toEqual([{ accountId: drawer.accountId, debit: 115, credit: 0 }]);

    const drawerBefore = await balanceOf(drawer.accountId);
    const cashBefore = await codeBalance('1000');
    const reversal = (await auth(http().post(`/payments/${receipt.id}/reverse`)).send({ reason: `reversal ${stamp}` }).expect(201)).body as { id: string };

    expect(await cashLineOf(reversal.id)).toEqual([{ accountId: drawer.accountId, debit: 0, credit: 115 }]);
    expect(await balanceOf(drawer.accountId)).toBe(drawerBefore - 115);
    expect(await codeBalance('1000')).toBe(cashBefore);

    // The drawer now expects what the shift holds without the reversed sale, so a full count closes clean.
    const current = (await auth(http().get('/pos/shifts/current')).expect(200)).body.shift as { expectedCash: string };
    expect(current.expectedCash).toBe('0.00');
    const closed = await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 0 }).expect(201);
    expect(closed.body.variance).toBe('0.00');
  });

  it('a manual cash receipt with no cash box is still reversed out of 1000', async () => {
    const invoice = (
      await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today(), dueDate: today(), lines: [{ description: `line ${stamp}`, quantity: 1, unitPrice: 200, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
        .expect(201)
    ).body as { id: string };
    const receipt = (
      await auth(http().post('/payments')).send({ customerId, date: today(), amount: 200, method: 'CASH', allocations: [{ invoiceId: invoice.id, amount: 200 }] }).expect(201)
    ).body as { id: string };
    const cashAccountId = (await cashLineOf(receipt.id))[0].accountId;

    const drawerBefore = await balanceOf(drawer.accountId);
    const cashBefore = await codeBalance('1000');
    const reversal = (await auth(http().post(`/payments/${receipt.id}/reverse`)).send({ reason: `manual reversal ${stamp}` }).expect(201)).body as { id: string };

    expect(await cashLineOf(reversal.id)).toEqual([{ accountId: cashAccountId, debit: 0, credit: 200 }]);
    expect(await codeBalance('1000')).toBe(cashBefore - 200);
    expect(await balanceOf(drawer.accountId)).toBe(drawerBefore);
  });
});
