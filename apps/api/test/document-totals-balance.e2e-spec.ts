import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { round2, toHalalas } from '../src/common/money/rounding';
import { computeDocumentTotals } from '../src/common/money/totals';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Suite budget: one isolated company and about thirty requests.
jest.setTimeout(300000);

/**
 * Every document stores totals that are the sum of their parts, in its own currency and in the
 * company's base currency, so the entry it posts (the total against the net and the tax) balances to
 * the halala. The base total stays the document total at its rate, which is what a payment at that
 * rate settles, so a fully paid document leaves nothing on the party's account. A foreign currency
 * invoice of 1000.06 at 3.75 and a purchase of 100.30 are the two amounts that used to be refused.
 */
const FX = 'USD';
const RATE = 3.75;
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Stored = {
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  baseSubtotal: Prisma.Decimal;
  baseTax: Prisma.Decimal;
  baseTotal: Prisma.Decimal;
  entry: { totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal } | null;
};

const h = (d: Prisma.Decimal | number) => toHalalas(Number(d));

/** The three relations every stored document must satisfy. */
function balanceOf(s: Stored) {
  return {
    totalIsSumOfParts: h(s.subtotal) + h(s.tax) === h(s.total),
    baseTotalIsSumOfParts: h(s.baseSubtotal) + h(s.baseTax) === h(s.baseTotal),
    entryBalancedOnBaseTotal: s.entry !== null && h(s.entry.totalDebit) === h(s.entry.totalCredit) && h(s.entry.totalDebit) === h(s.baseTotal),
  };
}
const BALANCED = { totalIsSumOfParts: true, baseTotalIsSumOfParts: true, entryBalancedOnBaseTotal: true };

describe('Document totals balance in document and base currency (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = iso(new Date());

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);
  const line = (unitPrice: number, quantity = 1) => ({ description: `item ${suffix}`, quantity, unitPrice, taxRate: 15, taxCategory: 'S' });

  let customerId: string;
  let supplierId: string;
  let cashBoxId: string;

  const storedInvoice = (id: string): Promise<Stored> =>
    inTenant(async (tx) => {
      const i = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { journalEntry: { select: { totalDebit: true, totalCredit: true } } } });
      return { subtotal: i.subtotal, tax: i.taxTotal, total: i.total, baseSubtotal: i.baseSubtotal, baseTax: i.baseTaxTotal, baseTotal: i.baseTotal, entry: i.journalEntry };
    });

  const storedPurchase = (id: string): Promise<Stored> =>
    inTenant(async (tx) => {
      const p = await tx.purchase.findUniqueOrThrow({ where: { id }, include: { journalEntry: { select: { totalDebit: true, totalCredit: true } } } });
      return { subtotal: p.subtotal, tax: p.taxAmount, total: p.total, baseSubtotal: p.baseSubtotal, baseTax: p.baseTaxAmount, baseTotal: p.baseTotal, entry: p.journalEntry };
    });

  /** What the party still carries on a control account: debits less credits on its lines. */
  const partyBalance = (party: { customerId: string } | { supplierId: string }, code: '1200' | '2100') =>
    inTenant(async (tx) => {
      const s = await tx.journalLine.aggregate({ where: { ...party, account: { code } }, _sum: { debit: true, credit: true } });
      return round2(Number(s._sum.debit ?? 0) - Number(s._sum.credit ?? 0));
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'doc-totals');
    customerId = await createTenantCustomer(app, company.token, `totals customer ${suffix}`);
    supplierId = (await auth(http().post('/suppliers')).send({ name: `totals supplier ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(http().post('/banks')).send({ name: `totals cash box ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('a foreign currency invoice of 1000.06 at 3.75 is issued and its entry balances', async () => {
    const res = await auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, currency: FX, exchangeRate: RATE, lines: [line(1000.06)] });
    expect({ status: res.status, message: res.body.message }).toEqual({ status: 201, message: undefined });
    const stored = await storedInvoice(res.body.id);
    expect(balanceOf(stored)).toEqual(BALANCED);
    // The tax in SAR is the tax converted (the figure the authority receives); the total is the total converted.
    expect([String(stored.baseSubtotal), String(stored.baseTax), String(stored.baseTotal)]).toEqual(['3750.22', '562.54', '4312.76']);
  });

  it('a foreign currency invoice paid in full at its rate leaves nothing on the customer', async () => {
    const buyer = await createTenantCustomer(app, company.token, `paid buyer ${suffix}`);
    const invoice = await auth(http().post('/invoices')).send({ customerId: buyer, issueDate: today, dueDate: today, currency: FX, exchangeRate: RATE, lines: [line(1000.06)] });
    expect({ status: invoice.status, message: invoice.body.message }).toEqual({ status: 201, message: undefined });
    const total = Number(invoice.body.total);
    await auth(http().post('/payments'))
      .send({ customerId: buyer, date: today, amount: total, method: 'CASH', bankId: cashBoxId, currency: FX, exchangeRate: RATE, allocations: [{ invoiceId: invoice.body.id, amount: total }] })
      .expect(201);
    const aging = (await auth(http().get('/reports/receivables-aging')).expect(200)).body as { rows: { customerId: string; total: string }[] };
    expect({ receivable: await partyBalance({ customerId: buyer }, '1200'), agingRow: aging.rows.find((r) => r.customerId === buyer)?.total ?? null }).toEqual({ receivable: 0, agingRow: null });
  });

  it('credit and debit notes of 1000.06 on a foreign currency invoice are issued and balance', async () => {
    const original = await auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, currency: FX, exchangeRate: RATE, lines: [line(2000)] }).expect(201);
    expect(balanceOf(await storedInvoice(original.body.id))).toEqual(BALANCED);

    const credit = await auth(http().post(`/invoices/${original.body.id}/credit-note`)).send({ reason: `price correction ${suffix}`, issueDate: today, lines: [line(1000.06)] });
    expect({ status: credit.status, message: credit.body.message }).toEqual({ status: 201, message: undefined });
    expect(balanceOf(await storedInvoice(credit.body.id))).toEqual(BALANCED);

    const debit = await auth(http().post(`/invoices/${original.body.id}/debit-note`)).send({ reason: `extra billing ${suffix}`, issueDate: today, lines: [line(1000.06)] });
    expect({ status: debit.status, message: debit.body.message }).toEqual({ status: 201, message: undefined });
    expect(balanceOf(await storedInvoice(debit.body.id))).toEqual(BALANCED);
  });

  it('a foreign currency prepayment of 1150.07 at 3.75 is issued, balances and leaves nothing on the customer', async () => {
    const payer = await createTenantCustomer(app, company.token, `prepaying buyer ${suffix}`);
    const res = await auth(http().post('/payments')).send({
      customerId: payer,
      date: today,
      amount: 1150.07,
      method: 'CASH',
      bankId: cashBoxId,
      currency: FX,
      exchangeRate: RATE,
      unallocated: 'PREPAYMENT',
      prepaymentTax: { taxCategory: 'S' },
    });
    expect({ status: res.status, message: res.body.message }).toEqual({ status: 201, message: undefined });
    expect(balanceOf(await storedInvoice(res.body.prepaymentInvoice.id))).toEqual(BALANCED);
    // The receipt credits 1200 with the amount at its rate and the prepayment document debits it back.
    expect(await partyBalance({ customerId: payer }, '1200')).toBe(0);
  });

  it('a purchase of 100.30 is recorded with its tax rounded once and its entry balances', async () => {
    const res = await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 100.3 });
    expect({ status: res.status, message: res.body.message }).toEqual({ status: 201, message: undefined });
    const stored = await storedPurchase(res.body.id);
    expect(balanceOf(stored)).toEqual(BALANCED);
    // The purchase takes its totals from the one document totals function.
    const expected = computeDocumentTotals([{ quantity: 1, unitPrice: 100.3, taxRate: 15 }]);
    expect([Number(stored.subtotal), Number(stored.tax), Number(stored.total)]).toEqual([expected.subtotal, expected.taxTotal, expected.total]);
  });

  it('a foreign currency purchase of 1000.10 at 3.75 is recorded, balances and is cleared by a payment at its rate', async () => {
    const vendor = (await auth(http().post('/suppliers')).send({ name: `paid supplier ${suffix}` }).expect(201)).body.id as string;
    const res = await auth(http().post('/purchases')).send({ supplierId: vendor, date: today, subtotal: 1000.1, currency: FX, exchangeRate: RATE });
    expect({ status: res.status, message: res.body.message }).toEqual({ status: 201, message: undefined });
    expect(balanceOf(await storedPurchase(res.body.id))).toEqual(BALANCED);
    const total = Number(res.body.total);
    await auth(http().post('/supplier-payments'))
      .send({ supplierId: vendor, date: today, amount: total, method: 'CASH', bankId: cashBoxId, currency: FX, exchangeRate: RATE, allocations: [{ purchaseId: res.body.id, amount: total }] })
      .expect(201);
    expect(await partyBalance({ supplierId: vendor }, '2100')).toBe(0);
  });

  it('a purchase edited to 100.30 is re-posted with a balanced entry', async () => {
    const original = await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 50 }).expect(201);
    const edited = await auth(http().patch(`/purchases/${original.body.id}`)).send({ subtotal: 100.3 });
    expect({ status: edited.status, message: edited.body.message }).toEqual({ status: 200, message: undefined });
    expect(balanceOf(await storedPurchase(original.body.id))).toEqual(BALANCED);
  });

  it('a supplier credit note of 100.30 stores a total equal to its net plus tax', async () => {
    const original = await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 200 }).expect(201);
    const note = await auth(http().post(`/purchases/${original.body.id}/supplier-credit-note`)).send({
      reason: `price correction ${suffix}`,
      date: today,
      lines: [{ description: `correction ${suffix}`, quantity: 1, unitPrice: 100.3 }],
    });
    expect({ status: note.status, message: note.body.message }).toEqual({ status: 201, message: undefined });
    expect(balanceOf(await storedPurchase(note.body.id))).toEqual(BALANCED);
  });

  it('a foreign currency quote of 1000.06 at 3.75 stores base totals equal to the invoice it becomes', async () => {
    const res = await auth(http().post('/quotes')).send({ customerId, issueDate: today, validUntil: today, currency: FX, exchangeRate: RATE, lines: [line(1000.06)] }).expect(201);
    const quote = await inTenant((tx) => tx.quote.findUniqueOrThrow({ where: { id: res.body.id } }));
    expect({
      totalIsSumOfParts: h(quote.subtotal) + h(quote.taxTotal) === h(quote.total),
      baseTotalIsSumOfParts: h(quote.baseSubtotal) + h(quote.baseTaxTotal) === h(quote.baseTotal),
    }).toEqual({ totalIsSumOfParts: true, baseTotalIsSumOfParts: true });

    const converted = await auth(http().post(`/quotes/${res.body.id}/convert`)).send({});
    expect({ status: converted.status, message: converted.body.message }).toEqual({ status: 201, message: undefined });
    const invoice = await storedInvoice(converted.body.invoice.id as string);
    expect(balanceOf(invoice)).toEqual(BALANCED);
    expect(String(invoice.baseTotal)).toBe(String(quote.baseTotal));
  });
});
