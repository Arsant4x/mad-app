import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: about three times the measured run, declared here rather than assumed.
jest.setTimeout(240000);

/**
 * What a payment may still settle on a document: its total less the credit notes issued on it and
 * what was already allocated to it, and only on a document that carries a balance. Both sides share
 * one settlement path, so each case runs for supplier payments and for customer collections.
 */
describe('Settlement after credit notes (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let branchId: string;
  let cashBoxId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const today = () => new Date().toISOString().slice(0, 10);

  const newSupplier = async (tag: string): Promise<string> =>
    (await auth(http().post('/suppliers')).send({ name: `Supplier ${tag} ${suffix}` }).expect(201)).body.id;
  const newCustomer = async (tag: string): Promise<string> =>
    (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `Customer ${tag} ${suffix}` }).expect(201)).body.id;

  /** An exempt purchase with no lines: its total is exactly what reaches 2100. */
  const makePurchase = async (supplierId: string, total: number): Promise<{ id: string; no: string }> => {
    const res = await auth(http().post('/purchases'))
      .send({ supplierId, branchId, date: today(), category: `Item ${suffix}`, subtotal: total, exempt: true })
      .expect(201);
    return { id: res.body.id, no: res.body.no };
  };

  const supplierNote = async (purchaseId: string, side: 'credit' | 'debit', amount: number): Promise<{ id: string; no: string }> => {
    const res = await auth(http().post(`/purchases/${purchaseId}/supplier-${side}-note`))
      .send({ reason: `Supplier ${side} note ${suffix}`, lines: [{ description: 'Adjustment', quantity: 1, unitPrice: amount }] })
      .expect(201);
    return { id: res.body.id, no: res.body.no };
  };

  const purchaseRow = async (id: string) => {
    const rows = (await auth(http().get('/purchases')).expect(200)).body as { id: string; status: string; remaining: string }[];
    return rows.find((r) => r.id === id)!;
  };

  const openPurchases = async (supplierId: string) =>
    (await auth(http().get(`/supplier-payments/open-purchases/${supplierId}`)).expect(200)).body as { id: string; remaining: string }[];

  const paySupplier = (supplierId: string, amount: number, allocations: { purchaseId: string; amount: number }[]) =>
    auth(http().post('/supplier-payments')).send({ supplierId, branchId, date: today(), amount, method: 'CASH', bankId: cashBoxId, allocations });

  /** An exempt invoice line, so the total is exactly the price. */
  const exemptLine = (price: number) => [{ description: `Line ${suffix}`, quantity: 1, unitPrice: price, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }];

  const makeInvoice = async (customerId: string, total: number): Promise<{ id: string; no: string }> => {
    const res = await auth(http().post('/invoices')).send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: exemptLine(total) }).expect(201);
    return { id: res.body.id, no: res.body.no };
  };

  const customerNote = async (invoiceId: string, side: 'credit' | 'debit', amount: number): Promise<{ id: string; no: string }> => {
    const res = await auth(http().post(`/invoices/${invoiceId}/${side}-note`)).send({ issueDate: today(), reason: `Customer ${side} note ${suffix}`, lines: exemptLine(amount) }).expect(201);
    return { id: res.body.id, no: res.body.no };
  };

  const invoiceRow = async (id: string) => {
    const rows = (await auth(http().get('/invoices')).expect(200)).body as { id: string; status: string; outstanding: string }[];
    return rows.find((r) => r.id === id)!;
  };

  const openInvoices = async (customerId: string) =>
    (await auth(http().get(`/payments/open-invoices/${customerId}`)).expect(200)).body as { id: string; remaining: string }[];

  const collect = (customerId: string, amount: number, allocations: { invoiceId: string; amount: number }[], extra: Record<string, unknown> = {}) =>
    auth(http().post('/payments')).send({ customerId, branchId, date: today(), amount, method: 'CASH', bankId: cashBoxId, allocations, ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'settle-notes');
    token = company.token;
    branchId = (await auth(http().post('/branches')).send({ name: `Branch ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(http().post('/banks')).send({ name: `Box ${suffix}`, kind: 'CASH_BOX', openingBalance: 100000, openingDate: today(), branchId }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  describe('supplier payments', () => {
    it('a purchase of 1000 with a supplier credit note of 400 takes no more than 600', async () => {
      const supplierId = await newSupplier('credited');
      const purchase = await makePurchase(supplierId, 1000);
      await supplierNote(purchase.id, 'credit', 400);

      const over = await paySupplier(supplierId, 1000, [{ purchaseId: purchase.id, amount: 1000 }]);
      expect(over.status).toBe(400);
      expect(String(over.body.message)).toContain('600.00');
      expect((await openPurchases(supplierId)).find((p) => p.id === purchase.id)?.remaining).toBe('600.00');

      await paySupplier(supplierId, 600, [{ purchaseId: purchase.id, amount: 600 }]).expect(201);
      expect(await purchaseRow(purchase.id)).toMatchObject({ status: 'PAID', remaining: '0.00' });
    });

    it('a supplier payment cannot be allocated onto a supplier credit note', async () => {
      const supplierId = await newSupplier('onto-note');
      const purchase = await makePurchase(supplierId, 1000);
      const note = await supplierNote(purchase.id, 'credit', 400);

      const res = await paySupplier(supplierId, 400, [{ purchaseId: note.id, amount: 400 }]);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain(note.no);
    });

    it('a voided purchase takes no new allocation', async () => {
      const supplierId = await newSupplier('voided');
      const purchase = await makePurchase(supplierId, 500);
      await auth(http().delete(`/purchases/${purchase.id}`)).expect(204);

      const res = await paySupplier(supplierId, 500, [{ purchaseId: purchase.id, amount: 500 }]);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain(purchase.no);
    });

    it('a purchase fully credited by its supplier reads PAID and leaves the open list', async () => {
      const supplierId = await newSupplier('fully-credited');
      const purchase = await makePurchase(supplierId, 300);
      await supplierNote(purchase.id, 'credit', 300);

      expect(await purchaseRow(purchase.id)).toMatchObject({ status: 'PAID', remaining: '0.00' });
      expect((await openPurchases(supplierId)).some((p) => p.id === purchase.id)).toBe(false);
    });

    it('a supplier debit note is still paid on its own', async () => {
      const supplierId = await newSupplier('debited');
      const purchase = await makePurchase(supplierId, 200);
      const note = await supplierNote(purchase.id, 'debit', 50);

      await paySupplier(supplierId, 50, [{ purchaseId: note.id, amount: 50 }]).expect(201);
      expect(await purchaseRow(note.id)).toMatchObject({ status: 'PAID', remaining: '0.00' });
      expect(await purchaseRow(purchase.id)).toMatchObject({ status: 'DUE', remaining: '200.00' });
    });
  });

  describe('customer collections', () => {
    it('an invoice of 1000 with a credit note of 400 takes no more than 600', async () => {
      const customerId = await newCustomer('credited');
      const invoice = await makeInvoice(customerId, 1000);
      await customerNote(invoice.id, 'credit', 400);

      expect((await openInvoices(customerId)).find((i) => i.id === invoice.id)?.remaining).toBe('600.00');
      const over = await collect(customerId, 1000, [{ invoiceId: invoice.id, amount: 1000 }]);
      expect(over.status).toBe(400);
      expect(String(over.body.message)).toContain('600.00');

      await collect(customerId, 600, [{ invoiceId: invoice.id, amount: 600 }]).expect(201);
      expect(await invoiceRow(invoice.id)).toMatchObject({ status: 'PAID', outstanding: '0.00' });
    });

    it('a collection cannot be allocated onto a credit note', async () => {
      const customerId = await newCustomer('onto-note');
      const invoice = await makeInvoice(customerId, 1000);
      const note = await customerNote(invoice.id, 'credit', 400);

      const res = await collect(customerId, 400, [{ invoiceId: note.id, amount: 400 }]);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain(note.no);
    });

    it('an invoice fully credited reads PAID and leaves the open list', async () => {
      const customerId = await newCustomer('fully-credited');
      const invoice = await makeInvoice(customerId, 300);
      await customerNote(invoice.id, 'credit', 300);

      expect((await invoiceRow(invoice.id)).status).toBe('PAID');
      expect((await openInvoices(customerId)).some((i) => i.id === invoice.id)).toBe(false);
    });

    it('an on-account remainder is covered only by what is left after credit notes', async () => {
      const customerId = await newCustomer('on-account');
      const invoice = await makeInvoice(customerId, 1000);
      await customerNote(invoice.id, 'credit', 400);

      const uncovered = await collect(customerId, 1000, [], { unallocated: 'ON_ACCOUNT' });
      expect(uncovered.status).toBe(400);
      expect(String(uncovered.body.message)).toContain('600.00');
      await collect(customerId, 600, [], { unallocated: 'ON_ACCOUNT' }).expect(201);
    });

    it('a rejected invoice that was replaced takes no new allocation', async () => {
      const customerId = await newCustomer('replaced');
      const rejected = await makeInvoice(customerId, 500);
      // The authority's rejection is the only way into this state; it is set directly to keep the case local.
      await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.invoice.update({ where: { id: rejected.id }, data: { zatcaStatus: 'REJECTED' } }));
      await auth(http().post(`/invoices/${rejected.id}/replacement`)).send({}).expect(201);

      expect((await openInvoices(customerId)).some((i) => i.id === rejected.id)).toBe(false);
      const res = await collect(customerId, 500, [{ invoiceId: rejected.id, amount: 500 }]);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain(rejected.no);
    });

    it('an applied prepayment document takes no new allocation', async () => {
      const customerId = await newCustomer('prepaid');
      const prepaid = await collect(customerId, 1150, [], { unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } }).expect(201);
      const document = prepaid.body.prepaymentInvoice as { id: string; no: string };
      await auth(http().post('/invoices'))
        .send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'Supply', quantity: 1, unitPrice: 2000, taxRate: 15 }], prepaymentInvoiceIds: [document.id] })
        .expect(201);

      const res = await collect(customerId, 100, [{ invoiceId: document.id, amount: 100 }]);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain(document.no);
    });

    it('a debit note is still collected on its own', async () => {
      const customerId = await newCustomer('debited');
      const invoice = await makeInvoice(customerId, 200);
      const note = await customerNote(invoice.id, 'debit', 50);

      await collect(customerId, 50, [{ invoiceId: note.id, amount: 50 }]).expect(201);
      expect((await invoiceRow(note.id)).status).toBe('PAID');
      expect((await invoiceRow(invoice.id)).status).toBe('DUE');
    });

    it('receivables aging subtracts a collection allocated onto a debit note', async () => {
      const customerId = await newCustomer('aging');
      const invoice = await makeInvoice(customerId, 1000);
      const note = await customerNote(invoice.id, 'debit', 200);
      await collect(customerId, 200, [{ invoiceId: note.id, amount: 200 }]).expect(201);

      const aging = (await auth(http().get(`/reports/receivables-aging?customerId=${customerId}`)).expect(200)).body as { rows: { customerId: string; total: string }[] };
      expect(aging.rows.find((r) => r.customerId === customerId)?.total).toBe('1000.00');
    });
  });
});
