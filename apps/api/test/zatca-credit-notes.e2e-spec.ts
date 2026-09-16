import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { expectNothingBetweenIcv } from './zatca-chain.util';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';

/**
 * Credit notes as documents: issued against an invoice, never touching it,
 * reversing its ledger footprint through their own posted entry, and taking an
 * ordinary position in the ZATCA hash chain.
 *
 * Nothing here talks to gw-fatoora.zatca.gov.sa — the submission cases point
 * dispatch at a dead port, which exercises everything up to and including the
 * chain bookkeeping while the outbound call itself fails.
 */
describe('ZATCA credit notes (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  let customerId: string;
  const createdInvoiceIds: string[] = [];

  async function makeInvoice(unitPrice = 100) {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        lines: [{ description: 'بند اختبار إشعار', quantity: 1, unitPrice, taxRate: 15 }],
      })
      .expect(201);
    createdInvoiceIds.push(res.body.id);
    return res.body as { id: string; no: string; total: string; journalEntryId?: string | null };
  }

  function issueNote(invoiceId: string, body: Record<string, unknown> = { reason: 'إرجاع بضاعة' }) {
    return request(app.getHttpServer()).post(`/invoices/${invoiceId}/credit-note`).set('Authorization', `Bearer ${token}`).send(body);
  }

  /** Live balances of the three accounts an invoice posting touches. */
  async function coreBalances(): Promise<Record<string, number>> {
    const rows = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.account.findMany({ where: { code: { in: ['1200', '4100', '2200'] } }, select: { code: true, balance: true } }),
    );
    return Object.fromEntries(rows.map((r) => [r.code, Number(r.balance)]));
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // Dead port: dispatch runs for real (build, sign, chain) and only the
    // outbound call fails — no test traffic reaches the authority.
    process.env.ZATCA_API_BASE_OVERRIDE = 'http://127.0.0.1:9';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    tenantPrisma = app.get(TenantPrismaService);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
    // اكتفاء ذاتي: ملف المنشأة شرطُ مسار ZATCA (zatca_profile_incomplete →
    // 400)، والبذرة لا تملؤه؛ وعميلٌ خاص بدل `customers.body[0]` الذي يربط
    // النتيجة بترتيب صفوفٍ لا يملكه هذا الملف.
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'شركة الأفق التجارية', vatNumber: '300000000000003' })
      .expect(200);
    customerId = (
      await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `عميل إشعارات ${Date.now()}` })
        .expect(201)
    ).body.id;
  }, 30000);

  afterAll(async () => {
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣):
    // الإشعاراتُ قبل فواتيرها، وقيودُها تُعكس.
    await purgeInvoicesForTest(tenantPrisma, companyId, createdInvoiceIds);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
    delete process.env.ZATCA_API_BASE_OVERRIDE;
    await app.close();
  });

  it('issues a full credit note: own CN number, positive amounts, linked to the original, nothing receivable', async () => {
    const invoice = await makeInvoice();
    const res = await issueNote(invoice.id).expect(201);
    createdInvoiceIds.push(res.body.id);

    expect(res.body.docType).toBe('CREDIT_NOTE');
    expect(res.body.no).toMatch(/^CN-\d{4}-\d{4}$/);
    expect(res.body.relatedInvoice.no).toBe(invoice.no);
    expect(res.body.adjustmentReason).toBe('إرجاع بضاعة');
    // Positive amounts — the docType carries the direction, exactly like the
    // UBL document the authority receives.
    expect(Number(res.body.total)).toBe(Number(invoice.total));
    // Nothing is receivable on a note; PAID keeps it out of aging math.
    expect(res.body.status).toBe('PAID');
  });

  it('reverses the invoice posting through its own entry, returning 1200/4100/2200 to their pre-invoice values', async () => {
    const before = await coreBalances();
    const invoice = await makeInvoice(200);
    const afterInvoice = await coreBalances();
    // Sanity: the invoice really moved the books (A/R up by the total).
    expect(afterInvoice['1200'] - before['1200']).toBeCloseTo(230, 2);

    const res = await issueNote(invoice.id).expect(201);
    createdInvoiceIds.push(res.body.id);

    // The note posts its own auto entry (never edits the invoice's)...
    expect(res.body.journalEntryId).toBeTruthy();
    const noteEntry = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.journalEntry.findUnique({ where: { id: res.body.journalEntryId }, include: { lines: true } }),
    );
    expect(noteEntry!.auto).toBe(true);
    expect(noteEntry!.lines).toHaveLength(3);

    // ...and the original invoice keeps its own entry untouched.
    const original = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.findUnique({ where: { id: invoice.id } }));
    expect(original!.journalEntryId).toBeTruthy();
    expect(original!.journalEntryId).not.toBe(res.body.journalEntryId);

    // Net effect on the books: zero.
    const afterNote = await coreBalances();
    for (const code of ['1200', '4100', '2200']) {
      expect(afterNote[code]).toBeCloseTo(before[code], 2);
    }
  });

  it('supports partial credits and refuses to credit beyond what the invoice billed', async () => {
    const invoice = await makeInvoice(100); // total 115
    const partial = await issueNote(invoice.id, {
      reason: 'إرجاع جزئي',
      lines: [{ description: 'بند اختبار إشعار', quantity: 0.5, unitPrice: 100, taxRate: 15 }],
    }).expect(201);
    createdInvoiceIds.push(partial.body.id);
    expect(Number(partial.body.total)).toBeCloseTo(57.5, 2);

    // A full credit now exceeds the remaining 57.50 — refused.
    const over = await issueNote(invoice.id).expect(400);
    expect(over.body.message).toContain('creditNotes.exceeds_remaining');

    // Crediting exactly the remainder is fine.
    const rest = await issueNote(invoice.id, {
      reason: 'إرجاع الباقي',
      lines: [{ description: 'بند اختبار إشعار', quantity: 0.5, unitPrice: 100, taxRate: 15 }],
    }).expect(201);
    createdInvoiceIds.push(rest.body.id);
  });

  it('refuses a note against a note, an edit of a note, and an empty reason', async () => {
    const invoice = await makeInvoice();
    const note = await issueNote(invoice.id).expect(201);
    createdInvoiceIds.push(note.body.id);

    // Crediting a credit note would double-reverse.
    const onNote = await issueNote(note.body.id).expect(400);
    expect(onNote.body.message).toContain('creditNotes.target_invalid');

    // A note adjusts a document as it stood — it is never edited afterwards.
    const edit = await request(app.getHttpServer())
      .patch(`/invoices/${note.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DUE' })
      .expect(400);
    expect(edit.body.message).toContain('creditNotes.immutable');

    // The reason is mandatory — ZATCA rejects a 381 without one (BR-KSA-17).
    await issueNote(invoice.id, { reason: '' }).expect(400);
  });

  it('refuses to delete the invoice and its note alike — both issued, both corrected by a note (ق-٩٤٣ · ق-٩٥٢)', async () => {
    const invoice = await makeInvoice();
    const note = await issueNote(invoice.id).expect(201);
    createdInvoiceIds.push(note.body.id);

    // هذه الحزمةُ بلا مرشِّح الترجمة — فالرسالةُ مفتاحُها (النصُّ العربيّ يُطابَق في `issued-invoice-immutable`).
    const blockedInvoice = await request(app.getHttpServer()).delete(`/invoices/${invoice.id}`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(blockedInvoice.body.message).toContain('invoices.issued_locked');

    // الإشعارُ صادرٌ برقمه يدخل السلسلة — ورسالتُه تسمّي الإشعارَ المقابل لا الحذف.
    const blockedNote = await request(app.getHttpServer()).delete(`/invoices/${note.body.id}`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(blockedNote.body.message).toContain('creditNotes.immutable');
  });

  it('enters the VAT declaration with a flipped sign, cancelling its invoice out', async () => {
    const now = new Date();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const query = `year=${now.getUTCFullYear()}&quarter=${quarter}`;
    const before = await request(app.getHttpServer()).get(`/obligations/vat-declaration?${query}`).set('Authorization', `Bearer ${token}`).expect(200);

    const invoice = await makeInvoice(300); // subtotal 300, VAT 45
    const note = await issueNote(invoice.id).expect(201);
    createdInvoiceIds.push(note.body.id);

    const after = await request(app.getHttpServer()).get(`/obligations/vat-declaration?${query}`).set('Authorization', `Bearer ${token}`).expect(200);
    // +300 from the invoice, −300 from the note: the pair nets to zero.
    expect(after.body.salesStandard).toBeCloseTo(before.body.salesStandard, 2);
    expect(after.body.salesStandardVat).toBeCloseTo(before.body.salesStandardVat, 2);
    // مهلةٌ صريحة: الإقرارُ يقرأ قسمَ الإيجار ويعدّ ما لم يُرحَّل (ق-٩٢٧) — وعلى قاعدة التطوير الكبيرة يجاوز الخمسَ ثوانٍ.
  }, 30000);

  describe('ZATCA submission', () => {
    /** Same stand-in credential as zatca-phase2.e2e-spec.ts: a real secp256k1
     * key and a self-signed certificate of the right shape. */
    beforeAll(async () => {
      const webcrypto = new Crypto();
      x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);
      const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
      const cert = await x509.X509CertificateGenerator.createSelfSigned(
        {
          serialNumber: '02',
          name: 'CN=mad-app-test, C=SA',
          notBefore: new Date('2026-01-01'),
          notAfter: new Date('2027-01-01'),
          keys,
          signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
        },
        webcrypto as unknown as globalThis.Crypto,
      );
      const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
      const data = {
        privateKeyEnc: encryptSecret(`-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----\n`),
        productionCsidEnc: encryptSecret(Buffer.from(cert.rawData).toString('base64')),
        productionSecretEnc: encryptSecret('fake-production-secret'),
        status: 'PRODUCTION_ISSUED' as const,
      };
      await tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.zatcaCredential.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }),
      );
    }, 30000);

    it('[SPEC 30.11] a credit note takes an ordinary position in the one hash chain', async () => {
      const invoice = await makeInvoice();
      const a = await request(app.getHttpServer()).post(`/zatca/invoices/${invoice.id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      // Only an accepted document is handed on as the next PIH (see
      // latestChainHash) — a rejected one is skipped, so the invoice is
      // cleared here to make it a genuine predecessor.
      await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id: invoice.id }, data: { zatcaStatus: 'CLEARED' } }));

      const note = await issueNote(invoice.id).expect(201);
      createdInvoiceIds.push(note.body.id);
      const b = await request(app.getHttpServer()).post(`/zatca/invoices/${note.body.id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);

      // The chain does not fork per document type: the note chains onto the
      // invoice's hash and takes the next counter — **ولا أحدَ بينهما**
      // (`ق-٢٩٢`: الدعوى محلّيةٌ فتُقاس محلّياً، لا بفارقٍ عدديّ مطلق).
      expect(b.body.zatcaPreviousHash).toBe(a.body.zatcaHash);
      await expectNothingBetweenIcv(tenantPrisma, companyId, a.body.zatcaIcv, b.body.zatcaIcv);
      expect(b.body.zatcaHash).toBeTruthy();
      expect(b.body.zatcaHash).not.toBe(a.body.zatcaHash);
    }, 30000);

    it('refuses to delete any document whose chain position is assigned — rejected ones included', async () => {
      const invoice = await makeInvoice();
      const submitted = await request(app.getHttpServer()).post(`/zatca/invoices/${invoice.id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      // The dead port means the authority never accepted it…
      expect(submitted.body.zatcaStatus).toBe('REJECTED');

      // …and it still can't be deleted: a retry reuses this UUID/ICV, so the
      // position is burned either way. Deleting it would leave the next
      // document chained onto a hash that no longer exists locally.
      const res = await request(app.getHttpServer()).delete(`/invoices/${invoice.id}`).set('Authorization', `Bearer ${token}`).expect(409);
      expect(res.body.message).toContain('invoices.issued_locked');
    }, 30000);

    it('freezes a CLEARED invoice against data edits, while REJECTED stays fixable and payment status stays free', async () => {
      const invoice = await makeInvoice();
      await request(app.getHttpServer()).post(`/zatca/invoices/${invoice.id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);

      // REJECTED is the fix-and-retry state — editing the data is the point.
      await request(app.getHttpServer())
        .patch(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lines: [{ description: 'بند مُصحَّح', quantity: 1, unitPrice: 120, taxRate: 15 }] })
        .expect(200);

      // CLEARED cannot be reached without the authority — stamped directly.
      await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id: invoice.id }, data: { zatcaStatus: 'CLEARED' } }));

      // The XML the authority holds is now the legal document: data edits are
      // refused, the local payment status still moves.
      const frozen = await request(app.getHttpServer())
        .patch(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lines: [{ description: 'تلاعب بعد التصديق', quantity: 1, unitPrice: 1, taxRate: 15 }] })
        .expect(409);
      expect(frozen.body.message).toContain('invoices.issued_locked');
      await request(app.getHttpServer()).patch(`/invoices/${invoice.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'PAID' }).expect(200);
    }, 30000);
  });

  describe('debit notes (383)', () => {
    function issueDebit(invoiceId: string, body: Record<string, unknown>) {
      return request(app.getHttpServer()).post(`/invoices/${invoiceId}/debit-note`).set('Authorization', `Bearer ${token}`).send(body);
    }

    it('bills additional amounts: DN number, status DUE, books moving in the invoice direction', async () => {
      const before = await coreBalances();
      const invoice = await makeInvoice();
      const res = await issueDebit(invoice.id, {
        reason: 'تكاليف شحن غير مفوترة',
        lines: [{ description: 'شحن', quantity: 1, unitPrice: 40, taxRate: 15 }],
      }).expect(201);
      createdInvoiceIds.push(res.body.id);

      expect(res.body.docType).toBe('DEBIT_NOTE');
      expect(res.body.no).toMatch(/^DN-\d{4}-\d{4}$/);
      expect(res.body.relatedInvoice.no).toBe(invoice.no);
      // A debit note IS receivable — unlike the credit note's fixed PAID.
      expect(res.body.status).toBe('DUE');
      expect(Number(res.body.total)).toBeCloseTo(46, 2);
      expect(res.body.journalEntryId).toBeTruthy();

      // Invoice 115 + note 46: A/R rises by both — same direction, not a reversal.
      const after = await coreBalances();
      expect(after['1200'] - before['1200']).toBeCloseTo(161, 2);
    });

    it('demands explicit lines and a reason — there is no full-copy default to double-bill with', async () => {
      const invoice = await makeInvoice();
      await issueDebit(invoice.id, { reason: 'سبب بلا بنود' }).expect(400);
      await issueDebit(invoice.id, { reason: '', lines: [{ description: 'x', quantity: 1, unitPrice: 10, taxRate: 15 }] }).expect(400);
    });

    it('allows the payment status to move but nothing else', async () => {
      const invoice = await makeInvoice();
      const note = await issueDebit(invoice.id, {
        reason: 'فرق سعر',
        lines: [{ description: 'فرق', quantity: 1, unitPrice: 10, taxRate: 15 }],
      }).expect(201);
      createdInvoiceIds.push(note.body.id);

      await request(app.getHttpServer()).patch(`/invoices/${note.body.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'PAID' }).expect(200);
      const edit = await request(app.getHttpServer())
        .patch(`/invoices/${note.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lines: [{ description: 'تغيير المبلغ', quantity: 2, unitPrice: 10, taxRate: 15 }] })
        .expect(400);
      expect(edit.body.message).toContain('creditNotes.immutable');
    });

    it('adds to the VAT declaration with a positive sign', async () => {
      const now = new Date();
      const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
      const query = `year=${now.getUTCFullYear()}&quarter=${quarter}`;
      const before = await request(app.getHttpServer()).get(`/obligations/vat-declaration?${query}`).set('Authorization', `Bearer ${token}`).expect(200);

      const invoice = await makeInvoice(100);
      const note = await issueDebit(invoice.id, {
        reason: 'زيادة',
        lines: [{ description: 'زيادة', quantity: 1, unitPrice: 50, taxRate: 15 }],
      }).expect(201);
      createdInvoiceIds.push(note.body.id);

      const after = await request(app.getHttpServer()).get(`/obligations/vat-declaration?${query}`).set('Authorization', `Bearer ${token}`).expect(200);
      // +100 invoice +50 debit note — the note bills, it doesn't reduce.
      expect(after.body.salesStandard - before.body.salesStandard).toBeCloseTo(150, 2);
      expect(after.body.salesStandardVat - before.body.salesStandardVat).toBeCloseTo(22.5, 2);
    });
  });
});
