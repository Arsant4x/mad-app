import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { MockAuthorityVerifier } from '../src/verification/providers';
import { VerificationGateway } from '../src/verification/verification-gateway.service';
import { linkTokenFrom, loginByOtp, mockSms, sendForm, signAsTenant, TINY_PNG, uniqueMobile } from './form-signing-helpers';
import { registerIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — يُكتب بعد أوّل تشغيل.
jest.setTimeout(120000);

/** ورقةٌ موقَّعة صغيرة: رأسُ `PDF` يكفي ليُقرأ نوعُها. */
const TINY_PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');

/**
 * ⚖️ **من يوقّع عن الطرف وكيف** (توجيه ٢٨٧ ⑤ و⑥ و⑧ · `ق-١٥٩١` · `ق-١٦٣٥` ② و⑨):
 *
 * ① الشخصُ الاعتباريّ لا يُرسل إليه بلا ممثّل، والممثّلُ لغيره يُرفض، وحقولُه ناقصةً تُرفض ·
 * ② الممثّلُ بسندٍ متحقَّقٍ منه يستلم الرابطَ على جواله لا جوال البطاقة، ويوقّع، فيُختم سندُه مع توقيعه وتصدق البصمة، وجوالُه مشفَّرٌ لا صريح ·
 * ③ سندٌ لم يُعثر عليه يُرفض ولا يُعيَّن به أحد، والنموذجُ يبقى مسوّدة · وبلا مزوّدٍ «لم يُتحقَّق منه» ولا يحبس ·
 * ④ النسخةُ المعدّلة ترث الممثّلَ فتُرسل إليه بلا حقوله ·
 * ⑤ نفاذٌ فوق الحدّ يشترط رقمَ هويّة الممثّل، ونفاذُه يُقابَل برقمه ·
 * ⑥ الورقيّ من المسوّدة ومن «تنتظر التوقيع» يُختم بشهادة الموظّف، وبلا جوالٍ صالحٍ لا رابطَ نهائيّ، ولا ورقيَّ على مختوم ·
 * ⑦ رابطُ جهاز الموظّف يعود له ولا يُرسل، والقناةُ «جهاز الموظّف» على التوقيع.
 */
describe('Form signing parties — representative, paper, staff device (e2e)', () => {
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
  const authority = () => app.get(VerificationGateway).authority() as MockAuthorityVerifier;

  /** عقدٌ بعميلٍ بصفته وجواله (أو بلا جوال)، ونموذجٌ مسوّدةٌ عليه معبّأ. */
  async function contractWithForm(opts: { kind?: 'NATURAL' | 'LEGAL_PERSON'; phone?: string | null } = {}) {
    const tag = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
    const property = await http().post('/properties').set('Authorization', bearer(a.token)).send({ name: `عقار الأطراف ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await http()
      .post('/units')
      .set('Authorization', bearer(a.token))
      .send({ propertyId: property.body.id, unitNo: `PTY-${tag}`, type: 'مكتب', rentMonthly: 1000 })
      .expect(201);
    const mobile = uniqueMobile();
    const phone = opts.phone === undefined ? mobile.local : opts.phone;
    const customer = await http()
      .post('/customers')
      .set('Authorization', bearer(a.token))
      .send({ kind: opts.kind ?? 'NATURAL', name: `طرف ${tag}`, allowSameName: true, ...(phone ? { phone } : {}) })
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
      .send({ values: [{ itemId: meterItem, number: 1234 }] })
      .expect(200);
    return { contractId: contract.body.id as string, formId: form.body.id as string, mobile };
  }

  /** الإرسالُ إلى ممثّلٍ بحقوله. */
  function sendToRepresentative(contractId: string, formId: string, rep: { mobile: string; ref: string; type?: string; nationalId?: string; name?: string }) {
    const req = http()
      .post(`/contracts/${contractId}/forms/${formId}/send`)
      .set('Authorization', bearer(a.token))
      .field('representativeName', rep.name ?? 'مدير الشركة')
      .field('representativeMobile', rep.mobile)
      .field('authorityType', rep.type ?? 'CR_MANAGER')
      .field('authorityRef', rep.ref);
    if (rep.nationalId) req.field('representativeNationalId', rep.nationalId);
    return req.attach('drawing', TINY_PNG, { filename: 'sig.png', contentType: 'image/png' });
  }

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
    a = await registerIsolatedCompany(app, 'forms-parties');
    const type = await http().post('/admin/form-types').set('Authorization', bearer(ownerToken)).send({ code: `PTY_T${stamp}`, name: 'تسليمُ مكتب' }).expect(201);
    const platform = await http()
      .post('/admin/form-templates')
      .set('Authorization', bearer(ownerToken))
      .send({ formTypeId: type.body.id, name: 'تسليمُ مكتب', items: [{ label: 'قراءةُ العدّاد', itemType: 'METER_READING', required: true }] })
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

  it('① الشخصُ الاعتباريّ بلا ممثّلٍ لا يُرسل، والممثّلُ لغيره يُرفض، وحقولُه ناقصةً تُرفض', async () => {
    const legal = await contractWithForm({ kind: 'LEGAL_PERSON' });
    const none = await sendForm(app, a.token, legal.contractId, legal.formId).expect(409);
    expect(none.body.message).toContain('ممثّل');
    const partial = await http()
      .post(`/contracts/${legal.contractId}/forms/${legal.formId}/send`)
      .set('Authorization', bearer(a.token))
      .field('representativeName', 'مدير')
      .field('authorityType', 'CR_MANAGER')
      .attach('drawing', TINY_PNG, { filename: 'sig.png', contentType: 'image/png' })
      .expect(400);
    expect(partial.body.message).toContain('السند');

    const natural = await contractWithForm();
    const rep = uniqueMobile();
    const wrong = await sendToRepresentative(natural.contractId, natural.formId, { mobile: rep.local, ref: '1010101010' }).expect(400);
    expect(wrong.body.message).toContain('شخصٌ اعتباريّ');
    expect((await http().get(`/contracts/${natural.contractId}/forms/${natural.formId}`).set('Authorization', bearer(a.token)).expect(200)).body.status).toBe('DRAFT');
  });

  it('② الممثّلُ يستلم الرابطَ على جواله ويوقّع، فيُختم سندُه مع توقيعه وتصدق البصمة، وجوالُه مشفَّر', async () => {
    const c = await contractWithForm({ kind: 'LEGAL_PERSON' });
    const rep = uniqueMobile();
    const sent = await sendToRepresentative(c.contractId, c.formId, { mobile: rep.local, ref: `CR${stamp}` }).expect(201);
    expect(sent.body.delivery).toBe('SENT');
    expect(mockSms(app).lastTo(c.mobile.e164)).toBeUndefined();
    const t = linkOf(rep.e164);

    const session = await loginByOtp(app, t, rep.e164);
    const signed = await signAsTenant(app, t, session).expect(201);
    expect(signed.body).toEqual({ status: 'SEALED', finalCopy: 'SENT' });
    expect(mockSms(app).lastTo(rep.e164)?.text).toMatch(/نسختك النهائية/);

    const form = (await http().get(`/contracts/${c.contractId}/forms/${c.formId}`).set('Authorization', bearer(a.token)).expect(200)).body;
    const repSig = form.signatures.find((s: { role: string }) => s.role === 'REPRESENTATIVE');
    expect(repSig).toMatchObject({ signerName: 'مدير الشركة', level: 'DRAWN_OTP', channel: 'LINK', authorityType: 'CR_MANAGER', authorityRef: `CR${stamp}`, authorityVerification: 'VERIFIED' });
    expect(repSig.mobileMasked).not.toMatch(/\d{8,}/);
    expect(form.signatures.some((s: { role: string }) => s.role === 'COUNTERPARTY')).toBe(false);
    expect(form.sealFormat).toBe(2);
    expect((await http().get(`/contracts/${c.contractId}/forms/${c.formId}/verify`).set('Authorization', bearer(a.token)).expect(200)).body.valid).toBe(true);

    const d = await inA((tx) => tx.formSignerDesignation.findFirstOrThrow({ where: { instanceId: c.formId } }));
    expect(d.mobileCipher).toMatch(/^f1:/);
    expect(d.mobileCipher).not.toContain(rep.e164.slice(4));
    expect(d.mobileIndex).toMatch(/^b1:/);

    // عبثٌ بسند الممثّل في القاعدة لا يمرّ: صفُّ التوقيع لا يُعدَّل.
    const tamper = await inA((tx) => tx.formSignature.updateMany({ where: { instanceId: c.formId, role: 'REPRESENTATIVE' }, data: { authorityRef: 'X' } })).catch((e: unknown) => String((e as Error).message));
    expect(String(tamper)).toContain('23001');
  });

  it('③ سندٌ لم يُعثر عليه يُرفض ولا يُعيَّن به أحد، وبلا مزوّدٍ «لم يُتحقَّق منه» ولا يحبس', async () => {
    const c = await contractWithForm({ kind: 'LEGAL_PERSON' });
    const rep = uniqueMobile();
    const ref = `POA${stamp}`;
    authority().decide('NAJIZ_POA', ref, 'NOT_FOUND');
    const refused = await sendToRepresentative(c.contractId, c.formId, { mobile: rep.local, ref, type: 'NAJIZ_POA' }).expect(409);
    expect(refused.body.message).toContain('السند');
    expect(await inA((tx) => tx.formSignerDesignation.count({ where: { instanceId: c.formId } }))).toBe(0);
    expect(mockSms(app).lastTo(rep.e164)).toBeUndefined();
    expect((await http().get(`/contracts/${c.contractId}/forms/${c.formId}`).set('Authorization', bearer(a.token)).expect(200)).body.status).toBe('DRAFT');

    const saved = process.env.AUTHORITY_PROVIDER;
    delete process.env.AUTHORITY_PROVIDER;
    try {
      const sent = await sendToRepresentative(c.contractId, c.formId, { mobile: rep.local, ref, type: 'NAJIZ_POA' }).expect(201);
      expect(sent.body.form.status).toBe('AWAITING_SIGNATURE');
      const t = linkOf(rep.e164);
      await signAsTenant(app, t, await loginByOtp(app, t, rep.e164)).expect(201);
      const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: c.formId, role: 'REPRESENTATIVE' } }));
      expect(sig.authorityVerification).toBe('UNVERIFIED');
    } finally {
      process.env.AUTHORITY_PROVIDER = saved;
    }
  });

  it('④ النسخةُ المعدّلة ترث الممثّلَ فتُرسل إليه بلا حقوله', async () => {
    const c = await contractWithForm({ kind: 'LEGAL_PERSON' });
    const rep = uniqueMobile();
    await sendToRepresentative(c.contractId, c.formId, { mobile: rep.local, ref: `CRR${stamp}` }).expect(201);
    const t = linkOf(rep.e164);
    const session = await loginByOtp(app, t, rep.e164);
    await http().post(`/public/forms/${t}/objection`).set('x-form-session', session).field('note', 'العدّادُ خطأ').expect(201);
    const objection = await inA((tx) => tx.formObjection.findFirstOrThrow({ where: { instanceId: c.formId } }));
    expect(objection.byName).toBe('مدير الشركة');

    const revised = await http().post(`/contracts/${c.contractId}/forms/${c.formId}/revisions`).set('Authorization', bearer(a.token)).expect(201);
    const before = mockSms(app).outbox.length;
    await sendForm(app, a.token, c.contractId, revised.body.id).expect(201);
    expect(mockSms(app).outbox.length).toBe(before + 1);
    const t2 = linkOf(rep.e164);
    expect(t2).not.toBe(t);
    await signAsTenant(app, t2, await loginByOtp(app, t2, rep.e164)).expect(201);
    const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: revised.body.id, role: 'REPRESENTATIVE' } }));
    expect(sig.authorityRef).toBe(`CRR${stamp}`);
  });

  it('⑤ نفاذٌ فوق الحدّ يشترط رقمَ هويّة الممثّل، ونفاذُه يُقابَل برقمه', async () => {
    await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: 1000 }).expect(200);
    try {
      const c = await contractWithForm({ kind: 'LEGAL_PERSON' });
      const rep = uniqueMobile();
      const refused = await sendToRepresentative(c.contractId, c.formId, { mobile: rep.local, ref: `CRN${stamp}` }).expect(409);
      expect(refused.body.message).toContain('نفاذ');
      await sendToRepresentative(c.contractId, c.formId, { mobile: rep.local, ref: `CRN${stamp}`, nationalId: '1012345678' }).expect(201);
      const t = linkOf(rep.e164);
      expect((await http().get(`/public/forms/${t}`).expect(200)).body.methods).toEqual({ otp: false, nafath: true });
      await http().post(`/public/forms/${t}/nafath`).expect(201);
      const polled = await http().get(`/public/forms/${t}/nafath`).expect(200);
      expect(polled.body.state).toBe('APPROVED');
      await signAsTenant(app, t, polled.body.session.session).expect(201);
      const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: c.formId, role: 'REPRESENTATIVE' } }));
      expect(sig.level).toBe('DRAWN_NAFATH');
      const d = await inA((tx) => tx.formSignerDesignation.findFirstOrThrow({ where: { instanceId: c.formId } }));
      expect(d.nationalIdCipher).toMatch(/^f1:/);
      expect(d.nationalIdCipher).not.toContain('1012345678');
    } finally {
      await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: null }).expect(200);
    }
  });

  it('⑥ الورقيّ يُختم بشهادة الموظّف من المسوّدة ومن «تنتظر التوقيع»، وبلا جوالٍ لا رابطَ نهائيّ، ولا ورقيَّ على مختوم', async () => {
    // من المسوّدة لطرفٍ بلا جوال: رسمُ الموظّف والورقةُ في طلبٍ واحد.
    const noPhone = await contractWithForm({ phone: null });
    await sendForm(app, a.token, noPhone.contractId, noPhone.formId).expect(409);
    const missingDrawing = await http()
      .post(`/contracts/${noPhone.contractId}/forms/${noPhone.formId}/paper`)
      .set('Authorization', bearer(a.token))
      .attach('paper', TINY_PDF, { filename: 'paper.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect(missingDrawing.body.message).toBeTruthy();
    const paper = await http()
      .post(`/contracts/${noPhone.contractId}/forms/${noPhone.formId}/paper`)
      .set('Authorization', bearer(a.token))
      .field('signerName', 'الموقّع بيده')
      .attach('paper', TINY_PDF, { filename: 'paper.pdf', contentType: 'application/pdf' })
      .attach('drawing', TINY_PNG, { filename: 'sig.png', contentType: 'image/png' })
      .expect(201);
    expect(paper.body.finalCopy).toBe('NONE');
    expect(paper.body.form.status).toBe('SEALED');
    expect(paper.body.form.sealFormat).toBe(2);
    const paperSig = paper.body.form.signatures.find((s: { role: string }) => s.role === 'COUNTERPARTY');
    expect(paperSig).toMatchObject({ level: 'PAPER_WITNESSED', channel: 'PAPER', signerName: 'الموقّع بيده', witnessUserName: a.username, mobileMasked: null });
    expect((await http().get(`/contracts/${noPhone.contractId}/forms/${noPhone.formId}/verify`).set('Authorization', bearer(a.token)).expect(200)).body.valid).toBe(true);
    const image = await http().get(`/contracts/${noPhone.contractId}/forms/${noPhone.formId}/signatures/${paperSig.id}/image`).set('Authorization', bearer(a.token)).expect(200);
    expect(image.headers['content-type']).toContain('application/pdf');

    // على مختومٍ يُرفض.
    await http()
      .post(`/contracts/${noPhone.contractId}/forms/${noPhone.formId}/paper`)
      .set('Authorization', bearer(a.token))
      .attach('paper', TINY_PDF, { filename: 'paper.pdf', contentType: 'application/pdf' })
      .expect(409);

    // من «تنتظر التوقيع» لطرفٍ يرفض الرابط: الورقةُ تكفي، ورابطُ التوقيع يُقفل، والنسخةُ النهائية إلى جواله.
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const t = linkOf(c.mobile.e164);
    const done = await http()
      .post(`/contracts/${c.contractId}/forms/${c.formId}/paper`)
      .set('Authorization', bearer(a.token))
      .attach('paper', TINY_PNG, { filename: 'paper.png', contentType: 'image/png' })
      .expect(201);
    expect(done.body.finalCopy).toBe('SENT');
    expect(mockSms(app).lastTo(c.mobile.e164)?.text).toMatch(/نسختك النهائية/);
    expect((await http().get(`/public/forms/${t}`).expect(200)).body.state).toBe('CLOSED');

    // ونوعٌ غيرُ مقبول يُرفض قبل أيّ كتابة.
    const other = await contractWithForm();
    await http()
      .post(`/contracts/${other.contractId}/forms/${other.formId}/paper`)
      .set('Authorization', bearer(a.token))
      .attach('paper', Buffer.from('x'), { filename: 'paper.txt', contentType: 'text/plain' })
      .attach('drawing', TINY_PNG, { filename: 'sig.png', contentType: 'image/png' })
      .expect(400);
  });

  it('⑦ رابطُ جهاز الموظّف يعود له ولا يُرسل، والقناةُ «جهاز الموظّف» على التوقيع', async () => {
    const c = await contractWithForm();
    await http().post(`/contracts/${c.contractId}/forms/${c.formId}/device-link`).set('Authorization', bearer(a.token)).expect(409);
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const before = mockSms(app).outbox.length;
    const device = await http().post(`/contracts/${c.contractId}/forms/${c.formId}/device-link`).set('Authorization', bearer(a.token)).expect(201);
    expect(mockSms(app).outbox.length).toBe(before);
    const t = linkTokenFrom(device.body.url);
    const session = await loginByOtp(app, t, c.mobile.e164);
    await signAsTenant(app, t, session).expect(201);
    const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: c.formId, role: 'COUNTERPARTY' } }));
    expect(sig.channel).toBe('STAFF_DEVICE');
    expect(sig.level).toBe('DRAWN_OTP');
    const events = (await http().get(`/contracts/${c.contractId}/forms/${c.formId}/events`).set('Authorization', bearer(a.token)).expect(200)).body as { kind: string }[];
    expect(events.map((e) => e.kind)).toContain('DEVICE_LINK');
  });
});
