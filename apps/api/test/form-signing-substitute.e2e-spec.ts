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
 * ④ حقولٌ ناقصة · جوالُ المستأجر نفسُه · نموذجٌ لم يُرسل.
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
    const subSession = await loginByOtp(app, subLink, sub.e164);
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
  });
});
