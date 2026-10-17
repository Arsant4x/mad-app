import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { decodeZatcaQr } from '../src/zatca/qr.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { purgeInvoicesForTest } from './purge-invoices';
import { startAuthorityStub, type AuthorityStub } from './zatca-authority-stub';
import { clearCredential, seedProductionCredential } from './zatca-credential';

// Suite budget: about three times the measured run.
jest.setTimeout(120000);

/**
 * The Security Features Implementation Standards (v1.2, Table 3) define QR tag 4 as the invoice total with VAT
 * and tag 5 as the value of BT-110 in the XML invoice. In the XML Implementation Standard (v1.2, 9.2) BT-110 is the
 * invoice total VAT amount, the sum of the VAT category amounts in the invoice currency, and BT-111 is the same total
 * in the VAT accounting currency (SAR). So for a foreign currency invoice the QR carries the document currency
 * figures while the XML also carries the SAR tax total; this suite reads both off the signed document.
 */
describe('phase 2 QR amounts follow the document currency figures of the signed XML (e2e)', () => {
  let app: INestApplication;
  let authority: AuthorityStub;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let customerId: string;
  const created: string[] = [];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    authority = await startAuthorityStub('reject');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'qr-currency');
    await auth(request(app.getHttpServer()).patch('/company-profile')).send({ legalName: 'شركة العملة التجارية', vatNumber: '300000000000003' }).expect(200);
    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `Simplified buyer ${Date.now()}` }).expect(201)).body.id;
    await seedProductionCredential(tenantPrisma, company.companyId);
  });

  afterAll(async () => {
    if (company) {
      await purgeInvoicesForTest(tenantPrisma, company.companyId, created);
      await clearCredential(tenantPrisma, company.companyId);
      await removeIsolatedCompany(app, company);
    }
    await authority?.close();
    await app?.close();
  });

  it('a USD invoice: tag 4 is TaxInclusiveAmount and tag 5 is BT-110 in USD, not the SAR tax total', async () => {
    const invoice = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId, issueDate: '2026-06-01', dueDate: '2026-06-30', currency: 'USD', exchangeRate: 3.75, lines: [{ description: 'Service', quantity: 2, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    created.push(invoice.body.id);
    await auth(request(app.getHttpServer()).post(`/zatca/invoices/${invoice.body.id}/submit`)).expect(201);

    const stored = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: invoice.body.id }, select: { zatcaSignedXml: true, zatcaQrPayload: true } }),
    );
    const xml = stored.zatcaSignedXml!;
    expect(xml).toContain('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>');
    expect(xml).toContain('<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>');

    // Document level tax totals sit before LegalMonetaryTotal; the line level ones come after it.
    const head = xml.slice(0, xml.indexOf('<cac:LegalMonetaryTotal>'));
    const totals = [...head.matchAll(/<cac:TaxTotal><cbc:TaxAmount currencyID="([A-Z]{3})">([\d.]+)<\/cbc:TaxAmount>(<cac:TaxSubtotal>)?/g)].map((m) => ({
      currency: m[1],
      amount: m[2],
      withBreakdown: Boolean(m[3]),
    }));
    const bt110 = totals.filter((t) => t.withBreakdown);
    const bt111 = totals.filter((t) => !t.withBreakdown);
    expect(bt110).toEqual([{ currency: 'USD', amount: '30.00', withBreakdown: true }]);
    expect(bt111).toEqual([{ currency: 'SAR', amount: '112.50', withBreakdown: false }]);
    const inclusive = /<cbc:TaxInclusiveAmount currencyID="([A-Z]{3})">([\d.]+)<\/cbc:TaxInclusiveAmount>/.exec(xml);
    expect(inclusive?.slice(1)).toEqual(['USD', '230.00']);

    const qr = decodeZatcaQr(stored.zatcaQrPayload!);
    expect(Object.keys(qr).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(qr[4]).toBe(inclusive![2]);
    expect(qr[5]).toBe(bt110[0].amount);
    expect(qr[5]).not.toBe(bt111[0].amount);
  });
});
