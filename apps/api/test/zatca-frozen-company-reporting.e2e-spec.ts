import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { INVOICE_ISSUED } from '../src/shared/events/domain-events';
import { ReportingDeadlineService } from '../src/zatca/reporting-deadline.service';
import { purgeInvoicesForTest } from './purge-invoices';
import { registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { DEAD_PORT_URL, startAuthorityStub, type AuthorityStub } from './zatca-authority-stub';

// Suite budget: three times the measured run, declared here rather than assumed.
jest.setTimeout(300000);

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/**
 * Reporting an issued document is an obligation on the document, not a write by the merchant: a company
 * that turns read only (FROZEN) after issuing still has its documents delivered to the authority and its
 * owner warned of the reporting deadline, while it still cannot issue anything new.
 */
describe('documents issued while active still reach the authority after the company is frozen (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let outbox: OutboxService;
  let deadline: ReportingDeadlineService;
  let company: Awaited<ReturnType<typeof registerIsolatedCompany>>;
  let token: string;
  let companyId: string;
  let customerId: string;
  let authority: AuthorityStub | null = null;
  const created: string[] = [];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const server = () => app.getHttpServer();

  async function realKeys() {
    const webcrypto = new Crypto();
    x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
    const cert = await x509.X509CertificateGenerator.createSelfSigned(
      { serialNumber: '01', name: 'CN=mad-app-test, C=SA', notBefore: new Date('2026-01-01'), notAfter: new Date('2027-01-01'), keys: pair, signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' } },
      webcrypto as unknown as globalThis.Crypto,
    );
    const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
    return {
      privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----\n`,
      certBase64: Buffer.from(cert.rawData).toString('base64'),
    };
  }

  const invoiceBody = () => ({ customerId, issueDate: '2026-06-01', dueDate: '2026-06-30', lines: [{ description: 'service', quantity: 1, unitPrice: 100, taxRate: 15 }] });

  function eventOf(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: INVOICE_ISSUED, payload: { path: ['invoiceId'], equals: id } } }),
    );
  }

  function deadlineNotes(invoiceId: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) => tx.notification.findMany({ where: { kind: 'ZATCA_REPORTING_DEADLINE', linkId: invoiceId } }));
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // Nothing answers until the stub starts: issuing must not reach the authority on its own.
    process.env.ZATCA_API_BASE_OVERRIDE = DEAD_PORT_URL;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    outbox = app.get(OutboxService);
    deadline = app.get(ReportingDeadlineService);

    company = await registerIsolatedCompany(app, 'frozenreport');
    token = company.token;
    companyId = company.companyId;
    await auth(request(server()).patch('/company-profile')).send({ legalName: 'Frozen Report Trading', vatNumber: '300000000000003' }).expect(200);
    customerId = (await auth(request(server()).post('/customers')).send({ kind: 'NATURAL', name: `frozen customer ${Date.now()}` }).expect(201)).body.id;
    const keys = await realKeys();
    const data = {
      privateKeyEnc: encryptSecret(keys.privateKeyPem),
      productionCsidEnc: encryptSecret(keys.certBase64),
      productionSecretEnc: encryptSecret('fake-production-secret'),
      status: 'PRODUCTION_ISSUED' as const,
      onboardedAt: new Date(Date.now() - 24 * HOUR_MS),
    };
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }));
  });

  afterAll(async () => {
    await purgeInvoicesForTest(tenantPrisma, companyId, created);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
    if (authority) await authority.close();
    delete process.env.ZATCA_API_BASE_OVERRIDE;
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  let issued: { id: string; no: string };
  let issuedAt: Date;

  it('an invoice issued while active is queued, then the company turns read only and cannot issue more', async () => {
    const res = await auth(request(server()).post('/invoices')).send(invoiceBody()).expect(201);
    issued = { id: res.body.id as string, no: res.body.no as string };
    created.push(issued.id);
    issuedAt = (await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.findUniqueOrThrow({ where: { id: issued.id }, select: { createdAt: true } }))).createdAt;
    expect((await eventOf(issued.id)).status).toBe('PENDING');

    await prisma.company.update({ where: { id: companyId }, data: { status: 'FROZEN', frozenAt: new Date(), subEnd: new Date(Date.now() - 24 * HOUR_MS) } });
    const refused = await auth(request(server()).post('/invoices')).send(invoiceBody());
    expect(refused.status).toBe(403);
  });

  it('the owner of the frozen company is still warned of the reporting deadline', async () => {
    const at20 = new Date(issuedAt.getTime() + 20 * HOUR_MS + 5 * MINUTE_MS);
    await deadline.runForAllCompanies(at20);
    expect((await deadlineNotes(issued.id)).map((n) => n.dedupeKey)).toEqual([`zatca-report-due:${issued.id}`]);
  });

  it('the dispatcher still delivers the document issued before the freeze', async () => {
    authority = await startAuthorityStub('clear');
    await outbox.dispatchDue(20, new Date());

    const ev = await eventOf(issued.id);
    expect(ev.status).toBe('SENT');
    expect(authority.requests.some((r) => r.path.includes('/reporting/'))).toBe(true);
    const doc = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.findUniqueOrThrow({ where: { id: issued.id }, select: { zatcaStatus: true } }));
    expect(doc.zatcaStatus).toBe('CLEARED');
    // Still read only for the merchant.
    expect((await auth(request(server()).post('/invoices')).send(invoiceBody())).status).toBe(403);
  });
});
