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
 * Editing a document that holds a ZATCA chain link is the same defect as
 * deleting one, one step subtler: the row stays, but the hash recorded with
 * the authority was computed over the *old* content. The stored hash then
 * describes a document that no longer exists, and every successor's PIH
 * commits to it.
 *
 * These tests lock in the edit guard next to the delete guard
 * (zatca-invoice-delete-guard.e2e-spec.ts): once a link exists, anything the
 * signature covers — lines, amounts, customer, dates, currency/rate — is
 * refused with a localized 409, while the fields that never enter the XML
 * (notes, payment status) stay editable, because an invoice must still be
 * markable PAID after the authority has seen it. Correction is a credit note.
 *
 * Same setup as the delete-guard spec: a locally seeded self-signed
 * credential and an unroutable API base, so signing and chaining run for real
 * but no traffic ever reaches gw-fatoora.zatca.gov.sa.
 */
describe('ZATCA chain — invoice edit guard (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  let customerId: string;
  let otherCustomerId: string;
  const createdInvoiceIds: string[] = [];

  const LINES = [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }];

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
      .send({ customerId, issueDate: '2026-06-01', dueDate: '2026-06-30', notes: 'ملاحظة أصلية', lines: LINES })
      .expect(201);
    createdInvoiceIds.push(res.body.id);
    return res.body.id;
  }

  /** An invoice that already carries a chain link. The send fails (nothing
   * listens on port 9), but the link is recorded before the call — which is
   * exactly the state the guard is about. */
  async function makeChainedInvoice(): Promise<string> {
    const id = await makeInvoice();
    const submitted = await submit(id);
    expect(submitted.body.zatcaIcv).toBeTruthy();
    expect(submitted.body.zatcaHash).toBeTruthy();
    return id;
  }

  function submit(id: string) {
    return request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
  }

  function patch(id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).patch(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).send(body);
  }

  function getInvoice(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.findUnique({ where: { id }, include: { lines: true } }));
  }

  /** The posted entry with its lines, ordered so two snapshots compare. */
  function getEntry(entryId: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.journalEntry.findUnique({ where: { id: entryId }, include: { lines: { orderBy: { debit: 'desc' } } } }),
    );
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
    // A second seeded customer, so "change the customer" is a real change —
    // not a no-op that would slip past a guard by accident.
    otherCustomerId = customers.body[1].id;
    expect(otherCustomerId).not.toBe(customerId);

    await seedProductionCredential();
  }, 30000);

  afterAll(async () => {
    // Chained test rows can't go through the API delete (that refusal is the
    // delete guard's own test) — strip the link, then delete normally so the
    // journal entries are reversed too.
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

  it('still edits an invoice that was never submitted', async () => {
    const id = await makeInvoice();

    const res = await patch(id, {
      customerId: otherCustomerId,
      issueDate: '2026-07-01',
      dueDate: '2026-07-31',
      lines: [{ description: 'بند معدَّل', quantity: 2, unitPrice: 250, taxRate: 15 }],
    }).expect(200);

    expect(res.body.customerId).toBe(otherCustomerId);
    expect(Number(res.body.total)).toBe(575);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].description).toBe('بند معدَّل');
  }, 30000);

  it('refuses a line/amount edit once the invoice carries a chain link', async () => {
    const id = await makeChainedInvoice();
    const before = await getInvoice(id);

    const res = await patch(id, { lines: [{ description: 'بند مزوَّر', quantity: 9, unitPrice: 999, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('سلسلة الفوترة الإلكترونية');
    // The remedy has to be in the message — a merchant blocked without being
    // told what to do instead will reach for the delete button next.
    expect(res.body.message).toContain('إشعار دائن');

    // The refusal must not have replaced the lines: update() deletes them all
    // before recreating, so a guard placed after that point would leave the
    // invoice stripped even though the request failed.
    const after = await getInvoice(id);
    expect(after!.lines).toHaveLength(before!.lines.length);
    expect(after!.lines[0].description).toBe('بند');
    expect(Number(after!.total)).toBe(Number(before!.total));
  }, 30000);

  it('refuses a customer or date edit once the invoice carries a chain link', async () => {
    const id = await makeChainedInvoice();

    const customerRes = await patch(id, { customerId: otherCustomerId }).expect(409);
    expect(customerRes.body.message).toContain('سلسلة الفوترة الإلكترونية');
    await patch(id, { issueDate: '2026-09-09' }).expect(409);
    await patch(id, { dueDate: '2026-09-30' }).expect(409);

    const after = await getInvoice(id);
    expect(after!.customerId).toBe(customerId);
    expect(after!.issueDate.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(after!.dueDate.toISOString().slice(0, 10)).toBe('2026-06-30');
  }, 40000);

  it('refuses a currency or exchange-rate edit — both reach the authority as the SAR figures', async () => {
    const id = await makeChainedInvoice();

    await patch(id, { currency: 'USD' }).expect(409);
    await patch(id, { exchangeRate: 3.75 }).expect(409);

    const after = await getInvoice(id);
    expect(after!.currency).toBe('SAR');
    expect(Number(after!.exchangeRate)).toBe(1);
    // baseTaxTotal is the VAT figure ZATCA is told, in SAR — unchanged.
    expect(Number(after!.baseTaxTotal)).toBe(15);
  }, 40000);

  it('still allows a notes-only edit — notes never enter the signed XML', async () => {
    const id = await makeChainedInvoice();
    const before = await getInvoice(id);

    const res = await patch(id, { notes: 'ملاحظة داخلية بعد الإرسال' }).expect(200);
    expect(res.body.notes).toBe('ملاحظة داخلية بعد الإرسال');

    // Allowed, but it must not have disturbed the chain or the amounts.
    const after = await getInvoice(id);
    expect(after!.zatcaHash).toBe(before!.zatcaHash);
    expect(after!.zatcaIcv).toBe(before!.zatcaIcv);
    expect(Number(after!.total)).toBe(Number(before!.total));
  }, 30000);

  it('still allows a status-only edit — a cleared invoice must remain markable PAID', async () => {
    const id = await makeChainedInvoice();
    // The real case this protects: the authority has finalised the document,
    // and the customer then pays it.
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id }, data: { zatcaStatus: 'CLEARED' } }));

    const res = await patch(id, { status: 'PAID' }).expect(200);
    expect(res.body.status).toBe('PAID');

    const after = await getInvoice(id);
    expect(after!.zatcaStatus).toBe('CLEARED');
    expect(after!.zatcaHash).toBeTruthy();
  }, 30000);

  it('leaves the invoice and its posted journal entry untouched after a refused edit', async () => {
    const id = await makeChainedInvoice();
    const before = await getInvoice(id);
    // Precondition: there is actually a posted entry to protect. A content
    // edit re-posts (see affectsPosting in InvoicesService.update), so a guard
    // that ran too late would reverse this entry and issue a new one.
    expect(before!.journalEntryId).toBeTruthy();
    const entryBefore = await getEntry(before!.journalEntryId!);
    expect(entryBefore).not.toBeNull();

    await patch(id, {
      customerId: otherCustomerId,
      issueDate: '2026-10-10',
      lines: [{ description: 'بند مزوَّر', quantity: 4, unitPrice: 500, taxRate: 15 }],
    }).expect(409);

    const after = await getInvoice(id);
    expect(after!.customerId).toBe(before!.customerId);
    expect(Number(after!.total)).toBe(Number(before!.total));
    expect(after!.lines.map((l) => l.description)).toEqual(before!.lines.map((l) => l.description));
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());

    // Same entry id — not detached, not reversed, not re-posted — with the
    // same number, memo and amounts down to the line.
    expect(after!.journalEntryId).toBe(before!.journalEntryId);
    const entryAfter = await getEntry(before!.journalEntryId!);
    expect(entryAfter!.no).toBe(entryBefore!.no);
    expect(entryAfter!.memo).toBe(entryBefore!.memo);
    expect(Number(entryAfter!.totalDebit)).toBe(Number(entryBefore!.totalDebit));
    expect(entryAfter!.lines.map((l) => [l.accountId, Number(l.debit), Number(l.credit)])).toEqual(
      entryBefore!.lines.map((l) => [l.accountId, Number(l.debit), Number(l.credit)]),
    );
  }, 40000);
});
