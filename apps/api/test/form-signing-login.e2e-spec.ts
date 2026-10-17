import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { OTP_POLICY } from '../src/verification/otp-policy';
import { linkTokenFrom, loginByOtp, mockSms, sendForm, signAsTenant, uniqueMobile } from './form-signing-helpers';
import { registerIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared here rather than assumed.
jest.setTimeout(150000);

const DAY_MS = 86_400_000;

/**
 * Logging in to a public form link. A Nafath approval is read once: it opens one session, and reading the same
 * transaction again opens nothing, on the tenant's link and on a substitute's link where the code comes first.
 * The signature names the transaction that opened its own session. Login codes for one form stop at six issues
 * (the first and five resends), across its revisions and with no reset by time.
 */
describe('Form signing login: one session per Nafath approval, six codes per form (e2e)', () => {
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

  async function contractWithForm(opts: { nationalId?: string } = {}) {
    const tag = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
    const property = await http().post('/properties').set('Authorization', bearer(a.token)).send({ name: `Login property ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await http()
      .post('/units')
      .set('Authorization', bearer(a.token))
      .send({ propertyId: property.body.id, unitNo: `LGN-${tag}`, type: 'شقة', rentMonthly: 1000 })
      .expect(201);
    const mobile = uniqueMobile();
    const customer = await http()
      .post('/customers')
      .set('Authorization', bearer(a.token))
      .send({ kind: 'NATURAL', name: `Login tenant ${tag}`, phone: mobile.local, allowSameName: true, ...(opts.nationalId ? { otherIdScheme: 'NAT', otherId: opts.nationalId } : {}) })
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

  /** Sends a form that requires Nafath: the threshold is read when the form is sent, so it is lifted right after. */
  async function sendRequiringNafath(c: { contractId: string; formId: string }) {
    await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: 1000 }).expect(200);
    try {
      const sent = await sendForm(app, a.token, c.contractId, c.formId).expect(201);
      expect(sent.body.form.nafathRequired).toBe(true);
    } finally {
      await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: null }).expect(200);
    }
  }

  const pendingTxRef = async (formId: string, role: 'COUNTERPARTY' | 'SUBSTITUTE') =>
    (await inA((tx) => tx.formSigningLink.findFirstOrThrow({ where: { instanceId: formId, purpose: 'SIGN', recipientRole: role, revokedAt: null } }))).identityTxRef;

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
    a = await registerIsolatedCompany(app, 'forms-login');
    const type = await http().post('/admin/form-types').set('Authorization', bearer(ownerToken)).send({ code: `LGN_T${stamp}`, name: 'Unit handover' }).expect(201);
    const platform = await http()
      .post('/admin/form-templates')
      .set('Authorization', bearer(ownerToken))
      .send({ formTypeId: type.body.id, name: 'Flat handover', items: [{ label: 'Meter reading', itemType: 'METER_READING', required: true }] })
      .expect(201);
    await http().post(`/admin/form-templates/${platform.body.id}/publish`).set('Authorization', bearer(ownerToken)).expect(201);
    const copy = await http().post('/form-templates/copy').set('Authorization', bearer(a.token)).send({ sourceTemplateId: platform.body.id }).expect(201);
    templateId = copy.body.id;
    meterItem = (copy.body.items as { id: string }[])[0].id;
    await http().post(`/form-templates/${templateId}/publish`).set('Authorization', bearer(a.token)).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('an approved Nafath transaction opens one session, and reading it again is refused', async () => {
    const c = await contractWithForm({ nationalId: '1012345678' });
    await sendRequiringNafath(c);
    const t = linkOf(c.mobile.e164);

    await http().post(`/public/forms/${t}/nafath`).expect(201);
    const firstRef = await pendingTxRef(c.formId, 'COUNTERPARTY');
    expect(firstRef).toBeTruthy();
    const first = await http().get(`/public/forms/${t}/nafath`).expect(200);
    expect(first.body.state).toBe('APPROVED');
    const session = first.body.session.session as string;

    // The same approval read again opens nothing and leaves the open session in place.
    await http().get(`/public/forms/${t}/nafath`).expect(409);
    await http().get(`/public/forms/${t}/form`).set('x-form-session', session).expect(200);

    // A newer transaction started and left pending does not become the evidence of the open session.
    await http().post(`/public/forms/${t}/nafath`).expect(201);
    const pendingRef = await pendingTxRef(c.formId, 'COUNTERPARTY');
    expect(pendingRef).toBeTruthy();
    expect(pendingRef).not.toBe(firstRef);
    await signAsTenant(app, t, session).expect(201);
    const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: c.formId, role: 'COUNTERPARTY' } }));
    expect(sig.level).toBe('DRAWN_NAFATH');
    expect(sig.identityTxRef).toBe(firstRef);
  });

  it('a substitute who logs in by code again cannot reuse an earlier Nafath approval', async () => {
    const c = await contractWithForm({ nationalId: '1012345678' });
    await sendRequiringNafath(c);
    const sub = uniqueMobile();
    await http()
      .post(`/contracts/${c.contractId}/forms/${c.formId}/substitute`)
      .set('Authorization', bearer(a.token))
      .send({ name: 'Nafath substitute', mobile: sub.local, nationalId: '1098765432' })
      .expect(201);
    const consent = linkOf(c.mobile.e164);
    const consentSession = await loginByOtp(app, consent, c.mobile.e164);
    await http().post(`/public/forms/${consent}/substitute/decision`).set('x-form-session', consentSession).send({ approve: true }).expect(200);

    const subLink = linkOf(sub.e164);
    const otpSession = await loginByOtp(app, subLink, sub.e164);
    await http().post(`/public/forms/${subLink}/nafath`).set('x-form-session', otpSession).expect(201);
    const firstRef = await pendingTxRef(c.formId, 'SUBSTITUTE');
    const approved = await http().get(`/public/forms/${subLink}/nafath`).set('x-form-session', otpSession).expect(200);
    expect(approved.body.state).toBe('APPROVED');

    // A fresh code login replaces the Nafath session; the old approval does not lift it back.
    const secondOtp = await loginByOtp(app, subLink, sub.e164);
    await http().get(`/public/forms/${subLink}/nafath`).set('x-form-session', secondOtp).expect(409);
    await http().get(`/public/forms/${subLink}/form`).set('x-form-session', secondOtp).expect(403);

    await http().post(`/public/forms/${subLink}/nafath`).set('x-form-session', secondOtp).expect(201);
    const secondRef = await pendingTxRef(c.formId, 'SUBSTITUTE');
    expect(secondRef).not.toBe(firstRef);
    const again = await http().get(`/public/forms/${subLink}/nafath`).set('x-form-session', secondOtp).expect(200);
    await signAsTenant(app, subLink, again.body.session.session).expect(201);
    const sig = await inA((tx) => tx.formSignature.findFirstOrThrow({ where: { instanceId: c.formId, role: 'SUBSTITUTE' } }));
    expect(sig.level).toBe('DRAWN_NAFATH');
    expect(sig.challengeId).toBeTruthy();
    expect(sig.identityTxRef).toBe(secondRef);
  });

  it('a form issues six login codes in all, across its revisions, and time does not reopen it', async () => {
    const c = await contractWithForm();
    await sendForm(app, a.token, c.contractId, c.formId).expect(201);
    const t1 = linkOf(c.mobile.e164);
    // One code logs in on the first revision, and the tenant objects.
    const s1 = await loginByOtp(app, t1, c.mobile.e164);
    await http().post(`/public/forms/${t1}/objection`).set('x-form-session', s1).field('note', 'The reading is wrong').expect(201);
    const revision = await http().post(`/contracts/${c.contractId}/forms/${c.formId}/revisions`).set('Authorization', bearer(a.token)).expect(201);
    await sendForm(app, a.token, c.contractId, revision.body.id).expect(201);
    const t2 = linkOf(c.mobile.e164);
    expect(t2).not.toBe(t1);

    // The revision shares the form's count: five more codes, then the cap.
    for (let i = 1; i < OTP_POLICY.maxIssuesPerSubject; i++) await http().post(`/public/forms/${t2}/otp`).expect(201);
    const refused = await http().post(`/public/forms/${t2}/otp`).expect(429);
    expect(refused.body.message).toBeTruthy();

    // Two days later the cap still holds: the count has no time window.
    const moved = await inA((tx) =>
      tx.verificationChallenge.updateMany({
        where: { subjectKey: `form:${c.formId}:SIGN` },
        data: { createdAt: new Date(Date.now() - 2 * DAY_MS), expiresAt: new Date(Date.now() - 2 * DAY_MS) },
      }),
    );
    expect(moved.count).toBe(OTP_POLICY.maxIssuesPerSubject);
    await http().post(`/public/forms/${t2}/otp`).expect(429);

    // Another form of the same company is not affected.
    const other = await contractWithForm();
    await sendForm(app, a.token, other.contractId, other.formId).expect(201);
    await http().post(`/public/forms/${linkOf(other.mobile.e164)}/otp`).expect(201);
  });
});
