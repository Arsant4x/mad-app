import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { decryptSecret, encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { createHash } from 'node:crypto';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { GENESIS_PREVIOUS_HASH, invoiceTypeFor } from '../src/zatca/hash-chain.util';
import { defaultUnitSerial } from '../src/zatca/egs-unit.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { expectNothingBetweenIcv } from './zatca-chain.util';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';

/**
 * Phase 2 cannot clear a real invoice without a certificate issued by the
 * authority, so what these lock in is everything *around* that: onboarding
 * refuses out-of-order steps, key material never leaves the server, the chain
 * is computed and stored correctly, and submission fails diagnosably instead of
 * pretending to succeed.
 *
 * Nothing here talks to gw-fatoora.zatca.gov.sa. Every case either stops before
 * the outbound call or is driven by a locally seeded credential — a test suite
 * must not send traffic to a government API.
 */
describe('ZATCA phase 2 — onboarding, chain and submission guards (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  let customerId: string;
  const createdInvoiceIds: string[] = [];
  const createdCompanyUserIds: string[] = [];

  /**
   * Stands in for what onboarding would have stored: a real secp256k1 keypair
   * and a certificate of the right shape, self-signed instead of issued by the
   * authority.
   *
   * It has to be *real* — signing is no longer a stub, so a placeholder string
   * would fail before the invoice was ever built and the chain assertions below
   * would be testing the wrong failure.
   */
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

  async function clearCredential() {
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // Nothing listens on port 9. Dispatch therefore runs for real — building
    // and signing the document — and only the outbound call fails, so no test
    // traffic ever reaches gw-fatoora.zatca.gov.sa.
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
    // ── اكتفاء ذاتي: لا تفترض ما لم تصنعه ─────────────────────────────────
    // `/zatca/onboarding/start` يرفض بـ400 (zatca_profile_incomplete) ما لم
    // يكن للمنشأة اسمٌ نظامي ورقمٌ ضريبي — والبذرة لا تملأهما. فكانت هذه
    // المجموعة تنجح **فقط إن سبقتها** مجموعةٌ أخرى تكتب ملف المنشأة، وتسقط
    // على أي قاعدة نظيفة. تُهيّئ ما تحتاجه بنفسها الآن.
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'شركة الأفق التجارية', vatNumber: '300000000000003' })
      .expect(200);

    // وعميلٌ خاص بها بدل `customers.body[0]` — الاعتماد على «أول ما تجده»
    // يربط النتيجة بترتيب صفوفٍ لا يملكه هذا الملف.
    customerId = (
      await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `عميل ZATCA ${Date.now()}` })
        .expect(201)
    ).body.id;

    // Whatever a previous run left behind must not decide what this one asserts.
    await clearCredential();
  }, 30000);

  afterAll(async () => {
    // The chain guard refuses deleting a document with an assigned ICV/hash
    // (see InvoicesService.remove). These test rows were never really at the
    // authority, so every chain field is stripped first and the API then
    // deletes normally — which also reverses the auto-posted journal entries.
    // Cleanup must not depend on the guard's absence.
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.updateMany({
        where: { id: { in: createdInvoiceIds } },
        data: { zatcaUuid: null, zatcaHash: null, zatcaPreviousHash: null, zatcaIcv: null, zatcaStatus: 'NOT_SUBMITTED', zatcaSubmittedAt: null, zatcaMessage: null },
      }),
    );
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(tenantPrisma, companyId, createdInvoiceIds);
    for (const id of createdCompanyUserIds) {
      await request(app.getHttpServer()).delete(`/company-users/${id}`).set('Authorization', `Bearer ${token}`);
    }
    await clearCredential();
    delete process.env.ZATCA_API_BASE_OVERRIDE;
    await app.close();
  });

  describe('secret encryption', () => {
    it('round-trips a secret and produces different ciphertext each time', () => {
      const plain = 'super-secret-api-key';
      const a = encryptSecret(plain);
      const b = encryptSecret(plain);

      expect(decryptSecret(a)).toBe(plain);
      expect(decryptSecret(b)).toBe(plain);
      // A fresh IV per encryption — identical ciphertext for identical input
      // would leak which companies share a key.
      expect(a).not.toBe(b);
      expect(a).not.toContain(plain);
    });

    it('refuses to decrypt a tampered value instead of returning garbage', () => {
      const stored = encryptSecret('abc');
      const [v, iv, tag, data] = stored.split(':');
      const flipped = Buffer.from(data, 'base64');
      flipped[0] ^= 0xff;
      expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
    });
  });

  describe('hash chain', () => {
    // The hash itself is the SHA-256 of the canonical UBL document and is
    // covered in zatca-ubl.e2e-spec.ts, where it can be checked against the
    // XML it actually commits to. What is left here is the chain's seed and
    // the classification that decides which endpoint an invoice goes to.
    it('seeds the chain with base64(sha256("0")), not the mockup placeholder', () => {
      expect(GENESIS_PREVIOUS_HASH).toBe(createHash('sha256').update('0').digest('base64'));
      // The browser mockup used btoa('0'.repeat(44)); shipping that would put
      // every first invoice on a chain the authority rejects.
      expect(GENESIS_PREVIOUS_HASH).not.toBe(Buffer.from('0'.repeat(44)).toString('base64'));
    });

    it('classifies an invoice by whether the buyer has a VAT number', () => {
      expect(invoiceTypeFor('300000000000003')).toBe('standard');
      expect(invoiceTypeFor(null)).toBe('simplified');
      expect(invoiceTypeFor('  ')).toBe('simplified');
    });
  });

  describe('onboarding', () => {
    it('starts at NOT_STARTED with nothing stored', async () => {
      const res = await request(app.getHttpServer()).get('/zatca/onboarding').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.status).toBe('NOT_STARTED');
      expect(res.body.hasKeys).toBe(false);
      expect(res.body.hasProductionCertificate).toBe(false);
    });

    it('refuses the OTP step before a CSR exists', async () => {
      const res = await request(app.getHttpServer())
        .post('/zatca/onboarding/otp')
        .set('Authorization', `Bearer ${token}`)
        .send({ otp: '123456' })
        .expect(400);

      // Refused locally — no request is made to the authority.
      expect(res.body.message).toContain('ابدأ ربط الفوترة الإلكترونية');
    });

    it('refuses the production step before a compliance certificate exists', async () => {
      const res = await request(app.getHttpServer()).post('/zatca/onboarding/production').set('Authorization', `Bearer ${token}`).expect(400);

      expect(res.body.message).toContain('شهادة الامتثال');
    });

    it('generates the merchant keypair and CSR without ever returning them', async () => {
      const res = await request(app.getHttpServer())
        .post('/zatca/onboarding/start')
        .set('Authorization', `Bearer ${token}`)
        .send({ environment: 'SANDBOX' })
        .expect(201);

      expect(res.body.status).toBe('AWAITING_OTP');
      expect(res.body.hasKeys).toBe(true);
      expect(res.body.environment).toBe('SANDBOX');
      // The private key is the whole point of holding it server-side — it must
      // never appear in a response.
      expect(JSON.stringify(res.body)).not.toContain('PRIVATE KEY');
      expect(JSON.stringify(res.body)).not.toContain('privateKey');
    }, 30000);

    /**
     * ⭐ **دفعة (أ) من `EGS`** (`ق-١٧١`): الربط يُنشئ **الوحدة الافتراضية**
     * ويربط الشهادة بها — **بلا تغيير في العدّاد أو السلسلة**.
     */
    it('🔴 يُنشئ الوحدة الافتراضية بتسلسليّ طلب الشهادة نفسه، ويربط الشهادة بها', async () => {
      const [unit, credential] = await tenantPrisma.runInTenantContext(companyId, (tx) =>
        Promise.all([
          tx.egsUnit.findFirst({ where: { companyId, kind: 'DEFAULT_WEB' } }),
          tx.zatcaCredential.findUnique({ where: { companyId }, select: { egsUnitId: true, csr: true } }),
        ]),
      );

      expect(unit).not.toBeNull();
      // التسلسلي **هو الذي في طلب الشهادة** — فالشهادة الصادرة تبقى صالحة بلا
      // إعادة ربط. ويُقرأ من المصدر الواحد لا يُكتب هنا ثانيةً.
      expect(unit!.serial).toBe(defaultUnitSerial(companyId));
      expect(credential!.egsUnitId).toBe(unit!.id);

      // وبدءُ الربط ثانيةً **لا يُنشئ وحدةً ثانية** — الفهرس الجزئي يمنعها بالقيد.
      await request(app.getHttpServer()).post('/zatca/onboarding/start').set('Authorization', `Bearer ${token}`).send({ environment: 'SANDBOX' }).expect(201);
      const count = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.egsUnit.count({ where: { companyId, kind: 'DEFAULT_WEB' } }));
      expect(count).toBe(1);
    }, 30000);

    it('stores the private key encrypted, not in the clear', async () => {
      const stored = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.findUnique({ where: { companyId } }));

      expect(stored!.privateKeyEnc).toBeTruthy();
      expect(stored!.privateKeyEnc).not.toContain('BEGIN PRIVATE KEY');
      expect(decryptSecret(stored!.privateKeyEnc!)).toContain('BEGIN PRIVATE KEY');
      // The CSR is public by nature — it is stored as-is so it can be resubmitted.
      expect(stored!.csr).toContain('BEGIN CERTIFICATE REQUEST');
    });

    it('lets an employee read the status but not start onboarding', async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const username = `zatca-viewer-${suffix}`;

      const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${token}`).expect(200);
      const templateId = templates.body.find((t: { isSystem: boolean }) => !t.isSystem).id;

      const employee = await request(app.getHttpServer())
        .post('/company-users')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'موظف اختبار الفوترة', username, password: 'ViewerPass123!', permissionTemplateId: templateId })
        .expect(201);
      createdCompanyUserIds.push(employee.body.id);

      const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'ViewerPass123!' }).expect(200);
      const employeeToken = login.body.accessToken;

      await request(app.getHttpServer()).get('/zatca/onboarding').set('Authorization', `Bearer ${employeeToken}`).expect(200);

      // Onboarding binds a certificate to the merchant's VAT number — an
      // employee must not be able to trigger that.
      await request(app.getHttpServer())
        .post('/zatca/onboarding/start')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ environment: 'SANDBOX' })
        .expect(403);
    }, 30000);
  });

  describe('submission guards', () => {
    async function makeInvoice() {
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

    it('refuses to submit before onboarding is complete', async () => {
      await clearCredential();

      const id = await makeInvoice();
      const res = await request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(400);
      expect(res.body.message).toContain('ربط الفوترة الإلكترونية');
    });

    /**
     * ⭐ **`BR-KSA-63` — عنوان المشتري شرطُ الفاتورة القياسية.**
     *
     * والعطل الذي تحرسه هذه الثلاثة كان **صامتاً**: `Customer` بلا حقول عنوان،
     * وبانِي المستند يقبلها — فكان يُصدَّر `<cbc:StreetName></cbc:StreetName>`
     * فارغاً في **كل فاتورة أعمال**، ويُرَدّ من الهيئة بلا أثرٍ عندنا.
     */
    describe('عنوان المشتري (BR-KSA-63)', () => {
      /**
       * عميلٌ برقمٍ ضريبي ⇒ **قياسية** (`invoiceTypeFor`) — وهي وحدها المشترِطة.
       *
       * ⚠️ **ورقمٌ فريد لكل عميل**: `assertNoDuplicate` يرفض تكرار الرقم
       * الضريبي بـ`409`، فرقمٌ ثابت يُسقط ثاني نداءٍ **بعلّةٍ ليست موضوع
       * الاختبار**. (وقع في السير، وهذا إصلاحه.) والصيغة تبقى صالحة
       * (`^3\d{13}3$`) — فالفحص الجديد على البطاقة يمرّ.
       */
      let vatSeq = 0;
      async function makeB2bCustomer(address: Record<string, string> = {}) {
        const unique = String(Date.now() + vatSeq++).slice(-13);
        const res = await request(app.getHttpServer())
          .post('/customers')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: `منشأة مشترية ${unique}`, vatNumber: `3${unique}3`, ...address })
          .expect(201);
        return res.body.id as string;
      }

      async function submitFor(buyerId: string) {
        const invoice = await request(app.getHttpServer())
          .post('/invoices')
          .set('Authorization', `Bearer ${token}`)
          .send({ customerId: buyerId, issueDate: '2026-06-01', dueDate: '2026-06-30', lines: [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }] })
          .expect(201);
        createdInvoiceIds.push(invoice.body.id);
        return request(app.getHttpServer()).post(`/zatca/invoices/${invoice.body.id}/submit`).set('Authorization', `Bearer ${token}`);
      }

      const FULL_ADDRESS = { street: 'طريق الملك فهد', buildingNumber: '7001', district: 'العليا', city: 'الرياض', postalCode: '12211' };

      it('🔴 يرفض القياسية بعنوانٍ ناقص — ويسمّي الناقص بالاسم', async () => {
        await seedProductionCredential();
        const res = await submitFor(await makeB2bCustomer());

        expect(res.status).toBe(400);
        // كل حقلٍ ناقص يُذكر — فمن يصطدم بالرسالة يعرف ماذا يُكمل.
        for (const label of ['الشارع', 'رقم المبنى', 'الحي', 'المدينة', 'الرمز البريدي']) {
          expect(JSON.stringify(res.body)).toContain(label);
        }
      }, 20000);

      it('🔴 ويرفض النقص الجزئي كذلك — فأربعةٌ من خمسة ليست كاملاً', async () => {
        await seedProductionCredential();
        const { postalCode: _omitted, ...partial } = FULL_ADDRESS;
        const res = await submitFor(await makeB2bCustomer(partial));

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toContain('الرمز البريدي');
        // وما اكتمل لا يُذكر — وإلا صارت الرسالة قائمةً لا تشخيصاً.
        expect(JSON.stringify(res.body)).not.toContain('الشارع');
      }, 20000);

      it('والعنوان الكامل يمرّ البوّابة — فالمنع من النقص لا من نوع الفاتورة', async () => {
        await seedProductionCredential();
        const res = await submitFor(await makeB2bCustomer(FULL_ADDRESS));

        // يصل مسار الإرسال (ويُرفض هناك لغياب التوقيع الحقيقي) — والمهم أنه
        // **تجاوز البوّابة**: لا رسالة عنوانٍ ناقص.
        expect(res.status).toBe(201);
        expect(JSON.stringify(res.body)).not.toContain('عنوان المشتري');
      }, 20000);

      it('🔴 والمبسطة لا تُحمَّل ما ليس عليها — عميلٌ بلا رقمٍ ضريبي يمرّ بلا عنوان', async () => {
        await seedProductionCredential();
        const buyer = (
          await request(app.getHttpServer())
            .post('/customers')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: `مستهلك ${Date.now()}` })
            .expect(201)
        ).body.id as string;

        const res = await submitFor(buyer);
        expect(res.status).toBe(201);
        expect(JSON.stringify(res.body)).not.toContain('عنوان المشتري');
      }, 20000);
    });

    it('records the chain and marks the invoice REJECTED when submission cannot complete', async () => {
      // A certificate exists, so the guard passes and the invoice reaches the
      // dispatch path — where signing is still unimplemented. That proves a
      // failed send leaves a diagnosable REJECTED row rather than an invoice
      // stuck on SUBMITTING.
      await seedProductionCredential();

      const id = await makeInvoice();
      const res = await request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);

      expect(res.body.zatcaStatus).toBe('REJECTED');
      expect(res.body.zatcaMessage).toBeTruthy();
      // The chain link is assigned before dispatch, so a failed send still
      // leaves the invoice's position recorded.
      expect(res.body.zatcaUuid).toBeTruthy();
      expect(res.body.zatcaHash).toBeTruthy();
      expect(res.body.zatcaPreviousHash).toBeTruthy();
    }, 20000);

    it('reuses the same UUID and chain position when a rejected invoice is retried', async () => {
      const id = await makeInvoice();
      const first = await request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      const second = await request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);

      // Minting a new UUID or counter on retry would leave a gap in the chain.
      expect(second.body.zatcaUuid).toBe(first.body.zatcaUuid);
      expect(second.body.zatcaIcv).toBe(first.body.zatcaIcv);
      expect(second.body.zatcaPreviousHash).toBe(first.body.zatcaPreviousHash);
      expect(second.body.zatcaHash).toBe(first.body.zatcaHash);
    }, 30000);

    it('chains each new invoice onto the previous accepted one', async () => {
      const idA = await makeInvoice();
      const a = await request(app.getHttpServer()).post(`/zatca/invoices/${idA}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      // Only an accepted document can be a predecessor, and clearance needs a
      // certificate only the authority can issue — so it is simulated on top
      // of a real submission (same chain link, accepted status).
      await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id: idA }, data: { zatcaStatus: 'CLEARED' } }));

      const idB = await makeInvoice();
      const b = await request(app.getHttpServer()).post(`/zatca/invoices/${idB}/submit`).set('Authorization', `Bearer ${token}`).expect(201);

      expect(b.body.zatcaPreviousHash).toBe(a.body.zatcaHash);
      expect(b.body.zatcaHash).not.toBe(a.body.zatcaHash);

      // العدّادُ لا يقفز — **ولا أحدَ بينهما**.
      //
      // ⚠️ وكانت هذه الدعوى تُقاس **بالتسلسل المتّصل للوحدة كلِّها** (#196)،
      // **وهو فخٌّ**: `afterAll` أدناه **يجرّد `zatcaIcv` من فواتير هذه
      // المجموعة**، فتبقى في السلسلة ثقوبٌ مشروعة تُسقط أيَّ مجموعةٍ تلي.
      // **فالدعوى محلّيةٌ وتُقاس محلّياً** (ق-٢٩٢).
      await expectNothingBetweenIcv(tenantPrisma, companyId, a.body.zatcaIcv, b.body.zatcaIcv);
    }, 30000);

    it('never hands a rejected invoice\'s hash to the next document — it inherits the last accepted one', async () => {
      // An accepted document to inherit from...
      const idCleared = await makeInvoice();
      const cleared = await request(app.getHttpServer()).post(`/zatca/invoices/${idCleared}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id: idCleared }, data: { zatcaStatus: 'CLEARED' } }));

      // ...then a rejected one submitted after it. It burns its ICV slot (so
      // it can never be deleted) but the authority never recorded it.
      const idRejected = await makeInvoice();
      const rejected = await request(app.getHttpServer()).post(`/zatca/invoices/${idRejected}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      expect(rejected.body.zatcaStatus).toBe('REJECTED');
      expect(rejected.body.zatcaHash).toBeTruthy();

      const idNext = await makeInvoice();
      const next = await request(app.getHttpServer()).post(`/zatca/invoices/${idNext}/submit`).set('Authorization', `Bearer ${token}`).expect(201);

      // The rejected invoice is not a predecessor: it is skipped, and the last
      // accepted document is inherited instead. Were its hash handed on,
      // correcting and resubmitting it would recompute that hash and orphan
      // this document's PIH.
      expect(next.body.zatcaPreviousHash).not.toBe(rejected.body.zatcaHash);
      expect(next.body.zatcaPreviousHash).toBe(cleared.body.zatcaHash);
      // The skip is in the hash chain only — the counter still counts the
      // rejected document, because its position is genuinely taken: nothing
      // sits between the two (ق-٢٩٢).
      await expectNothingBetweenIcv(tenantPrisma, companyId, rejected.body.zatcaIcv, next.body.zatcaIcv);
    }, 40000);
  });
});
