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
 * What may be edited after submission is decided by **acceptance**, not by
 * whether the chain was touched:
 *
 * - CLEARED — a standing legal document whose signed XML the authority holds.
 *   Editing the row would make the two disagree, so content is frozen and
 *   correction is by credit note.
 * - REJECTED — no legal existence at all. Fixing the data and resubmitting is
 *   the intended recovery (the retry reuses the same UUID/ICV/PIH), and a
 *   credit note against a document the authority never accepted would be a
 *   note against nothing.
 * - Deletion stays refused for both — a rejected invoice has still burned its
 *   ICV slot, so deleting leaves a gap while editing keeps the slot. That is
 *   the delete guard's own spec; the pairing is asserted here too, because it
 *   is exactly the invariant a future change to either guard would break.
 *
 * Two cases sit outside those three lines and are locked deliberately:
 * SUBMITTING (in flight — the outcome may yet be CLEARED) and a rejected
 * invoice that something has already chained onto (`latestChainHash` hands
 * out the most recent submission's hash whether or not it cleared, so a
 * successor's PIH may already commit to this one's hash).
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

  /** A submitted invoice. The send fails (nothing listens on port 9), so the
   * authority's verdict is REJECTED — but the chain link is recorded before
   * the call, which is the state the guard reasons about. */
  async function makeRejectedInvoice(): Promise<string> {
    const id = await makeInvoice();
    const submitted = await submit(id);
    expect(submitted.body.zatcaStatus).toBe('REJECTED');
    expect(submitted.body.zatcaIcv).toBeTruthy();
    expect(submitted.body.zatcaHash).toBeTruthy();
    return id;
  }

  /** Clearance needs a certificate only the authority can issue, so the final
   * status is simulated on top of a real submission: same chain link, and the
   * acceptance that freezes the content. */
  async function makeClearedInvoice(): Promise<string> {
    const id = await makeRejectedInvoice();
    await setStatus(id, 'CLEARED');
    return id;
  }

  function setStatus(id: string, zatcaStatus: 'CLEARED' | 'SUBMITTING' | 'STAMPED' | 'REJECTED') {
    return tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id }, data: { zatcaStatus } }));
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
    // اكتفاء ذاتي: ملف المنشأة شرطُ مسار ZATCA، والبذرة لا تملؤه.
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'شركة الأفق التجارية', vatNumber: '300000000000003' })
      .expect(200);

    // عميلان **يُنشئهما هذا الملف** بدل `customers.body[0]` و`[1]`: الاعتماد
    // على «أول ما تجده» يربط النتيجة بترتيب صفوفٍ لا يملكه، ويسقط على قاعدة
    // نظيفة فيها عميلٌ واحد أو لا عميل.
    const mkCustomer = async (name: string) =>
      (await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${token}`).send({ name }).expect(201)).body.id as string;
    const stamp = Date.now();
    customerId = await mkCustomer(`عميل حارس التعديل أ ${stamp}`);
    // ثانٍ مغاير، فيكون «تغيير العميل» تغييراً حقيقياً لا لا-عمليةً تمرّ من
    // الحارس بالمصادفة.
    otherCustomerId = await mkCustomer(`عميل حارس التعديل ب ${stamp}`);
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

  it('edits a REJECTED invoice freely — fixing the data is the recovery path', async () => {
    const id = await makeRejectedInvoice();
    const before = await getInvoice(id);

    const res = await patch(id, {
      customerId: otherCustomerId,
      issueDate: '2026-07-05',
      dueDate: '2026-07-25',
      lines: [{ description: 'بند مصحَّح', quantity: 3, unitPrice: 200, taxRate: 15 }],
    }).expect(200);

    expect(res.body.customerId).toBe(otherCustomerId);
    expect(Number(res.body.total)).toBe(690);
    expect(res.body.lines[0].description).toBe('بند مصحَّح');

    // The correction must not have cost the document its place in the
    // sequence: the retry has to reuse the position it already burned.
    const after = await getInvoice(id);
    expect(after!.zatcaIcv).toBe(before!.zatcaIcv);
    expect(after!.zatcaUuid).toBe(before!.zatcaUuid);
    expect(after!.zatcaPreviousHash).toBe(before!.zatcaPreviousHash);
  }, 40000);

  it('resubmits a corrected REJECTED invoice on the same ICV and UUID', async () => {
    const id = await makeRejectedInvoice();
    const before = await getInvoice(id);

    await patch(id, { lines: [{ description: 'بند بعد التصحيح', quantity: 1, unitPrice: 400, taxRate: 15 }] }).expect(200);
    const resubmitted = await submit(id);

    expect(resubmitted.body.zatcaIcv).toBe(before!.zatcaIcv);
    expect(resubmitted.body.zatcaUuid).toBe(before!.zatcaUuid);
    // The hash is recomputed over the corrected content — that is the whole
    // point of allowing the edit.
    expect(resubmitted.body.zatcaHash).not.toBe(before!.zatcaHash);
  }, 40000);

  it('still refuses to DELETE a REJECTED invoice, even though editing it is allowed', async () => {
    const id = await makeRejectedInvoice();

    // Editable...
    await patch(id, { lines: [{ description: 'بند', quantity: 1, unitPrice: 120, taxRate: 15 }] }).expect(200);
    // ...but the ICV slot is burned, so removal would still leave a gap.
    const res = await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(res.body.message).toContain('سلسلة الفوترة الإلكترونية');
  }, 40000);

  it('refuses to edit a REJECTED invoice once a later document is chained to it', async () => {
    const a = await makeRejectedInvoice();
    const first = await getInvoice(a);
    const b = await makeRejectedInvoice();

    // The link is set explicitly rather than by submitting B normally,
    // because `latestChainHash` no longer hands a rejected invoice's hash to
    // the next document — that fix at the source is covered in
    // zatca-phase2 ("never hands a rejected invoice's hash to the next
    // document"). This guard remains as the second layer: rows recorded
    // before that rule, or any future path that sets a PIH another way, can
    // still present this shape, and editing A would orphan B's PIH.
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.update({ where: { id: b }, data: { zatcaPreviousHash: first!.zatcaHash } }),
    );

    const res = await patch(a, { lines: [{ description: 'بند متأخر', quantity: 1, unitPrice: 300, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('يقطع ارتباطه');

    // B, with nothing chained onto it, is still editable.
    await patch(b, { lines: [{ description: 'بند طرف السلسلة', quantity: 1, unitPrice: 310, taxRate: 15 }] }).expect(200);
  }, 60000);

  it('refuses to edit an invoice that is mid-submission', async () => {
    const id = await makeRejectedInvoice();
    await setStatus(id, 'SUBMITTING');

    const res = await patch(id, { lines: [{ description: 'بند أثناء الإرسال', quantity: 1, unitPrice: 150, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('قيد الإرسال');
  }, 40000);

  it('refuses to edit a STAMPED invoice — signed, its receipt is out, and the authority may accept it any moment (ق-١٨٧)', async () => {
    const id = await makeRejectedInvoice();
    await setStatus(id, 'STAMPED');

    const res = await patch(id, { lines: [{ description: 'بند بعد الختم', quantity: 1, unitPrice: 160, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('مختومةٌ');
    // والوجه الثاني: تعود مردودةً فتُصحَّح — الطريق المقرَّر للتعافي لم يُغلق.
    await setStatus(id, 'REJECTED');
    await patch(id, { lines: [{ description: 'بند بعد الردّ', quantity: 1, unitPrice: 160, taxRate: 15 }] }).expect(200);
  }, 40000);

  it('refuses a line/amount edit on a CLEARED invoice', async () => {
    const id = await makeClearedInvoice();
    const before = await getInvoice(id);

    const res = await patch(id, { lines: [{ description: 'بند مزوَّر', quantity: 9, unitPrice: 999, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('مصدَّقة');
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
  }, 40000);

  it('refuses a customer or date edit on a CLEARED invoice', async () => {
    const id = await makeClearedInvoice();

    await patch(id, { customerId: otherCustomerId }).expect(409);
    await patch(id, { issueDate: '2026-09-09' }).expect(409);
    await patch(id, { dueDate: '2026-09-30' }).expect(409);

    const after = await getInvoice(id);
    expect(after!.customerId).toBe(customerId);
    expect(after!.issueDate.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(after!.dueDate.toISOString().slice(0, 10)).toBe('2026-06-30');
  }, 40000);

  it('refuses a currency or exchange-rate edit — both reach the authority as the SAR figures', async () => {
    const id = await makeClearedInvoice();

    await patch(id, { currency: 'USD' }).expect(409);
    await patch(id, { exchangeRate: 3.75 }).expect(409);

    const after = await getInvoice(id);
    expect(after!.currency).toBe('SAR');
    expect(Number(after!.exchangeRate)).toBe(1);
    // baseTaxTotal is the VAT figure ZATCA is told, in SAR — unchanged.
    expect(Number(after!.baseTaxTotal)).toBe(15);
  }, 40000);

  it('still allows a notes-only edit on a CLEARED invoice — notes never enter the signed XML', async () => {
    const id = await makeClearedInvoice();
    const before = await getInvoice(id);

    const res = await patch(id, { notes: 'ملاحظة داخلية بعد التصديق' }).expect(200);
    expect(res.body.notes).toBe('ملاحظة داخلية بعد التصديق');

    const after = await getInvoice(id);
    expect(after!.zatcaHash).toBe(before!.zatcaHash);
    expect(after!.zatcaIcv).toBe(before!.zatcaIcv);
    expect(Number(after!.total)).toBe(Number(before!.total));
  }, 40000);

  it('still allows a status-only edit — a cleared invoice must remain markable PAID', async () => {
    const id = await makeClearedInvoice();

    const res = await patch(id, { status: 'PAID' }).expect(200);
    expect(res.body.status).toBe('PAID');

    const after = await getInvoice(id);
    expect(after!.zatcaStatus).toBe('CLEARED');
    expect(after!.zatcaHash).toBeTruthy();
  }, 40000);

  it('leaves the invoice and its posted journal entry untouched after a refused edit', async () => {
    const id = await makeClearedInvoice();
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
