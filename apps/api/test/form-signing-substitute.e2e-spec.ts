import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { linkTokenFrom, loginByOtp, mockSms, sendForm, signAsTenant, uniqueMobile } from './form-signing-helpers';
import { registerIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — يُكتب بعد أوّل تشغيل.
jest.setTimeout(120000);

/**
 * ⚖️ **المستلمُ البديل** (توجيه ٢٨٧ ⑦ · `ق-١٦٣٥` ⑨ و⑩ · `ق-١٦٧٢`):
 *
 * ① الموظّفُ يطلب البديل فيصل جوالَ المستأجر رابطُ الموافقة (لا اسمَ فيه)، ولا رمزَ ولا رابطَ يعود للموظّف؛ والمستأجرُ يدخل برمزه ويرى البديلَ
 *    ويوافق، فيُقفل رابطُه ويصل البديلَ رابطُه، ويدخل البديلُ برمزٍ إلى جواله ويوقّع، والنسخةُ النهائية إلى المستأجر ·
 * ② الرفضُ يُبقي المستأجرَ مستلماً ورابطُه يعمل ·
 * ③ الموافقةُ بلا جلسةٍ تُردّ، وبرابط توقيعٍ تُردّ، ومرّتين تُردّ ·
 * ④ حقولٌ ناقصة · جوالُ المستأجر نفسُه · نموذجٌ لم يُرسل · رقمُ هويّةٍ في نموذجٍ لا يشترط نفاذ ·
 * ⑤ في نموذجٍ يشترط نفاذ: رقمُ الهويّة إلزاميٌّ مشفَّر، والدخولُ بالرمز ثم نفاذ، والرمزُ وحدَه لا يرى ولا يوقّع (`ق-١٦٧٧`).
 */
describe('Form signing substitute recipient (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let ownerToken: string;
  let a: IsolatedCompany;
  let templateId: string;
  let meterItem: string;
  const year = new Date().getUTCFullYear();
  const formDate = `${year}-06-15`;
  const stamp = `${Date.now()}`.slice(-8);
  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => `Bearer ${t}`;
  const inA = <T,>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(a.companyId, fn);
  const linkOf = (mobileE164: string) => linkTokenFrom(mockSms(app).lastTo(mobileE164)?.text);

  async function contractWithForm() {
    const tag = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
    const property = await http().post('/properties').set('Authorization', bearer(a.token)).send({ name: `عقار البديل ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await http()
      .post('/units')
      .set('Authorization', bearer(a.token))
      .send({ propertyId: property.body.id, unitNo: `SUB-${tag}`, type: 'شقة', rentMonthly: 1000 })
      .expect(201);
    const mobile = uniqueMobile();
    const customer = await http()
      .post('/customers')
      .set('Authorization', bearer(a.token))
      .send({ kind: 'NATURAL', name: `مستأجر ${tag}`, phone: mobile.local, allowSameName: true })
      .expect(201);
    const contract = await http()
      .post('/contracts')
      .set('Authorization', bearer(a.token))
      .send({ unitId: unit.body.id, customerId: customer.body.id, value: 12000, cycle: 'monthly', start: `${year}-01-01`, end: `${year}-12-31`, classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(201);
    const form = await http().post(`/contracts/${contract.body.id}/forms`).set('Authorization', bearer(a.token)).send({ templateId, formDate }).expect(201);
    await http()
      .put(`/contracts/${contract.body.id}/forms/${form.body.id}/values`)
      .set('Authorization', bearer(a.token))
      .send({ values: [{ itemId: meterItem, number: 4321 }] })
      .expect(200);
    return { contractId: contract.body.id as string, formId: form.body.id as string, mobile };
  }

  const requestSubstitute = (contractId: string, formId: string, body: Record<string, unknown>) =>
    http().post(`/contracts/${contractId}/forms/${formId}/substitute`).set('Authorization', bearer(a.token)).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    ownerToken = (
      await http()
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
    a = await registerIsolatedCompany(app, 'forms-substitute');
    const type = await http().post('/admin/form-types').set('Authorization', bearer(ownerToken)).send({ code: `SUB_T${stamp}`, name: 'استلامُ وحدة' }).expect(201);
    const platform = await http()
      .post('/admin/form-templates')
      .set('Authorization', bearer(ownerToken))
      .send({ formTypeId: type.body.id, name: 'استلامُ شقّة', items: [{ label: 'قراءةُ العدّاد', itemType: 'METER_READING', required: true }] })
      .expect(201);
    await http().post(`/admin/form-templates/${platform.body.id}/publish`).set('Authorization', bearer(ownerToken)).expect(201);
    const copy = await http().post('/form-templates/copy').set('Authorization', bearer(a.token)).send({ sourceTemplateId: platform.body.id }).expect(201);
    templateId = copy.body.id;
    meterItem = (copy.body.items as { id: string }[])[0].id;
    await http().post(`/form-templates/${templateId}/publish`).set('Authorization', bearer(a.token)).expect(201);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('① المستأجرُ يوافق برمزه، والبديلُ يدخل برمزٍ إلى جواله ويوقّع، والنسخةُ النهائية إلى المستأجر', async () => {
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const tenantSign = linkOf(c.mobile.e164);
    const sub = uniqueMobile();
    const asked = await requestSubstitute(c.contractId, c.formId, { name: 'أخو المستأجر', mobile: sub.local }).expect(201);
    expect(JSON.stringify(asked.body)).not.toMatch(/\/f\/|\b\d{6}\b/);
    const consentSms = mockSms(app).lastTo(c.mobile.e164)?.text ?? '';
    expect(consentSms).toMatch(/شخصٌ آخر/);
    expect(consentSms).not.toContain('أخو المستأجر');
    expect(mockSms(app).lastTo(sub.e164)).toBeUndefined();
    const consent = linkTokenFrom(consentSms);

    expect((await http().get(`/public/forms/${consent}`).expect(200)).body).toMatchObject({ state: 'ACTIVE', purpose: 'SUBSTITUTE_CONSENT', methods: { otp: true, nafath: false } });
    const session = await loginByOtp(app, consent, c.mobile.e164);
    const view = await http().get(`/public/forms/${consent}/form`).set('x-form-session', session).expect(200);
    expect(view.body.substitute).toEqual({ name: 'أخو المستأجر', mobileMasked: expect.stringMatching(/•••/) });
    const decided = await http().post(`/public/forms/${consent}/substitute/decision`).set('x-form-session', session).send({ approve: true }).expect(200);
    expect(decided.body).toEqual({ decision: 'APPROVED', delivery: 'SENT' });

    expect((await http().get(`/public/forms/${tenantSign}`).expect(200)).body.state).toBe('CLOSED');
    expect((await http().get(`/public/forms/${consent}`).expect(200)).body.state).toBe('CLOSED');
    const subLink = linkOf(sub.e164);
    // ⚖️ `ق-١٦٧٤`: صفحةُ رابط البديل قبل الدخول بلا اسم منشأةٍ ولا نصّ، والنصُّ في رسالة رمزه قبل الرمز باسم المنشأة.
    const company = await inA((tx) => tx.company.findUniqueOrThrow({ where: { id: a.companyId }, select: { legalName: true, orgName: true } }));
    const companyName = company.legalName?.trim() || company.orgName;
    const opened = await http().get(`/public/forms/${subLink}`).expect(200);
    expect(JSON.stringify(opened.body)).not.toContain(companyName);
    expect(JSON.stringify(opened.body)).not.toContain('ستستلم');
    const subSession = await loginByOtp(app, subLink, sub.e164);
    const subOtp = mockSms(app).lastTo(sub.e164)?.text ?? '';
    const notice = `ستستلم هذه الوحدة نيابةً عن المستأجر وبموافقته. ولإثبات ذلك تحفظ ${companyName} مع نموذج الاستلام اسمَك ورقمَ جوالك، ورقمَ هويتك إن لزم التحقق عبر نفاذ، طوال مدة الحفظ النظامية للنموذج، ولا تستعملها لغير هذا النموذج ولا تُطلع عليها أحداً إلا بما يوجبه النظام. وبإدخالك الرمز الذي يصل جوالك توافق على ذلك.`;
    expect(subOtp.startsWith(notice)).toBe(true);
    expect(subOtp.indexOf('رمز التحقق:')).toBeGreaterThan(subOtp.indexOf(notice));
    // ورمزُ المستأجر نفسِه بلا الإحاطة.
    const tenantOtps = mockSms(app).outbox.filter((m) => m.to === c.mobile.e164 && m.text.includes('رمز التحقق:'));
    expect(tenantOtps.length).toBeGreaterThan(0);
    expect(tenantOtps.every((m) => !m.text.includes('ستستلم'))).toBe(true);
    const signed = await signAsTenant(app, subLink, subSession).expect(201);
    expect(signed.body).toEqual({ status: 'SEALED', finalCopy: 'SENT' });
    expect(mockSms(app).lastTo(c.mobile.e164)?.text).toMatch(/نسختك النهائية/);

    const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: c.formId, role: 'SUBSTITUTE' } }));
    expect(sig).toMatchObject({ signerName: 'أخو المستأجر', level: 'DRAWN_OTP' });
    expect(sig.mobileMasked).not.toMatch(/\d{8,}/);
    const events = (await http().get(`/contracts/${c.contractId}/forms/${c.formId}/events`).set('Authorization', bearer(a.token)).expect(200)).body as { kind: string }[];
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(['SUBSTITUTE_REQUESTED', 'SUBSTITUTE_APPROVED']));
    const note = await inA((tx) => tx.notification.findFirst({ where: { kind: 'FORM_SUBSTITUTE_DECIDED', linkId: c.formId } }));
    expect(note?.title).toContain('وافق');
  });

  it('② الرفضُ يُبقي المستأجرَ مستلماً ورابطُه يعمل', async () => {
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const tenantSign = linkOf(c.mobile.e164);
    const sub = uniqueMobile();
    await requestSubstitute(c.contractId, c.formId, { name: 'جارُ المستأجر', mobile: sub.local }).expect(201);
    const consent = linkOf(c.mobile.e164);
    const session = await loginByOtp(app, consent, c.mobile.e164);
    expect((await http().post(`/public/forms/${consent}/substitute/decision`).set('x-form-session', session).send({ approve: false }).expect(200)).body).toEqual({
      decision: 'REJECTED',
      delivery: 'NONE',
    });
    expect(mockSms(app).lastTo(sub.e164)).toBeUndefined();
    expect((await http().get(`/public/forms/${tenantSign}`).expect(200)).body.state).toBe('ACTIVE');
    const d = await inA((tx) => tx.formSignerDesignation.findFirstOrThrow({ where: { instanceId: c.formId, role: 'SUBSTITUTE' } }));
    expect(d.status).toBe('REJECTED');
  });

  it('③ الموافقةُ بلا جلسةٍ تُردّ، وبرابط التوقيع تُردّ، ولا حكمَ ثانياً', async () => {
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const tenantSign = linkOf(c.mobile.e164);
    await requestSubstitute(c.contractId, c.formId, { name: 'قريبُ المستأجر', mobile: uniqueMobile().local }).expect(201);
    const consent = linkOf(c.mobile.e164);
    await http().post(`/public/forms/${consent}/substitute/decision`).send({ approve: true }).expect(401);
    const signSession = await loginByOtp(app, tenantSign, c.mobile.e164);
    await http().post(`/public/forms/${tenantSign}/substitute/decision`).set('x-form-session', signSession).send({ approve: true }).expect(403);
    const session = await loginByOtp(app, consent, c.mobile.e164);
    await http().post(`/public/forms/${consent}/substitute/decision`).set('x-form-session', session).send({ approve: false }).expect(200);
    await http().post(`/public/forms/${consent}/substitute/decision`).set('x-form-session', session).send({ approve: true }).expect(410);
  });

  it('④ حقولٌ ناقصة · جوالُ المستأجر نفسُه · نموذجٌ لم يُرسل', async () => {
    const c = await contractWithForm();
    await requestSubstitute(c.contractId, c.formId, { name: 'بديل', mobile: uniqueMobile().local }).expect(409);
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    await requestSubstitute(c.contractId, c.formId, { name: '', mobile: uniqueMobile().local }).expect(400);
    const same = await requestSubstitute(c.contractId, c.formId, { name: 'بديل', mobile: c.mobile.local }).expect(409);
    expect(same.body.message).toContain('جوالُ المستأجر');
    // ولا يُقبل رقمُ هويّةٍ للبديل في نموذجٍ لا يشترط نفاذ (`ق-١٦٧٧`)، ولا يُحفظ.
    const unneeded = await requestSubstitute(c.contractId, c.formId, { name: 'بديل', mobile: uniqueMobile().local, nationalId: '1012345678' }).expect(400);
    expect(unneeded.body.message).toContain('إلا في نموذجٍ يشترط نفاذ');
    expect(await inA((tx) => tx.formSignerDesignation.count({ where: { instanceId: c.formId } }))).toBe(0);
  });

  it('⑤ في نموذجٍ يشترط نفاذ: رقمُ هويّة البديل إلزاميٌّ مشفَّر، ويدخل بالرمز أوّلاً ثم نفاذ، ولا يرى ولا يوقّع بالرمز وحدَه (ق-١٦٧٧)', async () => {
    await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: 1000 }).expect(200);
    try {
      const tag = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
      const property = await http().post('/properties').set('Authorization', bearer(a.token)).send({ name: `عقار نفاذ ${tag}`, ownership: 'owned' }).expect(201);
      const unit = await http().post('/units').set('Authorization', bearer(a.token)).send({ propertyId: property.body.id, unitNo: `NF-${tag}`, type: 'شقة', rentMonthly: 1000 }).expect(201);
      const mobile = uniqueMobile();
      const customer = await http()
        .post('/customers')
        .set('Authorization', bearer(a.token))
        .send({ kind: 'NATURAL', name: `مستأجر نفاذ ${tag}`, phone: mobile.local, allowSameName: true, otherIdScheme: 'NAT', otherId: '1012345678' })
        .expect(201);
      const contract = await http()
        .post('/contracts')
        .set('Authorization', bearer(a.token))
        .send({ unitId: unit.body.id, customerId: customer.body.id, value: 12000, cycle: 'monthly', start: `${year}-01-01`, end: `${year}-12-31`, classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' })
        .expect(201);
      const form = await http().post(`/contracts/${contract.body.id}/forms`).set('Authorization', bearer(a.token)).send({ templateId, formDate }).expect(201);
      await http().put(`/contracts/${contract.body.id}/forms/${form.body.id}/values`).set('Authorization', bearer(a.token)).send({ values: [{ itemId: meterItem, number: 1 }] }).expect(200);
      const sent = await sendForm(app, a.token, contract.body.id, form.body.id).expect(201);
      expect(sent.body.form.nafathRequired).toBe(true);
      const sub = uniqueMobile();
      // بلا رقم هويّة يُردّ ولا يُكتب شيء.
      const refused = await requestSubstitute(contract.body.id, form.body.id, { name: 'بديل', mobile: sub.local }).expect(400);
      expect(refused.body.message).toContain('رقمَ هويّة المستلم البديل');
      expect(mockSms(app).lastTo(mobile.e164)?.text ?? '').not.toMatch(/شخصٌ آخر/);
      expect(await inA((tx) => tx.formSignerDesignation.count({ where: { instanceId: form.body.id } }))).toBe(0);

      // برقمه يُقبل، ويُحفظ مشفَّراً ببصمة بحث.
      await requestSubstitute(contract.body.id, form.body.id, { name: 'بديلُ نفاذ', mobile: sub.local, nationalId: '1098765432' }).expect(201);
      const d = await inA((tx) => tx.formSignerDesignation.findFirstOrThrow({ where: { instanceId: form.body.id, role: 'SUBSTITUTE' } }));
      expect(d.nationalIdCipher).toMatch(/^f1:/);
      expect(d.nationalIdCipher).not.toContain('1098765432');
      expect(d.nationalIdIndex).toBeTruthy();

      // المستأجرُ يوافق برمزه.
      const consent = linkOf(mobile.e164);
      const consentSession = await loginByOtp(app, consent, mobile.e164);
      await http().post(`/public/forms/${consent}/substitute/decision`).set('x-form-session', consentSession).send({ approve: true }).expect(200);

      // البديلُ: الرمزُ أوّلاً ثم نفاذ.
      const subLink = linkOf(sub.e164);
      expect((await http().get(`/public/forms/${subLink}`).expect(200)).body).toMatchObject({ methods: { otp: true, nafath: true }, nafathAfterOtp: true });
      const before = await http().post(`/public/forms/${subLink}/nafath`).expect(401);
      expect(before.body.message).toContain('بالرمز');
      const otpSession = await loginByOtp(app, subLink, sub.e164);
      expect(mockSms(app).lastTo(sub.e164)?.text ?? '').toContain('ستستلم هذه الوحدة');
      // بالرمز وحدَه لا يرى النموذجَ ولا يعترض ولا يوقّع.
      await http().get(`/public/forms/${subLink}/form`).set('x-form-session', otpSession).expect(403);
      await http().post(`/public/forms/${subLink}/objection`).set('x-form-session', otpSession).field('note', 'خطأ').expect(403);
      await signAsTenant(app, subLink, otpSession).expect(403);
      // ولا يُحكم نفاذ بلا جلسة الرمز.
      await http().post(`/public/forms/${subLink}/nafath`).set('x-form-session', otpSession).expect(201);
      await http().get(`/public/forms/${subLink}/nafath`).expect(401);
      const polled = await http().get(`/public/forms/${subLink}/nafath`).set('x-form-session', otpSession).expect(200);
      expect(polled.body.state).toBe('APPROVED');
      const full = polled.body.session.session as string;
      await http().get(`/public/forms/${subLink}/form`).set('x-form-session', full).expect(200);
      const signed = await signAsTenant(app, subLink, full).expect(201);
      expect(signed.body).toEqual({ status: 'SEALED', finalCopy: 'SENT' });
      expect(mockSms(app).lastTo(mobile.e164)?.text).toMatch(/نسختك النهائية/);
      const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: form.body.id, role: 'SUBSTITUTE' } }));
      expect(sig.level).toBe('DRAWN_NAFATH');
      expect(sig.challengeId).toBeTruthy();
      expect(sig.identityTxRef).toBeTruthy();
    } finally {
      await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: null }).expect(200);
    }
  });
});
