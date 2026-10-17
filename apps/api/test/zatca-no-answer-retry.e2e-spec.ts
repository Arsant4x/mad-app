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
import { MAX_ATTEMPTS, OutboxService } from '../src/outbox/outbox.service';
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
 * A document the authority never answered must keep being retried, not end in a terminal FAILED
 * half an hour after it was issued, and the owner must hear about it before the 24 hour reporting
 * deadline of a simplified document runs out. The clock is the `now` given to the dispatcher and
 * to the deadline check, as in the other outbox suites.
 */
describe('ZATCA delivery without an answer keeps retrying and warns before the reporting deadline (e2e)', () => {
  let app: INestApplication;
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

  async function makeInvoice(buyer = customerId): Promise<{ id: string; no: string }> {
    const res = await auth(request(server()).post('/invoices'))
      .send({ customerId: buyer, issueDate: '2026-06-01', dueDate: '2026-06-30', lines: [{ description: 'service', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    created.push(res.body.id);
    return { id: res.body.id as string, no: res.body.no as string };
  }

  function eventOf(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: INVOICE_ISSUED, payload: { path: ['invoiceId'], equals: id } } }),
    );
  }

  function invoiceRow(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id }, select: { zatcaStatus: true, zatcaSubmittedAt: true, createdAt: true } }),
    );
  }

  function deadlineNotes(invoiceId: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.notification.findMany({ where: { kind: 'ZATCA_REPORTING_DEADLINE', linkId: invoiceId }, orderBy: { createdAt: 'asc' } }),
    );
  }

  /** Dispatches this event until it has failed `times` more times, moving the fake clock to each due moment. */
  async function failRepeatedly(invoiceId: string, times: number, from: Date): Promise<Date> {
    let now = from;
    for (let i = 0; i < times; i++) {
      const before = await eventOf(invoiceId);
      const result = await outbox.dispatchForCompany(companyId, 20, now);
      expect(result.sent).toBe(0);
      const ev = await eventOf(invoiceId);
      expect(ev.attempts).toBe(before.attempts + 1);
      expect(ev.status).toBe('PENDING');
      expect(ev.availableAt.getTime() - now.getTime()).toBeLessThanOrEqual(HOUR_MS);
      now = ev.availableAt;
    }
    return now;
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // A port nobody listens on: a pure transport failure, never an answer.
    process.env.ZATCA_API_BASE_OVERRIDE = DEAD_PORT_URL;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    outbox = app.get(OutboxService);
    deadline = app.get(ReportingDeadlineService);

    company = await registerIsolatedCompany(app, 'noanswer');
    token = company.token;
    companyId = company.companyId;
    await auth(request(server()).patch('/company-profile')).send({ legalName: 'No Answer Trading', vatNumber: '300000000000003' }).expect(200);
    customerId = (await auth(request(server()).post('/customers')).send({ kind: 'NATURAL', name: `retry customer ${Date.now()}` }).expect(201)).body.id;
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

  let unsent: { id: string; no: string };
  let issuedAt: Date;
  let clock: Date;

  it('an issued invoice event is still retried after more than six transport failures, never more than an hour apart', async () => {
    unsent = await makeInvoice();
    issuedAt = (await invoiceRow(unsent.id)).createdAt;
    clock = await failRepeatedly(unsent.id, MAX_ATTEMPTS + 3, new Date());

    const ev = await eventOf(unsent.id);
    expect(ev.attempts).toBe(MAX_ATTEMPTS + 3);
    expect(String(ev.lastError)).toMatch(/fetch failed|ECONNREFUSED/i);
    expect(String(ev.lastError)).toContain('سيُعاد');
    const doc = await invoiceRow(unsent.id);
    expect(doc.zatcaStatus).toBe('STAMPED');
    expect(doc.zatcaSubmittedAt).toBeNull();
  });

  it('a reply from the server that is not a verdict on the document is retried past the limit as well', async () => {
    authority = await startAuthorityStub('outage');
    const doc = await makeInvoice();
    await failRepeatedly(doc.id, MAX_ATTEMPTS + 1, new Date());
    const ev = await eventOf(doc.id);
    expect(String(ev.lastError)).toContain('HTTP 503');
    expect((await invoiceRow(doc.id)).zatcaStatus).toBe('STAMPED');
  });

  it('nothing is raised while the document is younger than 20 hours', async () => {
    expect(await deadline.runForCompany(companyId, new Date(issuedAt.getTime() + 20 * HOUR_MS - MINUTE_MS))).toBe(0);
    expect(await deadlineNotes(unsent.id)).toHaveLength(0);
  });

  it('the owner is told 20 hours after issue that the document has not reached the authority, once', async () => {
    const at20 = new Date(issuedAt.getTime() + 20 * HOUR_MS + 5 * MINUTE_MS);
    expect(await deadline.runForCompany(companyId, at20)).toBeGreaterThanOrEqual(1);
    expect(await deadline.runForCompany(companyId, at20)).toBe(0);

    const notes = await deadlineNotes(unsent.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].dedupeKey).toBe(`zatca-report-due:${unsent.id}`);
    expect(notes[0].targetUserId).toBeNull();
    expect(notes[0].title).toContain(unsent.no);

    const bell = await auth(request(server()).get('/notifications')).expect(200);
    const seen = (bell.body.notifications as Array<{ kind: string; linkId: string | null }>).filter((n) => n.linkId === unsent.id);
    expect(seen.map((n) => n.kind)).toEqual(['ZATCA_REPORTING_DEADLINE']);
  });

  it('and again once the 24 hour deadline has passed, while the event is still being retried', async () => {
    const at24 = new Date(issuedAt.getTime() + 24 * HOUR_MS + 5 * MINUTE_MS);
    while (clock.getTime() <= at24.getTime()) clock = await failRepeatedly(unsent.id, 1, clock);
    expect((await eventOf(unsent.id)).status).toBe('PENDING');

    expect(await deadline.runForCompany(companyId, at24)).toBeGreaterThanOrEqual(1);
    expect(await deadline.runForCompany(companyId, new Date(at24.getTime() + HOUR_MS))).toBe(0);
    const notes = await deadlineNotes(unsent.id);
    expect(notes.map((n) => n.dedupeKey)).toEqual([`zatca-report-due:${unsent.id}`, `zatca-report-late:${unsent.id}`]);
  });

  it('a document the authority rejected, a standard document and one issued before the connection raise nothing', async () => {
    authority!.set('reject');
    const rejected = await makeInvoice();
    expect((await auth(request(server()).post(`/zatca/invoices/${rejected.id}/submit`)).expect(201)).body.zatcaStatus).toBe('REJECTED');

    authority!.set('outage');
    const business = (await auth(request(server()).post('/customers')).send({ kind: 'ESTABLISHMENT', name: `business ${Date.now()}`, otherIdScheme: 'CRN', otherId: '1010101010' }).expect(201)).body.id;
    const standard = await makeInvoice(business);

    const late = new Date(Date.now() + 30 * HOUR_MS);
    await deadline.runForCompany(companyId, late);
    expect(await deadlineNotes(rejected.id)).toHaveLength(0);
    expect(await deadlineNotes(standard.id)).toHaveLength(0);

    // The same unsent simplified document, had the company connected after it was created, is not counted.
    const before = await makeInvoice();
    const connectedAt = (await invoiceRow(before.id)).createdAt;
    const setConnection = (onboardedAt: Date) =>
      tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.update({ where: { companyId }, data: { onboardedAt } }));
    await setConnection(new Date(connectedAt.getTime() + 1));
    await deadline.runForCompany(companyId, late);
    expect(await deadlineNotes(before.id)).toHaveLength(0);
    // The probe sees it once the connection predates it.
    await setConnection(connectedAt);
    await deadline.runForCompany(companyId, late);
    expect((await deadlineNotes(before.id)).map((n) => n.dedupeKey)).toEqual([`zatca-report-late:${before.id}`]);
  });
});
