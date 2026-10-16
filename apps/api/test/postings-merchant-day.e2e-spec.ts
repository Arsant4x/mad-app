import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ISOLATED_PASSWORD, IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

jest.setTimeout(300000);

/**
 * Postings, documents, movements and reversals dated "today" by the server take the merchant's day, not the UTC
 * day. The clock is fixed at 22:30 UTC on the last day of a month, which is already the next day for a company
 * three hours east of UTC: every date below must be that next day. The year-end cases use 31 December, where the
 * merchant's day falls in the next year.
 */
describe('Server-dated postings and documents take the merchant day (e2e)', () => {
  const OCTOBER_NIGHT = new Date('2026-10-31T22:30:00.000Z');
  const NOVEMBER_FIRST = '2026-11-01';
  const DECEMBER_NIGHT = new Date('2026-12-31T22:30:00.000Z');
  const JANUARY_FIRST = '2027-01-01';

  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const day = (value: unknown) => String(value).slice(0, 10);
  /** A status check that names the server's answer when it differs. */
  const is = (status: number) => (res: request.Response) => {
    if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  };

  /** Dates of the entries whose memo starts with the given text, found through the journal search. */
  const entryDates = async (search: string, memoStart: string): Promise<string[]> => {
    const page = (await auth(http().get('/journal').query({ search, pageSize: 100 })).expect(is(200))).body as { items: { date: string; memo: string }[] };
    return page.items.filter((e) => e.memo.startsWith(memoStart)).map((e) => day(e.date));
  };

  /** Moves the clock to a fixed instant (Date only, so the driver and the HTTP server keep real timers) and signs in again. */
  const fixClock = async (instant: Date, merchantDay: string) => {
    jest.useRealTimers();
    // The fixed instant is a real moment only for a company three hours east of UTC: check it before relying on it.
    const { timeZone } = await app.get(PrismaService).company.findUniqueOrThrow({ where: { id: company.companyId }, select: { timeZone: true } });
    const local = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).format(instant);
    expect(local).toBe(`${merchantDay}, 01`);
    jest.useFakeTimers({
      now: instant,
      advanceTimers: true,
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
    expect(new Date().toISOString().slice(0, 13)).toBe(instant.toISOString().slice(0, 13));
    token = ((await http().post('/auth/login').send({ username: company.username, password: ISOLATED_PASSWORD }).expect(is(200))).body as { accessToken: string }).accessToken;
  };

  let branchId: string;
  let warehouseId: string;
  let customerId: string;
  let supplierId: string;
  let carrierId: string;

  // Documents created under the real clock, dated inside October, and acted on later under the fixed clock.
  let receiptPayment: { id: string; no: string };
  let usdReceipt: { id: string; no: string };
  let usdInvoiceId: string;
  let pendingReceipt: { purchaseId: string; receiptId: string; receiptNo: string };
  let freight: { id: string; no: string; distributionId: string };
  let manualInId: string;
  let provisionalProductId: string;
  let voidableProductId: string;
  let creditNoteInvoiceId: string;
  let debitNoteInvoiceId: string;
  let rejectedInvoiceId: string;
  let servicePurchase: { id: string; lineId: string };
  let quoteId: string;
  let feeContractId: string;
  let creditSourceId: string;
  let formTemplateId: string;
  let shiftId: string;

  const buy = (body: Record<string, unknown>) =>
    auth(http().post('/purchases'))
      .send({ supplierId, branchId, inputVatUse: 'TAXABLE_ONLY', ...body })
      .expect(is(201));
  const stocked = (productId: string, date: string, extra: Record<string, unknown> = {}) =>
    buy({ date, subtotal: 400, warehouseId, category: 'بضاعة', lines: [{ description: 'stock', productId, quantity: 10, unitPrice: 40, taxRate: 15 }], ...extra });
  const product = async (name: string, cost = 10) =>
    ((await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `${name} ${suffix}`, price: 100, cost }).expect(is(201))).body as { id: string }).id;
  const invoice = async (customer: string, date: string) =>
    ((await auth(http().post('/invoices'))
      .send({ customerId: customer, branchId, issueDate: date, dueDate: date, lines: [{ description: `service ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(is(201))).body as { id: string }).id;
  const contract = async (tag: string): Promise<string> => {
    const property = (await auth(http().post('/properties')).send({ name: `property ${tag} ${suffix}`, ownership: 'owned' }).expect(is(201))).body as { id: string };
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `MD-${tag}-${suffix}`, type: 'محل', rentMonthly: 1000 }).expect(is(201))).body as { id: string };
    const tenantId = await createTenantCustomer(app, token, `tenant ${tag} ${suffix}`);
    return ((await auth(http().post('/contracts'))
      .send({ unitId: unit.id, customerId: tenantId, value: 12000, cycle: 'monthly', start: '2026-10-01', end: '2027-09-30', classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(is(201))).body as { id: string }).id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'merchant-day');
    token = company.token;

    warehouseId = ((await auth(http().post('/warehouses')).send({ name: `warehouse ${suffix}` }).expect(is(201))).body as { id: string }).id;
    branchId = ((await auth(http().post('/branches')).send({ name: `branch ${suffix}`, warehouseId }).expect(is(201))).body as { id: string }).id;
    customerId = ((await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `customer ${suffix}` }).expect(is(201))).body as { id: string }).id;
    supplierId = ((await auth(http().post('/suppliers')).send({ name: `supplier ${suffix}` }).expect(is(201))).body as { id: string }).id;
    carrierId = ((await auth(http().post('/suppliers')).send({ name: `carrier ${suffix}` }).expect(is(201))).body as { id: string }).id;

    // A receipt to reverse, and a foreign currency receipt on account whose later allocation writes a difference entry.
    const paidInvoiceId = await invoice(customerId, '2026-10-03');
    receiptPayment = (await auth(http().post('/payments'))
      .send({ customerId, branchId, date: '2026-10-03', amount: 115, method: 'CASH', allocations: [{ invoiceId: paidInvoiceId, amount: 115 }] })
      .expect(is(201))).body;
    usdInvoiceId = ((await auth(http().post('/invoices'))
      .send({ customerId, branchId, issueDate: '2026-10-04', dueDate: '2026-10-04', currency: 'USD', exchangeRate: 3.7, lines: [{ description: `usd service ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(is(201))).body as { id: string }).id;
    usdReceipt = (await auth(http().post('/payments'))
      .send({ customerId, branchId, date: '2026-10-04', amount: 115, method: 'CASH', currency: 'USD', exchangeRate: 3.8, unallocated: 'ON_ACCOUNT' })
      .expect(is(201))).body;

    // A registered goods receipt to void.
    const pendingProduct = await product('pending receipt');
    const pending = (await stocked(pendingProduct, '2026-10-05', { receiveNow: false })).body as { id: string; lines: { id: string }[] };
    const receipt = (await auth(http().post(`/purchases/${pending.id}/receipts`)).send({ receivedAt: '2026-10-06', lines: [{ purchaseLineId: pending.lines[0].id, quantity: 10 }] }).expect(is(201))).body as { id: string; no: string };
    pendingReceipt = { purchaseId: pending.id, receiptId: receipt.id, receiptNo: receipt.no };

    // A freight bill distributed onto a stocked purchase, to void.
    const landedProduct = await product('landed');
    const goods = (await stocked(landedProduct, '2026-10-05')).body as { id: string };
    const goodsReceiptId = ((await auth(http().get(`/purchases/${goods.id}/receipts`)).expect(is(200))).body as { receipts: { id: string }[] }).receipts[0].id;
    const bill = (await auth(http().post('/purchases'))
      .send({ supplierId: carrierId, branchId, inputVatUse: 'TAXABLE_ONLY', date: '2026-10-06', subtotal: 100, category: 'مصروفات أخرى', lines: [{ description: 'freight', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(is(201))).body as { id: string; no: string; lines: { id: string }[] };
    const distribution = (await auth(http().post(`/purchases/${bill.id}/landed-costs`)).send({ purchaseLineId: bill.lines[0].id, goodsReceiptIds: [goodsReceiptId] }).expect(is(201))).body as { id: string };
    freight = { id: bill.id, no: bill.no, distributionId: distribution.id };

    // A manual stock entry to reverse.
    const manualProduct = await product('manual');
    manualInId = ((await auth(http().post('/inventory/movements')).send({ productId: manualProduct, warehouseId, type: 'IN', qty: 5, unitCost: 10, date: '2026-10-07', reason: 'manual entry' }).expect(is(201))).body as { id: string }).id;

    // A stock exit with no layer (a provisional cost the opening declaration settles), and a product whose opening line is voided.
    provisionalProductId = await product('provisional', 7);
    await auth(http().post('/inventory/movements')).send({ productId: provisionalProductId, warehouseId, type: 'OUT', qty: 3, date: '2026-10-08', reason: 'exit before the opening' }).expect(is(201));
    voidableProductId = await product('opening line');

    // Customer invoices for a credit note, a debit note and a rejected standard invoice to replace.
    creditNoteInvoiceId = await invoice(customerId, '2026-10-09');
    debitNoteInvoiceId = await invoice(customerId, '2026-10-09');
    const standardCustomerId = ((await auth(http().post('/customers'))
      .send({ kind: 'NATURAL', name: `standard customer ${suffix}`, vatNumber: '311111111111113', street: 'شارع الملك فهد', buildingNumber: '1234', district: 'العليا', city: 'الرياض', postalCode: '12345' })
      .expect(is(201))).body as { id: string }).id;
    rejectedInvoiceId = await invoice(standardCustomerId, '2026-10-10');
    // The authority's rejection is the only way into this state; it is set directly to keep the case local.
    await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.invoice.update({ where: { id: rejectedInvoiceId }, data: { zatcaStatus: 'REJECTED' } }));

    // A service purchase for a supplier credit note, and a quote to convert.
    const service = (await buy({ date: '2026-10-11', subtotal: 200, category: 'مصروفات أخرى', lines: [{ description: 'maintenance', quantity: 1, unitPrice: 200, taxRate: 15 }] })).body as { id: string; lines: { id: string }[] };
    servicePurchase = { id: service.id, lineId: service.lines[0].id };
    quoteId = ((await auth(http().post('/quotes'))
      .send({ customerId, branchId, issueDate: '2026-10-12', validUntil: '2026-11-30', lines: [{ description: `quoted ${suffix}`, quantity: 1, unitPrice: 300, taxRate: 15 }] })
      .expect(is(201))).body as { id: string }).id;

    // A contract for a fee line and a form, and one paid beyond its schedule so its renewal takes the tenant's credit.
    feeContractId = await contract('fee');
    creditSourceId = await contract('credit');
    // Twelve instalments of 1,150 are 13,800; the 230 above them stays as the tenant's credit.
    await auth(http().post(`/contracts/${creditSourceId}/payments`)).send({ date: '2026-10-02', amount: 14030, method: 'CASH' }).expect(is(201));

    // A published form template of the company, copied from a published platform template.
    const ownerToken = ((await http()
      .post('/auth/login')
      .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
      .expect(is(200))).body as { accessToken: string }).accessToken;
    const formType = (await http().post('/admin/form-types').set('Authorization', `Bearer ${ownerToken}`).send({ code: `DAY_T${Date.now().toString().slice(-8)}`, name: 'تسليمُ وحدة' }).expect(is(201))).body as { id: string };
    const platformTemplate = (await http()
      .post('/admin/form-templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ formTypeId: formType.id, name: 'تسليمُ وحدة', items: [{ label: 'حالةُ الخزائن', itemType: 'CONDITION' }] })
      .expect(is(201))).body as { id: string };
    await http().post(`/admin/form-templates/${platformTemplate.id}/publish`).set('Authorization', `Bearer ${ownerToken}`).expect(is(201));
    formTemplateId = ((await auth(http().post('/form-templates/copy')).send({ sourceTemplateId: platformTemplate.id }).expect(is(201))).body as { id: string }).id;
    await auth(http().post(`/form-templates/${formTemplateId}/publish`)).expect(is(201));

    // A cashier shift to close later with a shortage.
    shiftId = ((await auth(http().post('/pos/shifts')).send({ openingFloat: 100, branchId }).expect(is(201))).body as { id: string }).id;

    // The year's ratio, which the annual settlement needs.
    await auth(http().post('/obligations/vat-ratio')).send({ year: 2026, ratio: 0.5, basis: 'ESTIMATED' }).expect(is(201));
  });

  afterAll(async () => {
    jest.useRealTimers();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  describe('at 22:30 UTC on 31 October', () => {
    beforeAll(async () => {
      await fixClock(OCTOBER_NIGHT, NOVEMBER_FIRST);
    });

    it('reverses a customer receipt on the merchant day, the document and its entry', async () => {
      const reversal = (await auth(http().post(`/payments/${receiptPayment.id}/reverse`)).send({}).expect(is(201))).body as { no: string; date: string };
      expect(day(reversal.date)).toBe(NOVEMBER_FIRST);
      expect(await entryDates(reversal.no, `عكس مقبوض — سند ${reversal.no}`)).toEqual([NOVEMBER_FIRST]);
    });

    it('posts a customer receipt reallocation difference on the merchant day', async () => {
      await auth(http().post(`/payments/${usdReceipt.id}/allocate`)).send({ allocations: [{ invoiceId: usdInvoiceId, amount: 115 }] }).expect(is(201));
      expect(await entryDates(usdReceipt.no, `إعادة توزيع مقبوض — سند ${usdReceipt.no}`)).toEqual([NOVEMBER_FIRST]);
    });

    it('voids a goods receipt with its reversal on the merchant day', async () => {
      await auth(http().delete(`/purchases/${pendingReceipt.purchaseId}/receipts/${pendingReceipt.receiptId}`)).expect(is(204));
      expect(await entryDates(pendingReceipt.receiptNo, `عكسُ قيد استلام ${pendingReceipt.receiptNo}`)).toEqual([NOVEMBER_FIRST]);
    });

    it('voids a landed cost distribution with its reversal on the merchant day', async () => {
      await auth(http().delete(`/purchases/${freight.id}/landed-costs/${freight.distributionId}`)).expect(is(204));
      expect(await entryDates(freight.no, `عكسُ تكلفةٍ محمَّلة — فاتورة شراء ${freight.no}`)).toEqual([NOVEMBER_FIRST]);
    });

    it('reverses a manual stock movement on the merchant day', async () => {
      const reversal = (await auth(http().post(`/inventory/movements/${manualInId}/reverse`)).send({}).expect(is(201))).body as { date: string };
      expect(day(reversal.date)).toBe(NOVEMBER_FIRST);
    });

    let opening: { id: string; no: string; provisionalSettled: number; lines: { id: string; productId: string }[] };

    it('settles a provisional cost of an opening declaration on the merchant day', async () => {
      opening = (await auth(http().post('/inventory/opening'))
        .send({
          openingDate: '2026-10-01',
          lines: [
            { productId: provisionalProductId, warehouseId, qty: 8, unitCost: 9, acquiredAt: '2026-09-01' },
            { productId: voidableProductId, warehouseId, qty: 4, unitCost: 2, acquiredAt: '2026-09-01' },
          ],
        })
        .expect(is(201))).body;
      expect(opening.provisionalSettled).toBe(1);
      expect(await entryDates(opening.no, `حركةُ مخزونٍ يدوية — تسوية مؤقّتٍ يدويّ — رصيدٌ افتتاحيّ ${opening.no}`)).toEqual([NOVEMBER_FIRST]);
    });

    it('voids an opening line on the merchant day, the movement and its entry', async () => {
      const lineId = opening.lines.find((l) => l.productId === voidableProductId)!.id;
      const voided = (await auth(http().post(`/inventory/opening/${opening.id}/lines/${lineId}/void`)).expect(is(201))).body as { lines: { id: string; voidMovementId: string | null }[] };
      const movementId = voided.lines.find((l) => l.id === lineId)!.voidMovementId!;
      const movement = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.stockMovement.findUniqueOrThrow({ where: { id: movementId }, select: { date: true } }));
      expect(day(movement.date.toISOString())).toBe(NOVEMBER_FIRST);
      expect(await entryDates(opening.no, `إلغاءُ سطرٍ من الرصيد الافتتاحيّ — مخزون ${opening.no}`)).toEqual([NOVEMBER_FIRST]);
    });

    it('issues a customer credit note and a debit note on the merchant day', async () => {
      const credit = (await auth(http().post(`/invoices/${creditNoteInvoiceId}/credit-note`)).send({ reason: 'full return' }).expect(is(201))).body as { issueDate: string };
      expect(day(credit.issueDate)).toBe(NOVEMBER_FIRST);
      const debit = (await auth(http().post(`/invoices/${debitNoteInvoiceId}/debit-note`))
        .send({ reason: 'extra hours', lines: [{ description: 'extra', quantity: 1, unitPrice: 20, taxRate: 15 }] })
        .expect(is(201))).body as { issueDate: string };
      expect(day(debit.issueDate)).toBe(NOVEMBER_FIRST);
    });

    it('replaces a rejected standard invoice on the merchant day', async () => {
      const replacement = (await auth(http().post(`/invoices/${rejectedInvoiceId}/replacement`)).send({}).expect(is(201))).body as { issueDate: string };
      expect(day(replacement.issueDate)).toBe(NOVEMBER_FIRST);
    });

    it('issues a supplier credit note on the merchant day', async () => {
      const note = (await auth(http().post(`/purchases/${servicePurchase.id}/supplier-credit-note`))
        .send({ reason: 'partial refund', lines: [{ description: 'refund', quantity: 1, unitPrice: 50, returnsPurchaseLineId: servicePurchase.lineId }] })
        .expect(is(201))).body as { date: string };
      expect(day(note.date)).toBe(NOVEMBER_FIRST);
    });

    it('converts a quote into an invoice dated the merchant day', async () => {
      const converted = (await auth(http().post(`/quotes/${quoteId}/convert`)).expect(is(201))).body as { invoice: { issueDate: string; dueDate: string } };
      expect([day(converted.invoice.issueDate), day(converted.invoice.dueDate)]).toEqual([NOVEMBER_FIRST, NOVEMBER_FIRST]);
    });

    it('starts a contract fee line on the merchant day when no date is sent', async () => {
      const fee = (await auth(http().post(`/contracts/${feeContractId}/fees`)).send({ label: 'parking', amount: 50 }).expect(is(201))).body as { effectiveFrom: string };
      expect(fee.effectiveFrom).toBe(NOVEMBER_FIRST);
    });

    it('applies the tenant credit to a renewal on the merchant day', async () => {
      const renewal = (await auth(http().post(`/contracts/${creditSourceId}/renew`))
        .send({ start: '2027-10-01', end: '2028-09-30', classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' })
        .expect(is(201))).body as { id: string };
      const fresh = (await auth(http().get(`/contracts/${renewal.id}`)).expect(is(200))).body as { payments: { date: string; creditFromContractId: string | null }[] };
      const transfers = fresh.payments.filter((p) => p.creditFromContractId === creditSourceId);
      expect(transfers.map((p) => day(p.date))).toEqual([NOVEMBER_FIRST]);
    });

    it('dates a new form on the merchant day when no date is sent', async () => {
      const form = (await auth(http().post(`/contracts/${feeContractId}/forms`)).send({ templateId: formTemplateId }).expect(is(201))).body as { formDate: string };
      expect(form.formDate).toBe(NOVEMBER_FIRST);
    });

    it('posts a shift shortage on the merchant day when the terminal sends no offset', async () => {
      await auth(http().post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 90 }).expect(is(201));
      const shiftNo = shiftId.slice(0, 8);
      expect(await entryDates(shiftNo, 'عجز جرد مناوبة')).toEqual([NOVEMBER_FIRST]);
    });

    // The VAT closings come last in this block, after every other October case.
    let thirdQuarterClosingId: string;

    it('closes a past VAT return on the merchant day', async () => {
      const third = (await auth(http().post('/obligations/vat-declaration/closings')).send({ year: 2026, quarter: 3 }).expect(is(201))).body as { id: string; date: string };
      thirdQuarterClosingId = third.id;
      expect(day(third.date)).toBe(NOVEMBER_FIRST);
    });

    it('reverses a VAT return closing on the merchant day', async () => {
      const reversal = (await auth(http().post(`/obligations/vat-declaration/closings/${thirdQuarterClosingId}/reverse`)).send({}).expect(is(201))).body as { date: string };
      expect(day(reversal.date)).toBe(NOVEMBER_FIRST);
    });

    it('closes the October return once October is over for the merchant', async () => {
      const october = (await auth(http().post('/obligations/vat-declaration/closings')).send({ year: 2026, month: 10 }).expect(is(201))).body as { date: string };
      expect(day(october.date)).toBe(NOVEMBER_FIRST);
    });
  });

  describe('at 22:30 UTC on 31 December', () => {
    beforeAll(async () => {
      await fixClock(DECEMBER_NIGHT, JANUARY_FIRST);
    });

    it('dates an opening balance at the start of the merchant year', async () => {
      const account = (await auth(http().post('/accounts')).send({ code: '1777', name: `opening ${suffix}`, type: 'asset', openingBalance: 250 }).expect(is(201))).body as { id: string };
      const entries = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.journalEntry.findMany({ where: { openingForAccountId: account.id }, select: { date: true } }));
      expect(entries.map((e) => day(e.date.toISOString()))).toEqual([JANUARY_FIRST]);
    });

    it('settles the year once the year is over for the merchant, dated the merchant day', async () => {
      const settled = (await auth(http().post('/obligations/vat-ratio/settle')).send({ year: 2026 }).expect(is(201))).body as { adjustment: { date: string } };
      expect(day(settled.adjustment.date)).toBe(JANUARY_FIRST);
    });
  });
});
