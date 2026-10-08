import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { FormSigningSweepService } from '../src/forms/form-signing-sweep.service';
import { linkTokenFrom, loginByOtp, mockSms, sendForm, uniqueMobile } from './form-signing-helpers';
import { registerIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — يُكتب بعد أوّل تشغيل.
jest.setTimeout(120000);

const DAY = 86_400_000;
const at = (iso: string, plusMs: number) => new Date(Date.parse(iso) + plusMs);

/**
 * ⚖️ **الانقضاءُ والتذكيرُ الآليّ** (توجيه ٢٨٧ ③ و④ · `ق-١٦٣٣` ⑬ إلى ⑮ · `ق-١٦٧١`). الكنسُ يُستدعى بساعةٍ يمرّرها الاختبار، والجوابُ معروفٌ يداً
 * على مدّة سبعة أيّام:
 * ① لا تذكيرَ قبل المنتصف · تذكيرٌ واحدٌ عند المنتصف برابطٍ جديدٍ يعمل · ولا يتكرّر · وتذكيرٌ قبل النهاية بيوم ·
 * ② بعد الموعد «انقضت مدّتُه» لا موافقة: الرابطُ يُغلق ويُعلَم التاجر ولا يُعاد الإرسال ·
 * ③ معترَضٌ عليه بلا نسخةٍ أُرسلت «خلافٌ قائم»، ولا يُذكَّر صاحبُه ·
 * ④ ومعترَضٌ عليه أُرسلت بعده نسخة: تنقضي النسخةُ وتبقى هو «معترَضاً عليه»، ونسخةٌ لم تُرسل قبل الموعد لا تُرسل بعده.
 */
describe('Form signing sweep — reminders and expiry (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let sweep: FormSigningSweepService;
  let ownerToken: string;
  let a: IsolatedCompany;
  let templateId: string;
  let meterItem: string;
  const year = new Date().getUTCFullYear();
  const stamp = `${Date.now()}`.slice(-8);
  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => `Bearer ${t}`;

  async function sentForm() {
    const tag = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
    const property = await http().post('/properties').set('Authorization', bearer(a.token)).send({ name: `عقار الكنس ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await http().post('/units').set('Authorization', bearer(a.token)).send({ propertyId: property.body.id, unitNo: `SW-${tag}`, type: 'شقة', rentMonthly: 1000 }).expect(201);
    const mobile = uniqueMobile();
    const customer = await http().post('/customers').set('Authorization', bearer(a.token)).send({ kind: 'NATURAL', name: `مستأجر الكنس ${tag}`, phone: mobile.local, allowSameName: true }).expect(201);
    const contract = await http()
      .post('/contracts')
      .set('Authorization', bearer(a.token))
      .send({ unitId: unit.body.id, customerId: customer.body.id, value: 12000, cycle: 'monthly', start: `${year}-01-01`, end: `${year}-12-31`, classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(201);
    const form = await http().post(`/contracts/${contract.body.id}/forms`).set('Authorization', bearer(a.token)).send({ templateId, formDate: `${year}-06-15` }).expect(201);
    await http().put(`/contracts/${contract.body.id}/forms/${form.body.id}/values`).set('Authorization', bearer(a.token)).send({ values: [{ itemId: meterItem, number: 1 }] }).expect(200);
    const sent = await sendForm(app, a.token, contract.body.id, form.body.id).expect(201);
    return { contractId: contract.body.id as string, formId: form.body.id as string, mobile, sentAt: sent.body.form.sentAt as string, deadline: sent.body.form.signDeadline as string };
  }
  const status = async (contractId: string, formId: string) =>
    (await http().get(`/contracts/${contractId}/forms/${formId}`).set('Authorization', bearer(a.token)).expect(200)).body.status as string;
  const messagesTo = (e164: string) => mockSms(app).outbox.filter((m) => m.to === e164).length;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    sweep = app.get(FormSigningSweepService);
    ownerToken = (
      await http()
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
    a = await registerIsolatedCompany(app, 'forms-sweep');
    const type = await http().post('/admin/form-types').set('Authorization', bearer(ownerToken)).send({ code: `SWEEP_T${stamp}`, name: 'تسليمُ وحدة' }).expect(201);
    const platform = await http()
      .post('/admin/form-templates')
      .set('Authorization', bearer(ownerToken))
      .send({ formTypeId: type.body.id, name: 'تسليمُ شقّة', items: [{ label: 'قراءةُ العدّاد', itemType: 'METER_READING', required: true }] })
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

  it('① لا تذكيرَ قبل المنتصف، وتذكيرٌ عند المنتصف برابطٍ جديدٍ يعمل لا يتكرّر، وآخرُ قبل النهاية بيوم', async () => {
    const f = await sentForm();
    const before = messagesTo(f.mobile.e164);
    expect((await sweep.runForCompany(a.companyId, at(f.sentAt, 1 * DAY))).reminded).toBe(0);
    expect((await sweep.runForCompany(a.companyId, at(f.sentAt, 3.5 * DAY + 60_000))).reminded).toBe(1);
    expect(messagesTo(f.mobile.e164)).toBe(before + 1);
    const text = mockSms(app).lastTo(f.mobile.e164)!.text;
    expect(text).toContain('تذكير');
    expect((await http().get(`/public/forms/${linkTokenFrom(text)}`).expect(200)).body.state).toBe('ACTIVE');
    expect((await sweep.runForCompany(a.companyId, at(f.sentAt, 4 * DAY))).reminded).toBe(0);
    expect((await sweep.runForCompany(a.companyId, at(f.deadline, -DAY + 60_000))).reminded).toBe(1);
    expect((await sweep.runForCompany(a.companyId, at(f.deadline, -DAY + 120_000))).reminded).toBe(0);
    const kinds = (await http().get(`/contracts/${f.contractId}/forms/${f.formId}/events`).set('Authorization', bearer(a.token)).expect(200)).body.map((e: { kind: string }) => e.kind);
    expect(kinds.filter((k: string) => k === 'REMINDER_MID')).toHaveLength(1);
    expect(kinds.filter((k: string) => k === 'REMINDER_LAST')).toHaveLength(1);
  });

  it('② بعد الموعد «انقضت مدّتُه» لا موافقة: الرابطُ يُغلق ويُعلَم التاجر ولا يُعاد الإرسال', async () => {
    const f = await sentForm();
    const link = linkTokenFrom(mockSms(app).lastTo(f.mobile.e164)!.text);
    const r = await sweep.runForCompany(a.companyId, at(f.deadline, 60_000));
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect(await status(f.contractId, f.formId)).toBe('EXPIRED');
    expect((await http().get(`/public/forms/${link}`).expect(200)).body.state).toBe('CLOSED');
    const notified = await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.notification.count({ where: { kind: 'FORM_SIGNING_EXPIRED', linkId: f.formId } }));
    expect(notified).toBe(1);
    await http().post(`/contracts/${f.contractId}/forms/${f.formId}/resend`).set('Authorization', bearer(a.token)).expect(409);
    // ولا ختمَ ولا توقيعَ للمستأجر: الانقضاءُ ليس موافقة.
    const seals = await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.formSeal.count({ where: { instanceId: f.formId } }));
    expect(seals).toBe(0);
  });

  it('③ معترَضٌ عليه بلا نسخةٍ أُرسلت «خلافٌ قائم»، ولا يُذكَّر صاحبُه', async () => {
    const f = await sentForm();
    const link = linkTokenFrom(mockSms(app).lastTo(f.mobile.e164)!.text);
    const session = await loginByOtp(app, link, f.mobile.e164);
    await http().post(`/public/forms/${link}/objection`).set('x-form-session', session).field('note', 'العدّادُ خطأ').expect(201);
    const before = messagesTo(f.mobile.e164);
    await sweep.runForCompany(a.companyId, at(f.sentAt, 3.6 * DAY));
    expect(messagesTo(f.mobile.e164)).toBe(before);
    await sweep.runForCompany(a.companyId, at(f.deadline, 60_000));
    expect(await status(f.contractId, f.formId)).toBe('DISPUTED');
  });

  it('④ نسخةٌ أُرسلت بعد الاعتراض تنقضي وتبقى السابقةُ «معترَضاً عليه»، ونسخةٌ لم تُرسل قبل الموعد لا تُرسل بعده', async () => {
    const f = await sentForm();
    const link = linkTokenFrom(mockSms(app).lastTo(f.mobile.e164)!.text);
    const session = await loginByOtp(app, link, f.mobile.e164);
    await http().post(`/public/forms/${link}/objection`).set('x-form-session', session).field('note', 'العدّادُ خطأ').expect(201);
    const revision = await http().post(`/contracts/${f.contractId}/forms/${f.formId}/revisions`).set('Authorization', bearer(a.token)).expect(201);
    await sendForm(app, a.token, f.contractId, revision.body.id).expect(201);
    await sweep.runForCompany(a.companyId, at(f.deadline, 60_000));
    expect(await status(f.contractId, revision.body.id)).toBe('EXPIRED');
    expect(await status(f.contractId, f.formId)).toBe('OBJECTED');

    // ونسخةٌ معدّلة تبقى مسوّدةً حتى الموعد: لا تُرسل بعده.
    const g = await sentForm();
    const gLink = linkTokenFrom(mockSms(app).lastTo(g.mobile.e164)!.text);
    const gSession = await loginByOtp(app, gLink, g.mobile.e164);
    await http().post(`/public/forms/${gLink}/objection`).set('x-form-session', gSession).field('note', 'العدّادُ خطأ').expect(201);
    const gRev = await http().post(`/contracts/${g.contractId}/forms/${g.formId}/revisions`).set('Authorization', bearer(a.token)).expect(201);
    await sweep.runForCompany(a.companyId, at(g.deadline, 60_000));
    expect(await status(g.contractId, g.formId)).toBe('DISPUTED');
    // المجموعةُ حُسمت خلافاً قائماً: النسخةُ التي لم تُرسل قبله لا تُرسل بعده، وتبقى مسوّدة.
    await sendForm(app, a.token, g.contractId, gRev.body.id).expect(409);
    expect(await status(g.contractId, gRev.body.id)).toBe('DRAFT');
  });
});
