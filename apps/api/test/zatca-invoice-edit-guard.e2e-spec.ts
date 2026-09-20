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
import { purgeInvoicesForTest } from './purge-invoices';
import { startAuthorityStub, type AuthorityStub } from './zatca-authority-stub';

/**
 * What may be edited after submission is decided by **acceptance**, not by
 * whether the chain was touched:
 *
 * - CLEARED — a standing legal document whose signed XML the authority holds.
 *   Editing the row would make the two disagree, so content is frozen and
 *   correction is by credit note.
 * - REJECTED — closed as it is (ق-٩٥٨ · ق-٩٦٤): the authority keeps its counter
 *   and hash untouched, so it is neither edited nor resubmitted; the correction
 *   is a replacement document with a new number, counter and hash
 *   (`test/rejected-replacement.e2e-spec.ts`), and no note may target it.
 * - Deletion stays refused for both — a rejected invoice has still burned its
 *   ICV slot. That is the delete guard's own spec; the pairing is asserted
 *   here too, because it is exactly the invariant a future change to either
 *   guard would break.
 *
 * SUBMITTING (in flight — the outcome may yet be CLEARED) and STAMPED are
 * locked as well: one guard, one message (ق-٩٥٠).
 *
 * Same setup as the delete-guard spec: a locally seeded self-signed
 * credential and an unroutable API base, so signing and chaining run for real
 * but no traffic ever reaches gw-fatoora.zatca.gov.sa.
 */
describe('ZATCA chain — invoice edit guard (e2e)', () => {
  let app: INestApplication;
  let authority: AuthorityStub;
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

  /** A submitted invoice the local authority answers with 400, so the
   * authority's verdict is REJECTED — and the chain link is recorded before
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
    // خادمٌ محلّيّ يمثّل الهيئة ويجيب بالردّ `400` (ق-٩٧١): يُبنى ويُوقَّع ويُسجَّل الموقعُ
    // فعلاً، والردُّ جوابٌ حقيقيُّ الشكل — REJECTED بموقعٍ محفوظ، لا سقوطُ نقلٍ يُعاد.
    authority = await startAuthorityStub('reject');

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
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(tenantPrisma, companyId, createdInvoiceIds);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
    await authority.close();
    await app.close();
  });

  it('refuses to edit an issued invoice that was never submitted — issued is issued, stamped or not (ق-٩٤٣)', async () => {
    const id = await makeInvoice();
    const before = await getInvoice(id);

    // ⚖️ كانت هذه الحالةُ تمرّ («لم تُرسَل قطّ فتُعدَّل») — والحكمُ: الصادرةُ لا تُعدَّل
    // مختومةً كانت أو لا، فالعميلُ يحمل رقمَها ورمزَها منذ الإصدار (ق-٩٤٣ · ق-٩٤١).
    const res = await patch(id, {
      customerId: otherCustomerId,
      issueDate: '2026-07-01',
      dueDate: '2026-07-31',
      lines: [{ description: 'بند معدَّل', quantity: 2, unitPrice: 250, taxRate: 15 }],
    }).expect(409);
    expect(res.body.message).toContain('صدرت');
    expect(res.body.message).toContain('إشعار دائن');

    const after = await getInvoice(id);
    expect(after!.customerId).toBe(before!.customerId);
    expect(after!.total.toString()).toBe(before!.total.toString());
    expect(after!.lines.map((l) => l.id)).toEqual(before!.lines.map((l) => l.id));
  }, 30000);

  // ⚖️ المردودةُ تُغلق ولا تُمسّ ويُصدَر بدلاً منها جديد (ق-٩٥٨ · ق-٩٦٤): كانت الحالاتُ الأربعُ
  // التالية تُجيز التصحيحَ وإعادةَ الإرسال على الموقع نفسه — وقُلبت بحكم الكتالوج: عدّادُ المردود
  // وتجزئتُه لا يُمسّان، والتصحيحُ مستندٌ جديد (test/rejected-replacement.e2e-spec.ts).
  it('refuses to edit a REJECTED invoice — closed as it is, the correction is a replacement (ق-٩٥٨)', async () => {
    const id = await makeRejectedInvoice();
    const before = await getInvoice(id);

    const res = await patch(id, {
      customerId: otherCustomerId,
      issueDate: '2026-07-05',
      dueDate: '2026-07-25',
      lines: [{ description: 'بند مصحَّح', quantity: 3, unitPrice: 200, taxRate: 15 }],
    }).expect(409);
    expect(res.body.message).toContain('صدرت');

    // المردودةُ كما هي: بنودُها وموقعُها وتجزئتُها.
    const after = await getInvoice(id);
    expect(after!.customerId).toBe(before!.customerId);
    expect(after!.total.toString()).toBe(before!.total.toString());
    expect(after!.lines.map((l) => l.id)).toEqual(before!.lines.map((l) => l.id));
    expect(after!.zatcaIcv).toBe(before!.zatcaIcv);
    expect(after!.zatcaUuid).toBe(before!.zatcaUuid);
    expect(after!.zatcaHash).toBe(before!.zatcaHash);
    expect(after!.zatcaPreviousHash).toBe(before!.zatcaPreviousHash);
  }, 40000);

  it('refuses to resubmit a REJECTED invoice — no second signature on the same slot; the message names the exit', async () => {
    const id = await makeRejectedInvoice();
    const before = await getInvoice(id);

    const res = await request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(400);
    expect(res.body.message).toContain('أصدِر بدلاً');

    const after = await getInvoice(id);
    expect(after!.zatcaStatus).toBe('REJECTED');
    expect(after!.zatcaIcv).toBe(before!.zatcaIcv);
    expect(after!.zatcaUuid).toBe(before!.zatcaUuid);
    expect(after!.zatcaHash).toBe(before!.zatcaHash);
    expect(after!.zatcaSignedXml).toBe(before!.zatcaSignedXml);
  }, 40000);

  it('still refuses to DELETE a REJECTED invoice — the slot is burned, and closed is closed', async () => {
    const id = await makeRejectedInvoice();

    const res = await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(409);
    // رسالةٌ واحدة للجميع تسمّي المخرج (ق-٩٥٠).
    expect(res.body.message).toContain('صدرت');
    expect(res.body.message).toContain('إشعار دائن');
  }, 40000);

  it('refuses to edit a REJECTED invoice whether or not a later document is chained to it', async () => {
    const a = await makeRejectedInvoice();
    const first = await getInvoice(a);
    const b = await makeRejectedInvoice();

    // كان الخَلَفُ المتسلسل هو ما يقفل المردودةَ وحدَه — والآن الردُّ نفسُه يقفلها (ق-٩٥٨)؛
    // يبقى الشكلُ هنا كي يُثبَت أن الحكم واحدٌ في الحالين.
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.update({ where: { id: b }, data: { zatcaPreviousHash: first!.zatcaHash } }),
    );

    const res = await patch(a, { lines: [{ description: 'بند متأخر', quantity: 1, unitPrice: 300, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('صدرت');

    // وB — لا خَلَفَ لها — مردودةٌ كذلك فلا تُعدَّل.
    const tail = await patch(b, { lines: [{ description: 'بند طرف السلسلة', quantity: 1, unitPrice: 310, taxRate: 15 }] }).expect(409);
    expect(tail.body.message).toContain('صدرت');
  }, 60000);

  it('refuses to edit an invoice that is mid-submission', async () => {
    const id = await makeRejectedInvoice();
    await setStatus(id, 'SUBMITTING');

    const res = await patch(id, { lines: [{ description: 'بند أثناء الإرسال', quantity: 1, unitPrice: 150, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('صدرت');
  }, 40000);

  it('refuses to edit a STAMPED invoice — signed, its receipt is out, and the authority may accept it any moment (ق-١٨٧)', async () => {
    const id = await makeRejectedInvoice();
    await setStatus(id, 'STAMPED');

    const res = await patch(id, { lines: [{ description: 'بند بعد الختم', quantity: 1, unitPrice: 160, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('صدرت');
    // والوجه الثاني: تعود مردودةً فتبقى مقفلةً كذلك — التعافي بدلٌ جديد لا تصحيحٌ عليها (ق-٩٥٨).
    await setStatus(id, 'REJECTED');
    const rejected = await patch(id, { lines: [{ description: 'بند بعد الردّ', quantity: 1, unitPrice: 160, taxRate: 15 }] }).expect(409);
    expect(rejected.body.message).toContain('صدرت');
  }, 40000);

  it('refuses a line/amount edit on a CLEARED invoice', async () => {
    const id = await makeClearedInvoice();
    const before = await getInvoice(id);

    const res = await patch(id, { lines: [{ description: 'بند مزوَّر', quantity: 9, unitPrice: 999, taxRate: 15 }] }).expect(409);
    expect(res.body.message).toContain('صدرت');
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

  it('a cleared invoice still becomes PAID — through a receipt, never through PATCH (ق-١١٩٨/②)', async () => {
    const id = await makeClearedInvoice();
    const before = await getInvoice(id);

    // الحالةُ ليست حقلَ تعديل: تُردّ بالقائمة البيضاء قبل أن تبلغ الخدمة.
    await patch(id, { status: 'PAID' }).expect(400);
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, date: new Date().toISOString().slice(0, 10), amount: Number(before!.total), method: 'CASH', allocations: [{ invoiceId: id, amount: Number(before!.total) }] })
      .expect(201);

    const after = await getInvoice(id);
    expect(after!.status).toBe('PAID');
    expect(after!.zatcaStatus).toBe('CLEARED');
    expect(after!.zatcaHash).toBe(before!.zatcaHash);
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
