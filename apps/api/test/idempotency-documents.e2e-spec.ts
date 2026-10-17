import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma } from '@mad-app/db';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Suite budget: a first estimate, to be set to three times the first time measured in CI.
jest.setTimeout(240000);

/**
 * The Idempotency-Key header on every route that writes a document or a posting.
 *
 * A request sent twice with one key (a double click, or a retry after a timeout whose answer never came) writes one document and
 * the second answer is that document; the same key with another request is refused with a named 409; a malformed key with 400;
 * and a request without a key behaves as it always did. The point of sale, which keys its sales by the terminal's sale id, now
 * refuses a known sale id that arrives with a different sale instead of answering with the first one.
 */
const today = () => new Date().toISOString().slice(0, 10);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('Idempotency-Key on document and posting routes (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const key = (tag: string) => `e2e-${tag}-${suffix}-${++seq}`;
  const marker = (tag: string) => `${tag} ${suffix} ${++seq}`;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const keyed = (r: request.Test, k?: string) => (k ? auth(r).set('Idempotency-Key', k) : auth(r));
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);

  let customerId: string;
  let supplierId: string;
  let warehouseId: string;
  let productId: string;
  let accounts: Record<string, string>;

  const exemptLine = (description: string, unitPrice: number) => ({
    description,
    quantity: 1,
    unitPrice,
    taxRate: 0,
    taxCategory: 'E',
    taxExemptionReasonCode: 'VATEX-SA-29',
  });
  const invoiceBody = (description: string, unitPrice = 100) => ({ customerId, issueDate: today(), dueDate: today(), lines: [exemptLine(description, unitPrice)] });
  const makeInvoice = async (unitPrice = 100): Promise<string> => (await auth(http().post('/invoices')).send(invoiceBody(marker('base invoice'), unitPrice)).expect(201)).body.id as string;

  const newProduct = async (tag: string): Promise<string> =>
    (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: marker(tag), price: 100, cost: 40 }).expect(201)).body.id as string;
  const stockIn = (product: string, qty: number) =>
    auth(http().post('/inventory/movements')).send({ productId: product, warehouseId, type: 'IN', qty, unitCost: 10, date: today(), reason: `stock for the test ${suffix}` }).expect(201);

  const newContract = async (tag: string): Promise<{ id: string }> => {
    const property = (await auth(http().post('/properties')).send({ name: marker(`property ${tag}`), ownership: 'owned' }).expect(201)).body.id as string;
    const unit = (await auth(http().post('/units')).send({ propertyId: property, unitNo: marker(tag), type: 'سكني', rentMonthly: 1000 }).expect(201)).body.id as string;
    return (
      await auth(http().post('/contracts'))
        .send({
          unitId: unit,
          customerId: await createTenantCustomer(app, token, marker(`tenant ${tag}`)),
          value: 12000,
          cycle: 'monthly',
          start: today(),
          end: iso(new Date(Date.now() + 360 * 86_400_000)),
          classification: 'RESIDENTIAL',
          vatInclusion: 'EXCLUSIVE',
        })
        .expect(201)
    ).body as { id: string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'idempotency-documents');
    token = company.token;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: marker('customer') }).expect(201)).body.id;
    supplierId = (await auth(http().post('/suppliers')).send({ name: marker('supplier') }).expect(201)).body.id;
    warehouseId = (await auth(http().post('/warehouses')).send({ name: marker('warehouse') }).expect(201)).body.id;
    productId = await newProduct('product');
    const chart = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    accounts = Object.fromEntries(chart.map((a) => [a.code, a.id]));
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  /** The same request twice under one key: both answers carry the first document. */
  const sentTwice = async (send: (k: string) => request.Test) => {
    const k = key('twice');
    const first = await send(k);
    expect(first.status).toBe(201);
    const second = await send(k);
    expect([200, 201]).toContain(second.status);
    return { first: first.body, second: second.body };
  };

  describe('invoices', () => {
    it('an invoice posted twice with one key is written once', async () => {
      const description = marker('invoice');
      const { first, second } = await sentTwice((k) => keyed(http().post('/invoices'), k).send(invoiceBody(description)));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.invoice.count({ where: { lines: { some: { description } } } }))).toBe(1);
    });

    it('two invoice posts sent together with one key write one invoice', async () => {
      const description = marker('invoice race');
      const k = key('race');
      const [a, b] = await Promise.all([keyed(http().post('/invoices'), k).send(invoiceBody(description)), keyed(http().post('/invoices'), k).send(invoiceBody(description))]);
      expect([200, 201]).toContain(a.status);
      expect([200, 201]).toContain(b.status);
      expect(a.body.id).toBe(b.body.id);
      expect(await inTenant((tx) => tx.invoice.count({ where: { lines: { some: { description } } } }))).toBe(1);
    });

    it('a key reused for a different invoice is refused with 409 and writes nothing', async () => {
      const k = key('reuse');
      const description = marker('invoice reuse');
      await keyed(http().post('/invoices'), k).send(invoiceBody(description, 100)).expect(201);
      const reused = await keyed(http().post('/invoices'), k).send(invoiceBody(description, 250)).expect(409);
      expect(String(reused.body.message)).toContain('Idempotency-Key');
      expect(await inTenant((tx) => tx.invoice.count({ where: { lines: { some: { description } } } }))).toBe(1);
    });

    it('a key already used on another route is refused with 409 and writes nothing there', async () => {
      const k = key('cross');
      await keyed(http().post('/invoices'), k).send(invoiceBody(marker('invoice cross'))).expect(201);
      const description = marker('quote cross');
      await keyed(http().post('/quotes'), k).send({ customerId, issueDate: today(), validUntil: today(), lines: [{ description, quantity: 1, unitPrice: 50, taxRate: 15 }] }).expect(409);
      expect(await inTenant((tx) => tx.quote.count({ where: { lines: { some: { description } } } }))).toBe(0);
    });

    it('a malformed key is refused with 400 and writes nothing', async () => {
      const description = marker('invoice malformed');
      await keyed(http().post('/invoices'), 'short').send(invoiceBody(description)).expect(400);
      expect(await inTenant((tx) => tx.invoice.count({ where: { lines: { some: { description } } } }))).toBe(0);
    });

    it('without a key two posts still write two invoices', async () => {
      const description = marker('invoice unkeyed');
      await auth(http().post('/invoices')).send(invoiceBody(description)).expect(201);
      await auth(http().post('/invoices')).send(invoiceBody(description)).expect(201);
      expect(await inTenant((tx) => tx.invoice.count({ where: { lines: { some: { description } } } }))).toBe(2);
    });

    it('a credit note posted twice with one key is written once', async () => {
      const invoiceId = await makeInvoice(100);
      const body = { reason: marker('credit'), lines: [exemptLine(marker('credit line'), 10)] };
      const { first, second } = await sentTwice((k) => keyed(http().post(`/invoices/${invoiceId}/credit-note`), k).send(body));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.invoice.count({ where: { relatedInvoiceId: invoiceId, docType: 'CREDIT_NOTE' } }))).toBe(1);
    });

    it('a debit note posted twice with one key is written once', async () => {
      const invoiceId = await makeInvoice(100);
      const body = { reason: marker('debit'), lines: [exemptLine(marker('debit line'), 10)] };
      const { first, second } = await sentTwice((k) => keyed(http().post(`/invoices/${invoiceId}/debit-note`), k).send(body));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.invoice.count({ where: { relatedInvoiceId: invoiceId, docType: 'DEBIT_NOTE' } }))).toBe(1);
    });

    it('a quote posted twice with one key is written once', async () => {
      const description = marker('quote');
      const { first, second } = await sentTwice((k) =>
        keyed(http().post('/quotes'), k).send({ customerId, issueDate: today(), validUntil: today(), lines: [{ description, quantity: 1, unitPrice: 50, taxRate: 15 }] }),
      );
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.quote.count({ where: { lines: { some: { description } } } }))).toBe(1);
    });

    it('a refund posted twice with one key is written once', async () => {
      const invoiceId = await makeInvoice(100);
      await auth(http().post('/payments')).send({ customerId, date: today(), amount: 100, method: 'CASH', allocations: [{ invoiceId, amount: 100 }] }).expect(201);
      const note = (await auth(http().post(`/invoices/${invoiceId}/credit-note`)).send({ reason: marker('refund credit') }).expect(201)).body.id as string;
      const { first, second } = await sentTwice((k) => keyed(http().post('/payments/refund'), k).send({ creditNoteId: note, date: today(), amount: 10, method: 'CASH' }));
      expect(second.id).toBe(first.id);
    });
  });

  describe('purchases and stock', () => {
    it('a purchase posted twice with one key is written once', async () => {
      const ownSupplier = (await auth(http().post('/suppliers')).send({ name: marker('purchase supplier') }).expect(201)).body.id as string;
      const { first, second } = await sentTwice((k) => keyed(http().post('/purchases'), k).send({ supplierId: ownSupplier, date: today(), subtotal: 40, exempt: true }));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.purchase.count({ where: { supplierId: ownSupplier } }))).toBe(1);
    });

    it('a goods receipt posted twice with one key is written once', async () => {
      const purchase = (
        await auth(http().post('/purchases'))
          .send({ supplierId, date: today(), subtotal: 400, warehouseId, category: 'بضاعة', receiveNow: false, lines: [{ description: marker('stocked'), productId, quantity: 10, unitPrice: 40, taxRate: 15 }] })
          .expect(201)
      ).body as { id: string; lines: { id: string }[] };
      const { first, second } = await sentTwice((k) =>
        keyed(http().post(`/purchases/${purchase.id}/receipts`), k).send({ receivedAt: today(), warehouseId, lines: [{ purchaseLineId: purchase.lines[0].id, quantity: 1 }] }),
      );
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.goodsReceipt.count({ where: { purchaseId: purchase.id } }))).toBe(1);
    });

    it('supplier credit and debit notes posted twice with one key are written once each', async () => {
      const purchaseId = (await auth(http().post('/purchases')).send({ supplierId, date: today(), subtotal: 400, exempt: true }).expect(201)).body.id as string;
      for (const route of ['supplier-credit-note', 'supplier-debit-note']) {
        const body = { reason: marker(route), lines: [{ description: marker(`${route} line`), quantity: 1, unitPrice: 10, taxRate: 0 }] };
        const { first, second } = await sentTwice((k) => keyed(http().post(`/purchases/${purchaseId}/${route}`), k).send(body));
        expect({ route, same: second.id === first.id }).toEqual({ route, same: true });
      }
    });

    it('a stock movement posted twice with one key is written once', async () => {
      const reason = marker('movement');
      const { first, second } = await sentTwice((k) => keyed(http().post('/inventory/movements'), k).send({ productId, warehouseId, type: 'IN', qty: 2, unitCost: 10, date: today(), reason }));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.stockMovement.count({ where: { reason } }))).toBe(1);
    });

    it('a write-off posted twice with one key is written once', async () => {
      const product = await newProduct('write-off product');
      await stockIn(product, 5);
      const body = { productId: product, warehouseId, qty: 1, reasonCode: 'DAMAGE', occurredAt: today(), note: marker('write-off') };
      const { first, second } = await sentTwice((k) => keyed(http().post('/inventory/write-offs'), k).send(body));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.inventoryWriteOff.count({ where: { productId: product } }))).toBe(1);
    });

    it('a stock opening posted twice with one key is written once', async () => {
      const product = await newProduct('opening product');
      const body = { openingDate: today(), lines: [{ productId: product, warehouseId, qty: 3, unitCost: 5, acquiredAt: today(), evidenceRef: marker('opening') }] };
      const { first, second } = await sentTwice((k) => keyed(http().post('/inventory/opening'), k).send(body));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.stockOpeningLine.count({ where: { productId: product } }))).toBe(1);
    });
  });

  describe('banks', () => {
    it('a bank with an opening balance posted twice with one key is written once', async () => {
      const name = marker('bank');
      const { first, second } = await sentTwice((k) => keyed(http().post('/banks'), k).send({ name, kind: 'BANK_ACCOUNT', openingDate: today(), openingBalance: 100 }));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.bank.count({ where: { name } }))).toBe(1);
    });
  });

  describe('journal', () => {
    it('a manual journal entry posted twice with one key is written once', async () => {
      const memo = marker('journal');
      const { first, second } = await sentTwice((k) =>
        keyed(http().post('/journal'), k).send({ date: today(), memo, lines: [{ accountId: accounts['1000'], debit: 75, credit: 0 }, { accountId: accounts['4100'], debit: 0, credit: 75 }] }),
      );
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.journalEntry.count({ where: { memo } }))).toBe(1);
    });
  });

  describe('contracts', () => {
    it('a contract posted twice with one key is written once', async () => {
      const property = (await auth(http().post('/properties')).send({ name: marker('contract property'), ownership: 'owned' }).expect(201)).body.id as string;
      const unitId = (await auth(http().post('/units')).send({ propertyId: property, unitNo: marker('contract unit'), type: 'سكني', rentMonthly: 1000 }).expect(201)).body.id as string;
      const tenantCustomer = await createTenantCustomer(app, token, marker('contract tenant'));
      const body = {
        unitId,
        customerId: tenantCustomer,
        value: 12000,
        cycle: 'monthly',
        start: today(),
        end: iso(new Date(Date.now() + 360 * 86_400_000)),
        classification: 'RESIDENTIAL',
        vatInclusion: 'EXCLUSIVE',
      };
      const { first, second } = await sentTwice((k) => keyed(http().post('/contracts'), k).send(body));
      expect(second.id).toBe(first.id);
      expect(await inTenant((tx) => tx.contract.count({ where: { unitId } }))).toBe(1);
    });

    it('a claim, a deposit, key money and a fee posted twice with one key are written once each', async () => {
      const contract = await newContract('children');
      const claimDescription = marker('claim');
      await sentTwice((k) => keyed(http().post(`/contracts/${contract.id}/claims`), k).send({ kind: 'OTHER', amount: 50, description: claimDescription, issuedAt: today() }));
      const depositNote = marker('deposit');
      await sentTwice((k) => keyed(http().post(`/contracts/${contract.id}/deposits`), k).send({ type: 'RENT', amount: 300, receivedAt: today(), note: depositNote }));
      const keyMoneyNote = marker('key money');
      await sentTwice((k) => keyed(http().post(`/contracts/${contract.id}/key-money`), k).send({ direction: 'RECEIVED', amount: 500, paidAt: today(), note: keyMoneyNote }));
      const label = marker('fee');
      const fee = await sentTwice((k) => keyed(http().post(`/contracts/${contract.id}/fees`), k).send({ label, amount: 100, effectiveFrom: today() }));
      expect(fee.second.id).toBe(fee.first.id);
      const counts = await inTenant(async (tx) => ({
        claims: await tx.contractClaim.count({ where: { contractId: contract.id, description: claimDescription } }),
        deposits: await tx.contractDeposit.count({ where: { contractId: contract.id, note: depositNote } }),
        keyMoney: await tx.contractKeyMoney.count({ where: { contractId: contract.id, note: keyMoneyNote } }),
        fees: await tx.contractFee.count({ where: { contractId: contract.id, label } }),
      }));
      expect(counts).toEqual({ claims: 1, deposits: 1, keyMoney: 1, fees: 1 });
    });
  });

  describe('point of sale', () => {
    let posProduct: string;

    beforeAll(async () => {
      posProduct = await newProduct('pos product');
      await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
    });

    it('a POS sale replayed with its key but different lines is refused with 409 and sells nothing more', async () => {
      const k = key('pos');
      const first = await keyed(http().post('/pos/sales'), k).send({ lines: [{ productId: posProduct, quantity: 1 }], paymentMethod: 'CASH' }).expect(201);
      const same = await keyed(http().post('/pos/sales'), k).send({ lines: [{ productId: posProduct, quantity: 1 }], paymentMethod: 'CASH' });
      expect([200, 201]).toContain(same.status);
      expect(same.body.id).toBe(first.body.id);
      const reused = await keyed(http().post('/pos/sales'), k).send({ lines: [{ productId: posProduct, quantity: 3 }], paymentMethod: 'CASH' });
      expect(reused.status).toBe(409);
      expect(await inTenant((tx) => tx.invoice.count({ where: { clientSaleId: k } }))).toBe(1);
    });

    it('a synced sale with a known sale id but a different sale is refused with 409', async () => {
      const clientSaleId = key('sync');
      const first = await auth(http().post('/pos/sales/sync')).send({ clientSaleId, lines: [{ productId: posProduct, quantity: 1 }], paymentMethod: 'CASH' }).expect(201);
      const same = await auth(http().post('/pos/sales/sync')).send({ clientSaleId, lines: [{ productId: posProduct, quantity: 1 }], paymentMethod: 'CASH' });
      expect([200, 201]).toContain(same.status);
      expect(same.body.id).toBe(first.body.id);
      const different = await auth(http().post('/pos/sales/sync')).send({ clientSaleId, lines: [{ productId: posProduct, quantity: 2 }], paymentMethod: 'CASH' });
      expect(different.status).toBe(409);
    });
  });
});
