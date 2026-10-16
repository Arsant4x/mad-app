import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (10.0 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

describe('Company profile (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('[SPEC 2.1] updates and reads back company A profile', async () => {
    const updated = await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        legalName: 'شركة اختبار العزل المحدودة',
        vatNumber: '300000000000003',
        crNumber: '1010123456',
        email: 'test-a@example.com',
        // A change of the e-mail takes the owner's current password (owner-recovery-email.e2e-spec.ts).
        currentPassword: 'DemoPass123!',
      })
      .expect(200);
    expect(updated.body.legalName).toBe('شركة اختبار العزل المحدودة');
    expect(updated.body.vatNumber).toBe('300000000000003');

    const fetched = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(fetched.body.legalName).toBe('شركة اختبار العزل المحدودة');
    expect(fetched.body.crNumber).toBe('1010123456');
    expect(fetched.body.email).toBe('test-a@example.com');
  });

  it('[SPEC 2.1] stores the national address as separate parts, not one line', async () => {
    // ZATCA reads street/building/district/city/postal code out of
    // cac:PostalAddress individually; a standard invoice is rejected without
    // them, and the free-text `address` cannot be split reliably after the
    // fact — so both are stored, and neither overwrites the other.
    const updated = await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        legalName: 'شركة اختبار العزل المحدودة',
        address: 'الرياض، العليا، طريق الملك فهد',
        street: 'طريق الملك فهد',
        buildingNumber: '1234',
        district: 'العليا',
        city: 'الرياض',
        postalCode: '12345',
      })
      .expect(200);

    expect(updated.body.street).toBe('طريق الملك فهد');
    expect(updated.body.buildingNumber).toBe('1234');
    expect(updated.body.postalCode).toBe('12345');
    expect(updated.body.address).toBe('الرياض، العليا، طريق الملك فهد');

    const fetched = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(fetched.body.district).toBe('العليا');
    expect(fetched.body.city).toBe('الرياض');
  });

  it('rejects a postal code that is not five digits', async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      // legalName is required on PATCH, so it has to be resent — with the same
      // value the suite's other cases expect, since this endpoint replaces it.
      .send({ legalName: 'شركة اختبار العزل المحدودة', postalCode:'123' })
      .expect(400);

    // Empty means "not provided", not "invalid" — a merchant without one must
    // still be able to save the rest of the profile.
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      // legalName is required on PATCH, so it has to be resent — with the same
      // value the suite's other cases expect, since this endpoint replaces it.
      .send({ legalName: 'شركة اختبار العزل المحدودة', postalCode:'' })
      .expect(200);
  });

  it('[SPEC 2.1] rejects an invalid VAT number (not 15 digits / wrong prefix-suffix)', async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ legalName: 'شركة', vatNumber: '30012345600001' })
      .expect(400);
  });

  it('rejects an invalid CR number (not 10 digits)', async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ legalName: 'شركة', crNumber: '12345' })
      .expect(400);
  });

  it('rejects an invalid email format', async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ legalName: 'شركة', email: 'not-an-email' })
      .expect(400);
  });

  /**
   * ⭐ **العقد الجديد** (`ق-١٤٦`): كان هذا التوكيد يقول `rejects an update
   * missing legalName` — أي أن مساراً اسمه `PATCH` **يفرض إرسال الاسم في كل
   * حفظ**. وقِيس أنه المخالف الوحيد بين ٣٣ نوع `DTO` على مسارات `PATCH`،
   * فصُحّح **السلوك** لا الاسم.
   *
   * والحماية التي كان يُظنّ أن الإلزام يوفّرها **باقية**: الاسم لا يُفرَّغ.
   */
  it('[SPEC 2.1] يقبل تعديلاً جزئياً بلا legalName — ويترك الاسم كما هو', async () => {
    const before = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenA}`).expect(200);

    const patched = await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ phone: '0500000000' })
      .expect(200);

    expect(patched.body.phone).toBe('0500000000');
    expect(patched.body.legalName).toBe(before.body.legalName);
  });

  it('🔴 ولا يُفرَّغ الاسم — فالاختياريّ في الإرسال ليس مباحاً في المحو', async () => {
    await request(app.getHttpServer()).patch('/company-profile').set('Authorization', `Bearer ${tokenA}`).send({ legalName: '' }).expect(400);
  });

  /**
   * ⭐ **العقد نفسه لبقية الحقول** — وعليه تعتمد بطاقةٌ تحفظ إعداداً واحداً (حدُّ فصل
   * وقائع الانقطاع، `ق-٢٠١`) من غير أن تحمل الملف كله: `emptyToNull(undefined)`
   * يعيد `undefined` وPrisma يتركه. لو صار يعيد `null` لمُحي الرقم الضريبي والعنوان
   * كلُّه بصمت مع كل حفظٍ لحقلٍ واحد — وهذا ما يسقط عليه هذا التوكيد (ثابتٌ بالعكس).
   * المحوُ صريحٌ بالفراغ `''` لا بالإغفال — كما يرسله نموذجُ الملف.
   */
  it('🔴 وما لم يُرسَل من بقية الحقول يبقى — وما أُرسل فارغاً يُمحى وحده', async () => {
    const patch = (body: Record<string, string | number>) => request(app.getHttpServer()).patch('/company-profile').set('Authorization', `Bearer ${tokenA}`).send(body);

    await patch({ vatNumber: '300000000000003', crNumber: '1010123456', email: 'test-a@example.com', currentPassword: 'DemoPass123!', city: 'الرياض', postalCode: '12211' }).expect(200);

    // حقلٌ واحد — والبقية كما هي.
    const patched = await patch({ posOfflineGapMinutes: 2 }).expect(200);
    expect(patched.body.vatNumber).toBe('300000000000003');
    expect(patched.body.crNumber).toBe('1010123456');
    expect(patched.body.email).toBe('test-a@example.com');
    expect(patched.body.city).toBe('الرياض');
    expect(patched.body.postalCode).toBe('12211');

    // والمحوُ بالفراغ الصريح وحده — ولا يجرّ غيره.
    const cleared = await patch({ city: '' }).expect(200);
    expect(cleared.body.city).toBeNull();
    expect(cleared.body.vatNumber).toBe('300000000000003');
    expect(cleared.body.postalCode).toBe('12211');
  });

  it("keeps company B from seeing company A's profile data", async () => {
    const fetchedB = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(fetchedB.body.legalName).not.toBe('شركة اختبار العزل المحدودة');
    expect(fetchedB.body.vatNumber).not.toBe('300000000000003');
  });

  it("keeps company B's edits from affecting company A's profile", async () => {
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ legalName: 'شركة ب المعدَّلة' })
      .expect(200);

    const fetchedA = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(fetchedA.body.legalName).toBe('شركة اختبار العزل المحدودة');
  });

  it('[SPEC 2.2 11.3] attaches an uploaded logo, serves it back, and clears it on request', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('fake-png-bytes'), { filename: 'شعار.png', contentType: 'image/png' })
      .expect(201);

    const saved = await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ legalName: 'شركة اختبار العزل المحدودة', logoFileKey: uploaded.body.key })
      .expect(200);
    expect(saved.body.logoFileKey).toBe(uploaded.body.key);

    const fetched = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(fetched.body.logoFileKey).toBe(uploaded.body.key);

    const cleared = await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ legalName: 'شركة اختبار العزل المحدودة', logoFileKey: '' })
      .expect(200);
    expect(cleared.body.logoFileKey).toBeNull();
  });

  it("refuses a logo key that belongs to another company", async () => {
    const uploadedByA = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('a-logo'), { filename: 'a.png', contentType: 'image/png' })
      .expect(201);

    // Company B knows A's key and tries to claim it as its own logo. Nothing in
    // the database stops this — only the explicit prefix check does.
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ legalName: 'شركة ب', logoFileKey: uploadedByA.body.key })
      .expect(403);
  });

  it('lets a limited-permission employee sub-account read the profile but not edit it', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const username = `profile-viewer-${suffix}`;

    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const anyTemplateId = templates.body.find((t: { isSystem: boolean }) => !t.isSystem).id;

    await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'موظف اختبار', username, password: 'ViewerPass123!', permissionTemplateId: anyTemplateId })
      .expect(201);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'ViewerPass123!' }).expect(200);
    const employeeToken = login.body.accessToken;

    await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${employeeToken}`).expect(200);

    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ legalName: 'محاولة تعديل موظف' })
      .expect(403);
  });
});
