import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Deleting a document that holds a ZATCA chain link would leave a gap the
 * authority can see: the next document's PIH commits to the deleted hash, and
 * `latestChainHash` would chain new submissions onto the wrong predecessor.
 *
 * These tests lock in the delete guard: any invoice carrying a chain link
 * (ICV/hash) refuses deletion with a localized 409 — whatever its status,
 * because a REJECTED document keeps its link for retry and a CLEARED one is
 * final — while an unsubmitted invoice stays freely deletable.
 *
 * Same setup as zatca-phase2.e2e-spec.ts: a locally seeded self-signed
 * credential and an unroutable API base, so signing and chaining run for real
 * but no traffic ever reaches gw-fatoora.zatca.gov.sa.
 */
describe('ZATCA chain — invoice delete guard (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  let customerId: string;
  const createdInvoiceIds: string[] = [];

  async function seedProductionCredential() {
    const webcrypto = new Crypto();
    x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);

    const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
    const cert = await x509.X509CertificateGenerator.createSelfSigned(
      {
        serialNumber: '01',
        name: 'CN=mad-app-test, C=SA',
        notBefore: new Date('2026-01-01'),
        notAfter: new Date('2027-01-01'),
        keys,
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
      },
      webcrypto as unknown as globalThis.Crypto,
    );
    const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----\n`;

    const data = {
      privateKeyEnc: encryptSecret(privateKeyPem),
      productionCsidEnc: encryptSecret(Buffer.from(cert.rawData).toString('base64')),
      productionSecretEnc: encryptSecret('fake-production-secret'),
      status: 'PRODUCTION_ISSUED' as const,
    };

    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.zatcaCredential.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }),
    );
  }

  async function makeInvoice(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        issueDate: '2026-06-01',
        dueDate: '2026-06-30',
        lines: [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }],
      })
      .expect(201);
    createdInvoiceIds.push(res.body.id);
    return res.body.id;
  }

  async function submit(id: string) {
    return request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // Nothing listens on port 9: dispatch builds, signs and records the chain
    // for real, and only the outbound call fails — REJECTED with a stored link.
    process.env.ZATCA_API_BASE_OVERRIDE = 'http://127.0.0.1:9';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tenantPrisma = app.get(TenantPrismaService);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
    const customers = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${token}`);
    customerId = customers.body[0].id;

    await seedProductionCredential();
  }, 30000);

  afterAll(async () => {
    // Chained test rows can't go through the API delete (that refusal is the
    // very thing under test), and they aren't a real chain — strip the link,
    // then delete normally so journal entries are reversed too.
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.updateMany({
        where: { id: { in: createdInvoiceIds } },
        data: { zatcaUuid: null, zatcaHash: null, zatcaPreviousHash: null, zatcaIcv: null, zatcaStatus: 'NOT_SUBMITTED', zatcaSubmittedAt: null, zatcaMessage: null },
      }),
    );
    for (const id of createdInvoiceIds) {
      await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(204);
    }
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
    delete process.env.ZATCA_API_BASE_OVERRIDE;
    await app.close();
  });

  it('still deletes an invoice that was never submitted', async () => {
    const id = await makeInvoice();
    await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(204);
    createdInvoiceIds.splice(createdInvoiceIds.indexOf(id), 1);

    const list = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.some((inv: { id: string }) => inv.id === id)).toBe(false);
  });

  it('refuses to delete a REJECTED invoice whose chain link was recorded', async () => {
    const id = await makeInvoice();
    const submitted = await submit(id);
    // Precondition: the failed send still recorded the link — that recorded
    // position, not the status, is what makes deletion chain-breaking.
    expect(submitted.body.zatcaStatus).toBe('REJECTED');
    expect(submitted.body.zatcaIcv).toBeTruthy();
    expect(submitted.body.zatcaHash).toBeTruthy();

    const res = await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(res.body.message).toContain('سلسلة الفوترة الإلكترونية');

    // The refusal must have left the invoice — and its link — untouched.
    const list = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
    const kept = list.body.find((inv: { id: string }) => inv.id === id);
    expect(kept).toBeDefined();
    expect(kept.zatcaIcv).toBe(submitted.body.zatcaIcv);
    expect(kept.zatcaStatus).toBe('REJECTED');
  }, 30000);

  it('refuses to delete a CLEARED invoice', async () => {
    const id = await makeInvoice();
    await submit(id);
    // Clearance needs a certificate only the authority can issue, so it is
    // simulated: same chain link, final status.
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id }, data: { zatcaStatus: 'CLEARED' } }));

    const res = await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(res.body.message).toContain('سلسلة الفوترة الإلكترونية');
  }, 30000);

  it('keeps the chain intact after a refused delete — the next invoice still finds its predecessor', async () => {
    const a = await makeInvoice();
    const submittedA = await submit(a);
    await request(app.getHttpServer()).delete(`/invoices/${a}`).set('Authorization', `Bearer ${token}`).expect(409);

    // Had the delete gone through, latestChainHash would have picked an older
    // predecessor and the PIH here would not match A's hash.
    const b = await makeInvoice();
    const submittedB = await submit(b);
    expect(submittedB.body.zatcaPreviousHash).toBe(submittedA.body.zatcaHash);
    expect(submittedB.body.zatcaIcv).toBe(submittedA.body.zatcaIcv + 1);
  }, 40000);
});
