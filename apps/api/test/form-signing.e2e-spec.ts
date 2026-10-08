import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { MockIdentityProvider } from '../src/verification/providers';
import { VerificationGateway } from '../src/verification/verification-gateway.service';
import { codeFrom, linkTokenFrom, loginByOtp, mockSms, sendForm, signAsTenant, TINY_PNG, uniqueMobile } from './form-signing-helpers';
import { registerIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — يُكتب بعد أوّل تشغيل.
jest.setTimeout(120000);

/**
 * ⚖️ **مسارُ توقيع المستأجر** (توجيه ٢٨٧ · `ق-١٦٢٠` · `ق-١٦٣٣` · `ق-١٦٦٨` إلى `ق-١٦٧١`) — وكلُّ حدٍّ أمنيٍّ حالةٌ جوابُها معروفٌ يداً
 * (التوجيه ⑫)، والرابطُ والرمزُ يُقرآن من رسالة المزوّد التجريبيّ كما يقرؤهما المستأجر.
 *
 * ① الموظّفُ يوقّع ويرسل: الرسالةُ بلا اسمٍ ولا مبلغ، والمدّةُ سبعةُ أيّام، وما أُرسل لا يُعدَّل في البرنامج ولا القاعدة ·
 * ② الرابطُ قبل الدخول لا يكشف شيئاً، ورمزٌ مجهولٌ أو مشوَّهٌ `404`، والنموذجُ بلا جلسةٍ `401` ·
 * ③ الرمزُ الخاطئ يُعدّ، والصحيحُ يفتح جلسةً لنموذجها وحدَه (جلسةُ رابطٍ لا تفتح غيره) ·
 * ④ الاعتراضُ بملاحظةٍ وصورة يقفل الرابطَ ويُعلم التاجر، والنسخةُ المعدّلة صفٌّ جديدٌ يرث الموعد، ويختمها توقيعُ المستأجر بالصيغة ٢ ·
 * ⑤ النسخةُ النهائية رابطٌ يُفتح بالرمز وفيه حكمُ التحقّق، ورابطُ التوقيع قُفل ·
 * ⑥ الجوالُ لا يظهر كاملاً في صفّ التوقيع ولا السجلّات (`ق-١٦٦٨`) ·
 * ⑦ نفاذ فوق حدّ المنشأة: بلا رقم هويّةٍ لا يُرسل، والرمزُ مرفوضٌ ونفاذُ يُوقِّع، والمرفوضُ يُرفض ·
 * ⑧ رابطٌ منقضٍ يُغلق.
 */
describe('Form signing path — link, code, objection, revision, seal (e2e)', () => {
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

  /** عقدٌ بعميلٍ له جوالٌ فريد، ونموذجٌ مسوّدةٌ عليه معبّأٌ بإلزاميّه. */
  async function contractWithForm(opts: { tenantName?: string; nationalId?: string } = {}) {
    const tag = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
    const property = await http().post('/properties').set('Authorization', bearer(a.token)).send({ name: `عقار التوقيع ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await http()
      .post('/units')
      .set('Authorization', bearer(a.token))
      .send({ propertyId: property.body.id, unitNo: `SIG-${tag}`, type: 'شقة', rentMonthly: 1000 })
      .expect(201);
    const mobile = uniqueMobile();
    const tenantName = opts.tenantName ?? `مستأجر التوقيع ${tag}`;
    const customer = await http()
      .post('/customers')
      .set('Authorization', bearer(a.token))
      .send({ kind: 'NATURAL', name: tenantName, phone: mobile.local, allowSameName: true, ...(opts.nationalId ? { otherIdScheme: 'NAT', otherId: opts.nationalId } : {}) })
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
      .send({ values: [{ itemId: meterItem, number: 48213 }] })
      .expect(200);
    return { contractId: contract.body.id as string, formId: form.body.id as string, mobile, tenantName };
  }

  const linkOf = (mobileE164: string) => linkTokenFrom(mockSms(app).lastTo(mobileE164)?.text);
  const inA = <T,>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(a.companyId, fn);

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
    a = await registerIsolatedCompany(app, 'forms-sign');
    const type = await http().post('/admin/form-types').set('Authorization', bearer(ownerToken)).send({ code: `SIGN_T${stamp}`, name: 'تسليمُ وحدة' }).expect(201);
    const platform = await http()
      .post('/admin/form-templates')
      .set('Authorization', bearer(ownerToken))
      .send({ formTypeId: type.body.id, name: 'تسليمُ شقّة', items: [{ label: 'قراءةُ عدّاد الكهرباء', itemType: 'METER_READING', required: true }] })
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

  it('① الموظّفُ يوقّع ويرسل: الرسالةُ بلا اسمٍ ولا مبلغ، والمدّةُ سبعة أيّام، وما أُرسل لا يُعدَّل في البرنامج ولا القاعدة', async () => {
    const c = await contractWithForm();
    const sent = await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    expect(sent.body.delivery).toBe('SENT');
    expect(sent.body.form).toMatchObject({ status: 'AWAITING_SIGNATURE', revisionNo: 1, nafathRequired: false });
    expect(sent.body.form.signatures).toEqual([expect.objectContaining({ role: 'STAFF', level: 'DRAWN_STAFF_SESSION', signerName: a.username })]);
    const days = (Date.parse(sent.body.form.signDeadline) - Date.parse(sent.body.form.sentAt)) / 86_400_000;
    expect(days).toBe(7);

    const sms = mockSms(app).lastTo(c.mobile.e164)?.text ?? '';
    expect(sms).toMatch(/\/f\/[A-Za-z0-9_-]{43}/);
    expect(sms).not.toContain(c.tenantName);
    expect(sms).not.toContain('12000');
    expect(sms).not.toContain('تسليمُ شقّة');

    await http().put(`/contracts/${c.contractId}/forms/${c.formId}/values`).set('Authorization', bearer(a.token)).send({ values: [{ itemId: meterItem, number: 1 }] }).expect(409);
    await http().delete(`/contracts/${c.contractId}/forms/${c.formId}`).set('Authorization', bearer(a.token)).expect(409);
    const raw = await inA((tx) => tx.formValue.updateMany({ where: { instanceId: c.formId }, data: { note: 'عبث' } })).catch((e: unknown) => String((e as Error).message));
    expect(String(raw)).toContain('23001');
    const back = await inA((tx) => tx.formInstance.update({ where: { id: c.formId }, data: { status: 'DRAFT' } })).catch((e: unknown) => String((e as Error).message));
    expect(String(back)).toContain('23001');
  });

  it('② الرابطُ قبل الدخول لا يكشف شيئاً، والمجهولُ والمشوَّه 404، والنموذجُ بلا جلسةٍ 401', async () => {
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const token = linkOf(c.mobile.e164);
    const open = await http().get(`/public/forms/${token}`).expect(200);
    // `nafathAfterOtp` علَمٌ لطريقة الدخول وحدَه (البديلُ في نموذج نفاذ، `ق-١٦٧٧`)، لا شيءَ من النموذج.
    expect(Object.keys(open.body).sort()).toEqual(['identityProvider', 'methods', 'nafathAfterOtp', 'purpose', 'state']);
    expect(open.body).toMatchObject({ state: 'ACTIVE', purpose: 'SIGN', methods: { otp: true, nafath: false }, nafathAfterOtp: false });
    const text = JSON.stringify(open.body);
    for (const leak of [c.tenantName, '12000', 'تسليمُ شقّة', a.companyId, c.formId]) expect(text).not.toContain(leak);

    await http().get(`/public/forms/${'A'.repeat(43)}`).expect(404);
    await http().get('/public/forms/not-a-token').expect(404);
    await http().get(`/public/forms/${token}/form`).expect(401);
    await http().get(`/public/forms/${token}/form`).set('x-form-session', 'x'.repeat(43)).expect(401);
  });

  it('③ الرمزُ الخاطئ يُعدّ، والصحيحُ يفتح جلسةً لنموذجها وحدَه', async () => {
    const c1 = await contractWithForm();
    const c2 = await contractWithForm();
    await sendForm(app, a.token, c1.contractId, c1.formId).expect(201);
    await sendForm(app, a.token, c2.contractId, c2.formId).expect(201);
    const t1 = linkOf(c1.mobile.e164);
    const t2 = linkOf(c2.mobile.e164);

    const issued = await http().post(`/public/forms/${t1}/otp`).expect(201);
    expect(issued.body.mobileMasked).toMatch(/^05\d\d ••• \d{3}$/);
    const code = codeFrom(mockSms(app).lastTo(c1.mobile.e164)?.text);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    const bad = await http().post(`/public/forms/${t1}/otp/verify`).send({ challengeId: issued.body.challengeId, code: wrong }).expect(400);
    expect(bad.body.message).toContain('بقيت 2');
    const ok = await http().post(`/public/forms/${t1}/otp/verify`).send({ challengeId: issued.body.challengeId, code }).expect(200);
    const session = ok.body.session as string;

    const view = await http().get(`/public/forms/${t1}/form`).set('x-form-session', session).expect(200);
    expect(view.body).toMatchObject({ templateName: 'تسليمُ شقّة', status: 'AWAITING_SIGNATURE', revisionNo: 1 });
    expect(view.body.items[0]).toMatchObject({ label: 'قراءةُ عدّاد الكهرباء', number: '48213' });
    // وجلسةٌ مزوّرة على رابطٍ فُتحت له جلسةٌ صحيحة لا تفتحه (الجلسةُ تُطابَق ببصمتها لا بوجودها).
    await http().get(`/public/forms/${t1}/form`).set('x-form-session', 'Z'.repeat(43)).expect(401);
    // وجلسةُ رابطٍ لا تفتح رابطاً آخر.
    await http().get(`/public/forms/${t2}/form`).set('x-form-session', session).expect(401);
    // ورمزُ نموذجٍ لا يصلح لآخر.
    await http().post(`/public/forms/${t2}/otp/verify`).send({ challengeId: issued.body.challengeId, code }).expect(400);
  });

  it('④ الاعتراضُ يقفل الرابطَ ويُعلم التاجر، والنسخةُ المعدّلة ترث الموعد، ويختمها المستأجرُ بالصيغة ٢', async () => {
    const c = await contractWithForm();
    const sent = await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const t1 = linkOf(c.mobile.e164);
    const s1 = await loginByOtp(app, t1, c.mobile.e164);
    await http().post(`/public/forms/${t1}/objection`).set('x-form-session', s1).field('note', '').expect(409);
    const objected = await http()
      .post(`/public/forms/${t1}/objection`)
      .set('x-form-session', s1)
      .field('note', 'القراءةُ ٤٨٢١٠ لا ٤٨٢١٣')
      .attach('photo', TINY_PNG, { filename: 'meter.png', contentType: 'image/png' })
      .expect(201);
    expect(objected.body.status).toBe('OBJECTED');
    expect((await http().get(`/public/forms/${t1}`).expect(200)).body.state).toBe('CLOSED');
    await http().get(`/public/forms/${t1}/form`).set('x-form-session', s1).expect(410);
    await signAsTenant(app, t1, s1).expect(410);

    const notified = await inA((tx) => tx.notification.count({ where: { kind: 'FORM_OBJECTED', linkId: c.formId } }));
    expect(notified).toBe(1);
    const staffView = await http().get(`/contracts/${c.contractId}/forms/${c.formId}`).set('Authorization', bearer(a.token)).expect(200);
    expect(staffView.body.objection).toMatchObject({ note: 'القراءةُ ٤٨٢١٠ لا ٤٨٢١٣', hasPhoto: true });
    await http().get(`/contracts/${c.contractId}/forms/${c.formId}/objection/photo`).set('Authorization', bearer(a.token)).expect(200);

    const revision = await http().post(`/contracts/${c.contractId}/forms/${c.formId}/revisions`).set('Authorization', bearer(a.token)).expect(201);
    expect(revision.body).toMatchObject({ status: 'DRAFT', revisionNo: 2, previousRevisionId: c.formId, revisionGroupId: c.formId });
    expect(revision.body.items[0].number).toBe('48213');
    await http().post(`/contracts/${c.contractId}/forms/${c.formId}/revisions`).set('Authorization', bearer(a.token)).expect(409);
    await http()
      .put(`/contracts/${c.contractId}/forms/${revision.body.id}/values`)
      .set('Authorization', bearer(a.token))
      .send({ values: [{ itemId: meterItem, number: 48210 }] })
      .expect(200);
    const resent = await sendForm(app, a.token, c.contractId, revision.body.id).expect(201);
    // ق-١٦٧١: النسخةُ المعدّلة ترث موعدَ الانقضاء ولا تُستأنف المدّة.
    expect(resent.body.form.signDeadline).toBe(sent.body.form.signDeadline);
    const t2 = linkOf(c.mobile.e164);
    expect(t2).not.toBe(t1);
    const s2 = await loginByOtp(app, t2, c.mobile.e164);
    const signed = await signAsTenant(app, t2, s2).expect(201);
    expect(signed.body).toMatchObject({ status: 'SEALED', finalCopy: 'SENT' });

    const sealed = await http().get(`/contracts/${c.contractId}/forms/${revision.body.id}`).set('Authorization', bearer(a.token)).expect(200);
    expect(sealed.body).toMatchObject({ status: 'SEALED', sealFormat: 2, revisionNo: 2 });
    expect(sealed.body.no).toMatch(new RegExp(`^FRM-${year}-\\d{4}$`));
    expect(sealed.body.signatures.map((s: { role: string; level: string }) => `${s.role}:${s.level}`).sort()).toEqual(['COUNTERPARTY:DRAWN_OTP', 'STAFF:DRAWN_STAFF_SESSION']);
    const verified = await http().get(`/contracts/${c.contractId}/forms/${revision.body.id}/verify`).set('Authorization', bearer(a.token)).expect(200);
    expect(verified.body).toMatchObject({ valid: true, contentIntact: true });
    // والسابقةُ باقيةٌ «معترَضاً عليه» لا رقمَ لها.
    const prior = await http().get(`/contracts/${c.contractId}/forms/${c.formId}`).set('Authorization', bearer(a.token)).expect(200);
    expect(prior.body).toMatchObject({ status: 'OBJECTED', no: null });
    const events = await http().get(`/contracts/${c.contractId}/forms/${revision.body.id}/events`).set('Authorization', bearer(a.token)).expect(200);
    const kinds = (events.body as { kind: string }[]).map((e) => e.kind);
    for (const k of ['STAFF_SIGNED', 'LINK_SENT', 'OTP_SENT', 'LOGIN', 'OBJECTED', 'REVISED', 'SIGNED', 'SEALED', 'FINAL_SENT']) expect(kinds).toContain(k);
  });

  it('⑤ النسخةُ النهائية رابطٌ يُفتح بالرمز وفيه حكمُ التحقّق، ورابطُ التوقيع قُفل', async () => {
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const signLink = linkOf(c.mobile.e164);
    const s = await loginByOtp(app, signLink, c.mobile.e164);
    await signAsTenant(app, signLink, s).expect(201);
    const finalLink = linkOf(c.mobile.e164);
    expect(finalLink).not.toBe(signLink);
    expect((await http().get(`/public/forms/${signLink}`).expect(200)).body.state).toBe('CLOSED');
    const opened = await http().get(`/public/forms/${finalLink}`).expect(200);
    expect(opened.body).toMatchObject({ state: 'ACTIVE', purpose: 'FINAL_COPY' });
    const fs = await loginByOtp(app, finalLink, c.mobile.e164);
    const view = await http().get(`/public/forms/${finalLink}/form`).set('x-form-session', fs).expect(200);
    expect(view.body.status).toBe('SEALED');
    expect(view.body.seal).toMatchObject({ valid: true });
    expect(view.body.seal.no).toMatch(/^FRM-/);
    // والنسخةُ النهائية لا تُوقَّع.
    await signAsTenant(app, finalLink, fs).expect(403);
  });

  it('⑥ الجوالُ لا يظهر كاملاً في صفّ التوقيع ولا الأحداث ولا التحدّيات ولا سجلّ التدقيق (ق-١٦٦٨)', async () => {
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const t = linkOf(c.mobile.e164);
    const s = await loginByOtp(app, t, c.mobile.e164);
    await signAsTenant(app, t, s).expect(201);
    const national = c.mobile.e164.slice(4); // تسعةُ أرقامٍ بعد رمز الدولة
    const dump = await inA(async (tx) => {
      const rows = await tx.$queryRaw<{ j: string }[]>`
        SELECT row_to_json(x)::text AS j FROM (
          SELECT "mobileMasked", "mobileIndex", "signerName" FROM "form_signatures" WHERE "instanceId" = ${c.formId}
          UNION ALL SELECT "recipientMasked", "note", "kind" FROM "form_signing_events" WHERE "instanceId" = ${c.formId}
          UNION ALL SELECT "mobileMasked", "mobileIndex", "codeHash" FROM "verification_challenges"
          UNION ALL SELECT "details"::text, "action", "actorName" FROM "audit_logs" WHERE "entityId" = ${c.formId}
        ) x`;
      return rows.map((r) => r.j).join('\n');
    });
    // المسبارُ يرى (ق-١٣٦): المقنَّعُ حاضر، والرقمُ الكامل غائب.
    expect(dump).toContain('•••');
    expect(dump).not.toContain(national);
    const signature = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: c.formId, role: 'COUNTERPARTY' } }));
    expect(signature.mobileIndex).toMatch(/^b1:/);
    expect(signature.mobileMasked).toMatch(/^05\d\d ••• \d{3}$/);
  });

  it('⑦ نفاذ فوق حدّ المنشأة: بلا رقم هويّةٍ لا يُرسل، والرمزُ مرفوض، ونفاذُ يوقّع، والمرفوضُ يُرفض', async () => {
    await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: 1000 }).expect(200);
    try {
      const noId = await contractWithForm();
      const refused = await sendForm(app, a.token, noId.contractId, noId.formId).expect(409);
      expect(refused.body.message).toContain('نفاذ');

      const c = await contractWithForm({ nationalId: '1012345678' });
      const sent = await sendForm(app, a.token, c.contractId, c.formId).expect(201);
      expect(sent.body.form.nafathRequired).toBe(true);
      const t = linkOf(c.mobile.e164);
      expect((await http().get(`/public/forms/${t}`).expect(200)).body.methods).toEqual({ otp: false, nafath: true });
      await http().post(`/public/forms/${t}/otp`).expect(403);
      const started = await http().post(`/public/forms/${t}/nafath`).expect(201);
      expect(started.body.displayCode).toMatch(/^\d+$/);
      const polled = await http().get(`/public/forms/${t}/nafath`).expect(200);
      expect(polled.body.state).toBe('APPROVED');
      const signed = await signAsTenant(app, t, polled.body.session.session).expect(201);
      expect(signed.body.status).toBe('SEALED');
      const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: c.formId, role: 'COUNTERPARTY' } }));
      expect(sig.level).toBe('DRAWN_NAFATH');
      expect(sig.identityTxRef).toBeTruthy();

      // والمرفوضُ في نفاذ لا يفتح جلسة.
      const r = await contractWithForm({ nationalId: '1012345686' });
      await sendForm(app, a.token, r.contractId, r.formId).expect(201);
      const tr = linkOf(r.mobile.e164);
      await http().post(`/public/forms/${tr}/nafath`).expect(201);
      const txRef = (await inA((tx) => tx.formSigningLink.findFirstOrThrow({ where: { instanceId: r.formId, purpose: 'SIGN' } }))).identityTxRef!;
      (app.get(VerificationGateway).identity() as MockIdentityProvider).decide(txRef, 'REJECTED');
      await http().get(`/public/forms/${tr}/nafath`).expect(403);
    } finally {
      await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: null }).expect(200);
    }
  });

  it('⑧ رابطٌ منقضٍ يُغلق، ورمزُه لا يُطلب', async () => {
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const t = linkOf(c.mobile.e164);
    await inA((tx) => tx.formSigningLink.updateMany({ where: { instanceId: c.formId }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    expect((await http().get(`/public/forms/${t}`).expect(200)).body.state).toBe('CLOSED');
    await http().post(`/public/forms/${t}/otp`).expect(410);
  });
});
