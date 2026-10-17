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
import { startAuthorityStub, STUB_WARNING_CODE, STUB_WARNING_MESSAGE, type AuthorityStub } from './zatca-authority-stub';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (69.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(210000);

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
  let authority: AuthorityStub;
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
    // خادمٌ محلّيّ يمثّل الهيئة ويجيب بالردّ `400` (ق-٩٧١): الإرسال يبني ويوقّع ويسجّل السلسلة
    // فعلاً، والجوابُ ردٌّ حقيقيُّ الشكل — فالمردودةُ هنا ردٌّ لا سقوطُ نقل (الذي صار يُرمى
    // ويُعاد). ولا حركةَ تصل gw-fatoora.zatca.gov.sa.
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
        .send({ kind: 'NATURAL', name: `عميل ZATCA ${Date.now()}` })
        .expect(201)
    ).body.id;

    // Whatever a previous run left behind must not decide what this one asserts.
    await clearCredential();
  }, 30000);

  afterAll(async () => {
    // An issued invoice cannot be deleted through the API, so the test removes its rows directly in the tenant context,
    // reversing their journal entries. A signed row cannot be unsigned in the database, and it does not need to be.
    await purgeInvoicesForTest(tenantPrisma, companyId, createdInvoiceIds);
    for (const id of createdCompanyUserIds) {
      await request(app.getHttpServer()).delete(`/company-users/${id}`).set('Authorization', `Bearer ${token}`);
    }
    await clearCredential();
    await authority.close();
    await app.close();
    // ⏱️ **ميزانيةٌ معلَنة للتنظيف** — و`jest` يعطي الخطّافَ خمسَ ثوانٍ افتراضاً بينما التنظيفُ
    // يمحو فاتورةً فاتورةً عبر مسارٍ يعكس قيودَها: عملٌ يكبر بعددِ ما أنشأته الحزمة، لا انتظارُ
    // حالة. (وهذا ليس علاجاً لتذبذبٍ بمهلةٍ أطول — `§8.2.1`: لا حالةَ تُنتظر هنا، بل `N` صفّاً
    // تُحذف؛ و`beforeAll` أعلاه معلَنٌ بثلاثين ثانيةً للسبب نفسِه.)
  }, 60000);

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

    it('classifies an invoice by the buyer kind and VAT number — an establishment or legal person is standard even unregistered (②A1, م٥٣)', () => {
      const local = [{ taxExemptionReasonCode: null }];
      expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: '300000000000003', country: 'SA' }, local)).toBe('standard');
      expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: null, country: 'SA' }, local)).toBe('simplified');
      expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: '  ', country: 'SA' }, local)).toBe('simplified');
      expect(invoiceTypeFor({ kind: 'ESTABLISHMENT', vatNumber: null, country: 'SA' }, local)).toBe('standard');
      expect(invoiceTypeFor({ kind: 'LEGAL_PERSON', vatNumber: null, country: 'SA' }, local)).toBe('standard');
      // القديمُ غيرُ المعلَن يُقرأ بالرقم كما كان — ولا يبلغ مستنداً جديداً (يُرفض عند الإصدار).
      expect(invoiceTypeFor({ kind: 'LEGACY_UNDECLARED', vatNumber: null, country: 'SA' }, local)).toBe('simplified');
      // ⑤A3: الصادراتُ كاملةٌ ولو لفرد (م٥٣(١)(أ)(٣)) — بلدٌ أجنبيّ **وسطرُ صادرات** معاً؛ وأجنبيٌّ بلا سطر صادراتٍ على حاله.
      const exportLine = [{ taxExemptionReasonCode: 'VATEX-SA-33' }];
      expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: null, country: 'AE' }, exportLine)).toBe('standard');
      expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: null, country: 'AE' }, local)).toBe('simplified');
      expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: null, country: 'SA' }, exportLine)).toBe('simplified');
      expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: null, country: null }, exportLine)).toBe('simplified');
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
          .send({ kind: 'NATURAL', name: `منشأة مشترية ${unique}`, vatNumber: `3${unique}3`, ...address })
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
            .send({ kind: 'NATURAL', name: `مستهلك ${Date.now()}` })
            .expect(201)
        ).body.id as string;

        const res = await submitFor(buyer);
        expect(res.status).toBe(201);
        expect(JSON.stringify(res.body)).not.toContain('عنوان المشتري');
      }, 20000);

      /**
       * ②A1 — `BR-KSA-81`: الكاملةُ لمشترٍ **بلا رقمٍ ضريبيّ** (مؤسّسةٌ أو اعتباريٌّ غيرُ مسجَّل — م٥٣) تشترط معرّفَه
       * البديل (BT-46) بمخطّطه. بلا رقمٍ وبلا معرّف كانت تُختم مبسّطةً (النوعُ بالرقم وحدَه) **فتُبلَّغ في المسار الخطأ**.
       */
      it('🔴 [SPEC 4.10] مؤسّسةٌ بلا رقمٍ ضريبيّ كاملةٌ بحكم صفتها — وبلا معرّفٍ بديل تُرفض مسمّاةً (BR-KSA-81)، وبه تمرّ', async () => {
        await seedProductionCredential();
        const unique = String(Date.now()).slice(-8);
        const establishment = (
          await request(app.getHttpServer())
            .post('/customers')
            .set('Authorization', `Bearer ${token}`)
            .send({ kind: 'ESTABLISHMENT', name: `مؤسسة بلا تسجيل ${unique}`, ...FULL_ADDRESS })
            .expect(201)
        ).body.id as string;
        const refused = await submitFor(establishment);
        expect(refused.status).toBe(400);
        expect(JSON.stringify(refused.body)).toContain('BR-KSA-81');

        await request(app.getHttpServer())
          .patch(`/customers/${establishment}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ otherIdScheme: 'CRN', otherId: `10${unique}` })
          .expect(200);
        const passed = await submitFor(establishment);
        expect(passed.status).toBe(201);
        expect(JSON.stringify(passed.body)).not.toContain('BR-KSA-81');
      }, 30000);

      /**
       * ⑤A3 — KSA-2: كان رمزُ المعاملة ثابتاً (`0100000`) فلا صادراتَ تُعلَم. مشترٍ خارجَ المملكة **وسطرُ صادرات** ⟵
       * فاتورةٌ كاملةٌ ولو لفرد (م٥٣(١)(أ)(٣)) بعلَم الصادرات في الموضع الخامس، وبلا رقمٍ ضريبيٍّ للمشتري (BR-KSA-46).
       * المستندُ المختوم يُقرأ من الصفّ بعد أن تردّه السلطةُ المحلّية — فالبناءُ والتوقيعُ وقعا على مسار الإجازة.
       */
      it('🔴 [SPEC 4.10] ⑤A3 — فاتورةُ صادراتٍ لمشترٍ أجنبيّ تُختم كاملةً وبعلَم الصادرات (KSA-2 = 0100100) وبلا رقمٍ ضريبيٍّ له', async () => {
        await seedProductionCredential();
        const unique = String(Date.now()).slice(-8);
        const foreign = (
          await request(app.getHttpServer())
            .post('/customers')
            .set('Authorization', `Bearer ${token}`)
            .send({ kind: 'NATURAL', name: `مشترٍ في الإمارات ${unique}`, country: 'AE', otherIdScheme: 'TIN', otherId: `AE${unique}`, ...FULL_ADDRESS })
            .expect(201)
        ).body.id as string;
        const invoice = await request(app.getHttpServer())
          .post('/invoices')
          .set('Authorization', `Bearer ${token}`)
          .send({ customerId: foreign, issueDate: '2026-06-01', dueDate: '2026-06-30', lines: [{ description: 'خدمة مصدَّرة', quantity: 1, unitPrice: 100, taxRate: 0, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-33' }] })
          .expect(201);
        createdInvoiceIds.push(invoice.body.id);
        const res = await request(app.getHttpServer()).post(`/zatca/invoices/${invoice.body.id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
        // السلطةُ المحلّية تردّ — فالمستندُ بُني ووُقّع وأُرسل، وصورتُه المختومة في الصفّ.
        expect(res.body.zatcaStatus).toBe('REJECTED');
        const row = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.findUniqueOrThrow({ where: { id: invoice.body.id }, select: { zatcaSignedXml: true } }));
        expect(row.zatcaSignedXml).toContain('<cbc:InvoiceTypeCode name="0100100">388</cbc:InvoiceTypeCode>');
        const buyerXml = row.zatcaSignedXml!.slice(row.zatcaSignedXml!.indexOf('<cac:AccountingCustomerParty>'), row.zatcaSignedXml!.indexOf('</cac:AccountingCustomerParty>'));
        // BT-48 غائب — لا `CompanyID` للمشتري (BR-KSA-46)؛ وعنصرُ المخطّط الفارغ كما يخرج لكل مشترٍ بلا رقم.
        expect(buyerXml).not.toContain('<cbc:CompanyID>');
        expect(buyerXml).toContain('<cbc:IdentificationCode>AE</cbc:IdentificationCode>');
        // ⚖️ توجيه ٢٨٦: المعرّفُ البديل مشفَّرٌ في القاعدة — والمستندُ يحمله مفكوكاً بمخطّطه (BR-KSA-14).
        expect(buyerXml).toContain(`<cbc:ID schemeID="TIN">AE${unique}</cbc:ID>`);
      }, 30000);
    });

    it('records the chain and marks the invoice REJECTED when the authority answers with a rejection (ق-٩٧١)', async () => {
      // A certificate exists, so the guard passes and the invoice is built,
      // signed and sent for real — and the local authority answers 400. That
      // proves an authority rejection leaves a diagnosable REJECTED row with
      // its chain link, rather than an invoice stuck on SUBMITTING. (A send
      // that gets no answer is a different thing now: it is thrown and
      // retried — test/zatca-transport-failure.e2e-spec.ts.)
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

    it('refuses to retry a rejected invoice — its UUID, counter and hash stay as recorded (ق-٩٥٨)', async () => {
      const id = await makeInvoice();
      const first = await request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      expect(first.body.zatcaStatus).toBe('REJECTED');

      // المردودةُ لا تُعاد ولا تُوقَّع ثانيةً — التصحيحُ بدلٌ جديد، والرفضُ يسمّيه.
      const second = await request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(400);
      expect(String(second.body.message)).toContain('أصدِر بدلاً');

      const row = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.findUniqueOrThrow({ where: { id } }));
      expect(row.zatcaUuid).toBe(first.body.zatcaUuid);
      expect(row.zatcaIcv).toBe(first.body.zatcaIcv);
      expect(row.zatcaPreviousHash).toBe(first.body.zatcaPreviousHash);
      expect(row.zatcaHash).toBe(first.body.zatcaHash);
      expect(row.zatcaStatus).toBe('REJECTED');
    }, 30000);

    it('🔴 chains each new invoice onto the document at ICV − 1 — whatever the authority said about it (ق-١١٩٨/⑦)', async () => {
      // A is REJECTED by the stub and stays so: under the old rule ("last CLEARED
      // only") it was skipped, and B chained onto an older document — the fork.
      const idA = await makeInvoice();
      const a = await request(app.getHttpServer()).post(`/zatca/invoices/${idA}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      expect(a.body.zatcaStatus).toBe('REJECTED');

      const idB = await makeInvoice();
      const b = await request(app.getHttpServer()).post(`/zatca/invoices/${idB}/submit`).set('Authorization', `Bearer ${token}`).expect(201);

      expect(b.body.zatcaIcv).toBe(a.body.zatcaIcv + 1);
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

    it('🔴 a document stamped but not yet answered is still the predecessor — the fork the review named (ق-١١٩٨/⑦)', async () => {
      // An accepted document first, so the old rule has something to fall back to.
      const idCleared = await makeInvoice();
      const cleared = await request(app.getHttpServer()).post(`/zatca/invoices/${idCleared}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id: idCleared }, data: { zatcaStatus: 'CLEARED' } }));

      // Then one whose reporting fails after stamping (authority outage — not a
      // verdict, ق-٩٧١): stamped, hashed, its slot taken, but not CLEARED.
      authority.set('outage');
      const idStuck = await makeInvoice();
      await request(app.getHttpServer()).post(`/zatca/invoices/${idStuck}/submit`).set('Authorization', `Bearer ${token}`).expect(503);
      authority.set('reject');
      const stuck = await tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.invoice.findUniqueOrThrow({ where: { id: idStuck }, select: { zatcaStatus: true, zatcaHash: true, zatcaIcv: true } }),
      );
      expect(stuck.zatcaStatus).not.toBe('CLEARED');
      expect(stuck.zatcaStatus).not.toBe('REJECTED');
      expect(stuck.zatcaHash).toBeTruthy();

      const idNext = await makeInvoice();
      const next = await request(app.getHttpServer()).post(`/zatca/invoices/${idNext}/submit`).set('Authorization', `Bearer ${token}`).expect(201);

      // Under "last CLEARED only" the stuck document was skipped and `next`
      // chained onto `cleared` — then, once the stuck one was retried and
      // accepted, the authority held two documents with the same predecessor.
      // Now the chain follows the position: PIH = hash(ICV − 1), always.
      expect(next.body.zatcaIcv).toBe(stuck.zatcaIcv! + 1);
      expect(next.body.zatcaPreviousHash).toBe(stuck.zatcaHash);
      expect(next.body.zatcaPreviousHash).not.toBe(cleared.body.zatcaHash);
      await expectNothingBetweenIcv(tenantPrisma, companyId, stuck.zatcaIcv!, next.body.zatcaIcv);
    }, 40000);

    /**
     * ⭐ **ز/⑤A2 — قبولٌ بملاحظات: تُحفظ، ولا تَحكم.**
     *
     * كان جوابُ `2xx` يُقرأ منه الحكمُ وحدَه و`detail` يصير `null` عند القبول، فيُهدَر كلُّ ما في
     * `validationResults` — **ولا نقطةَ استعلامٍ لاحقة لدى الهيئة**، فما لا يُخزَّن لحظةَ الجواب
     * لا يُستعاد. والوحدةُ تُثبت المحلّل؛ **وهذه تُثبت الوصل**: أن `report()` يكتبه فعلاً.
     */
    it('🔴 قبولٌ بملاحظاتٍ من الهيئة: الحكمُ CLEARED كما هو والملاحظةُ محفوظةٌ برمزها — وقبولٌ نظيفٌ يكتب NULL ولا يختلق (ز/⑤A2)', async () => {
      await seedProductionCredential();

      authority.set('clear-warn');
      const idWarned = await makeInvoice();
      const warned = await request(app.getHttpServer()).post(`/zatca/invoices/${idWarned}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      // ⚖️ الحكمُ لا يتغيّر (`ق-٩٧١`): التحذيرُ يُرى ولا يَحكم.
      expect(warned.body.zatcaStatus).toBe('CLEARED');

      // وقبولٌ نظيفٌ في الجولة نفسِها — فيُقاس الفرقُ بين جوابين لا حالٌ واحدة.
      authority.set('clear');
      const idClean = await makeInvoice();
      const clean = await request(app.getHttpServer()).post(`/zatca/invoices/${idClean}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
      expect(clean.body.zatcaStatus).toBe('CLEARED');

      const rows = await tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.invoice.findMany({ where: { id: { in: [idWarned, idClean] } }, select: { id: true, zatcaWarnings: true } }),
      );
      const byId = new Map(rows.map((r) => [r.id, r.zatcaWarnings]));
      expect(byId.get(idWarned)).toEqual([{ code: STUB_WARNING_CODE, message: STUB_WARNING_MESSAGE, severity: 'WARNING' }]);
      // `null` لا `[]`: الحقلُ يصف الجوابَ الأخير — وجوابٌ بلا ملاحظاتٍ لا يُختلق له مصفوفةٌ فارغة.
      expect(byId.get(idClean)).toBeNull();

      authority.set('reject');
    }, 40000);
  });
});
