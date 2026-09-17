import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { createTenantCustomer } from './tenant-customer';

/**
 * إكمال §16 — البنود السبعة الأخيرة دفعةً واحدة:
 * تفاصيل الغرف · الوحدات بالجملة (كلٌّ أو لا شيء) · حالة «قادم مؤكَّد» ·
 * بنود تسوية الإلغاء (مجموعها مُدقَّق) · مرفقات المطالبات · صور نماذج
 * التسليم مع قفل التوقيع (16.15).
 */
describe('§16 completion batch (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let propertyId: string;
  let unitId: string;
  let upcomingContractId: string;
  let activeContractId: string;
  let claimId: string;
  let handoverId: string;
  let handoverItemId: string;
  let photoId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    propertyId = (await auth(request(app.getHttpServer()).post('/properties')).send({ name: `عمارة الإكمال ${suffix}`, ownership: 'owned' }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    // العقود لا تُحذف (تُلغى فقط) — يكفي إبقاء بيانات الاختبار مؤرشفة بالحذف
    // الناعم للعقار غير ممكن لوجود وحدات؛ نتركها بيانات تجريبية معلَّمة بلاحقة.
    await app.close();
  });

  it('[SPEC 16.1] roomDetails: stored on create, editable, returned in reads', async () => {
    const res = await auth(request(app.getHttpServer()).post('/units'))
      .send({ propertyId, unitNo: `غ-${suffix}`, type: 'apartment', rentMonthly: 2000, roomDetails: 'صالة + غرفتان، مكيفات راكبة' })
      .expect(201);
    unitId = res.body.id;
    expect(res.body.roomDetails).toContain('مكيفات');

    const upd = await auth(request(app.getHttpServer()).patch(`/units/${unitId}`)).send({ roomDetails: 'صالة + ثلاث غرف' }).expect(200);
    expect(upd.body.roomDetails).toBe('صالة + ثلاث غرف');
  }, 60000);

  it('[SPEC 16.1] bulk creation: prefix+count, all-or-nothing on collision with named clashes', async () => {
    const bulk = await auth(request(app.getHttpServer()).post('/units/bulk'))
      .send({ propertyId, prefix: `ب${suffix}-`, count: 3, type: 'office', rentMonthly: 1500 })
      .expect(201);
    expect(bulk.body.created).toBe(3);
    expect(bulk.body.unitNos).toContain(`ب${suffix}-1`);

    // إعادة نفس النطاق: رفض يسمّي المتصادمات، وبلا أي إنشاء جزئي.
    const before = (await auth(request(app.getHttpServer()).get('/units')).expect(200)).body.length;
    const clash = await auth(request(app.getHttpServer()).post('/units/bulk'))
      .send({ propertyId, prefix: `ب${suffix}-`, count: 5, type: 'office', rentMonthly: 1500 })
      .expect(409);
    expect(clash.body.message).toContain(`ب${suffix}-1`);
    const after = (await auth(request(app.getHttpServer()).get('/units')).expect(200)).body.length;
    expect(after).toBe(before);
  }, 60000);

  it("[SPEC 16.10] upcoming contract flips the unit to 'upcoming' — stronger than a plain reservation", async () => {
    const nextMonth = new Date(Date.now() + 35 * 24 * 3600 * 1000);
    const end = new Date(nextMonth.getTime() + 365 * 24 * 3600 * 1000);
    const res = await auth(request(app.getHttpServer()).post('/contracts'))
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId,
        customerId: await createTenantCustomer(app, token, `مستأجر قادم ${suffix}`),
        value: 24000,
        cycle: 'monthly',
        start: nextMonth.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      })
      .expect(201);
    upcomingContractId = res.body.id;

    const units = await auth(request(app.getHttpServer()).get('/units')).expect(200);
    const u = units.body.find((x: { id: string }) => x.id === unitId);
    expect(u.status).toBe('upcoming');
    expect(u.upcomingTenant).toContain('مستأجر قادم');
  }, 60000);

  it('a DRAFT contract does NOT flip the unit to upcoming — drafts may never happen', async () => {
    const draftUnit = (await auth(request(app.getHttpServer()).post('/units')).send({ propertyId, unitNo: `م-${suffix}`, type: 'apartment', rentMonthly: 1000 }).expect(201)).body.id;
    const nextMonth = new Date(Date.now() + 40 * 24 * 3600 * 1000);
    const end = new Date(nextMonth.getTime() + 365 * 24 * 3600 * 1000);
    await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: draftUnit, customerId: await createTenantCustomer(app, token, `مسودة ${suffix}`), value: 12000, cycle: 'monthly', start: nextMonth.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), draft: true })
      .expect(201);
    const units = await auth(request(app.getHttpServer()).get('/units')).expect(200);
    const u = units.body.find((x: { id: string }) => x.id === draftUnit);
    expect(u.status).toBe('vacant');
  }, 60000);

  it('bulk collision with a TRASHED unit is a named 409, not a raw 500', async () => {
    const no = `ح-${suffix}-1`;
    const doomed = (await auth(request(app.getHttpServer()).post('/units')).send({ propertyId, unitNo: no, type: 'office', rentMonthly: 900 }).expect(201)).body.id;
    await auth(request(app.getHttpServer()).delete(`/units/${doomed}`)).expect(204);
    const clash = await auth(request(app.getHttpServer()).post('/units/bulk'))
      .send({ propertyId, prefix: `ح-${suffix}-`, count: 2, type: 'office', rentMonthly: 900 })
      .expect(409);
    expect(clash.body.message).toContain('سلة المحذوفات');
  }, 60000);

  it('[SPEC 16.5] cancellation settlement lines: mismatch refused, matching lines stored on the contract', async () => {
    // عقد فعّال على وحدة مستقلة كي لا يزاحم عقد «القادم».
    const soloUnit = (await auth(request(app.getHttpServer()).post('/units')).send({ propertyId, unitNo: `س-${suffix}`, type: 'apartment', rentMonthly: 3000 }).expect(201)).body.id;
    const start = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    const end = new Date(Date.now() + 305 * 24 * 3600 * 1000);
    activeContractId = (
      await auth(request(app.getHttpServer()).post('/contracts'))
        .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: soloUnit, customerId: await createTenantCustomer(app, token, `مستأجر تسوية ${suffix}`), value: 36000, cycle: 'monthly', start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) })
        .expect(201)
    ).body.id;

    const today = new Date().toISOString().slice(0, 10);
    // القسطُ الجاري استُحقّ ذمّةً (ق-٩١٧) وبقي منه ما لم يُقدَّم بعد تاريخ الإلغاء — فوجهتُه
    // تُختار (ق-٩٢٧/٧) كي يبقى الرفضُ الأوّل رفضَ البنود لا رفضَ الوجهة.
    // بنود لا تجمع للمبلغ → رفض قبل أي أثر.
    await auth(request(app.getHttpServer()).post(`/contracts/${activeContractId}/cancel`))
      .send({
        cancelDate: today,
        cancelReason: 'اختبار البنود',
        installmentDisposition: 'cancel',
        unearnedDisposition: 'income',
        settlementBasis: 'amount',
        settlementAmount: 1000,
        settlementLines: [
          { label: 'بدل إشعار', amount: 700 },
          { label: 'صيانة', amount: 200 },
        ],
      })
      .expect(400);

    // بنود مطابقة → تُقبل وتُخزَّن وتظهر في تفاصيل العقد.
    await auth(request(app.getHttpServer()).post(`/contracts/${activeContractId}/cancel`))
      .send({
        cancelDate: today,
        cancelReason: 'إنهاء مبكر متفق عليه',
        installmentDisposition: 'cancel',
        unearnedDisposition: 'income',
        settlementBasis: 'amount',
        settlementAmount: 1000,
        settlementLines: [
          { label: 'بدل إشعار', amount: 800 },
          { label: 'أضرار بسيطة', amount: 350 },
          { label: 'خصم مقابل صيانة دفعها المستأجر', amount: -150 },
        ],
      })
      .expect(201);

    const detail = await auth(request(app.getHttpServer()).get(`/contracts/${activeContractId}`)).expect(200);
    expect(detail.body.status).toBe('CANCELLED');
    expect(detail.body.settlementLines).toHaveLength(3);
    const sum = detail.body.settlementLines.reduce((s: number, l: { amount: string }) => s + Number(l.amount), 0);
    expect(sum).toBeCloseTo(1000, 2);
  }, 60000);

  it('[SPEC 11.4] claim attachments: upload → list → signed download URL → delete', async () => {
    await auth(request(app.getHttpServer()).post(`/contracts/${upcomingContractId}/claims`))
      .send({ kind: 'DAMAGE', amount: 500, description: `كسر زجاج ${suffix}`, issuedAt: new Date().toISOString().slice(0, 10) })
      .expect(201);
    // نقرأ المطالبة من تفاصيل العقد — نفس ما تعتمده الواجهة.
    const detail = await auth(request(app.getHttpServer()).get(`/contracts/${upcomingContractId}`)).expect(200);
    claimId = detail.body.claims.find((c: { description: string }) => c.description.includes(suffix)).id;

    const uploaded = await auth(request(app.getHttpServer()).post(`/contracts/claims/${claimId}/attachments`))
      .attach('file', png, 'damage.png')
      .expect(201);
    expect(uploaded.body.filename).toBe('damage.png');

    const list = await auth(request(app.getHttpServer()).get(`/contracts/claims/${claimId}/attachments`)).expect(200);
    expect(list.body).toHaveLength(1);

    const url = await auth(request(app.getHttpServer()).get(`/contracts/claim-attachments/${list.body[0].id}/download-url`)).expect(200);
    expect(url.body.url).toContain('http');

    await auth(request(app.getHttpServer()).delete(`/contracts/claim-attachments/${list.body[0].id}`)).expect(200);
    const after = await auth(request(app.getHttpServer()).get(`/contracts/claims/${claimId}/attachments`)).expect(200);
    expect(after.body).toHaveLength(0);
  }, 60000);

  it('[SPEC 11.5 16.15] handover photos: attach to an item, then signing locks add AND remove (16.15)', async () => {
    const created = await auth(request(app.getHttpServer()).post(`/contracts/${upcomingContractId}/handovers`))
      .send({ type: 'DELIVERY', date: new Date().toISOString().slice(0, 10), items: [{ label: 'الباب الرئيسي', condition: 'GOOD' }] })
      .expect(201);
    const detail = await auth(request(app.getHttpServer()).get(`/contracts/${upcomingContractId}`)).expect(200);
    const handover = detail.body.handovers.find((h: { items: { label: string }[] }) => h.items.some((i) => i.label === 'الباب الرئيسي'));
    handoverId = handover.id;
    handoverItemId = handover.items[0].id;
    expect(created.body).toBeTruthy();

    const photo = await auth(request(app.getHttpServer()).post(`/contracts/handovers/${handoverId}/photos`))
      .field('itemId', handoverItemId)
      .field('note', 'خدش أعلى الإطار')
      .attach('file', png, 'door.png')
      .expect(201);
    photoId = photo.body.id;
    expect(photo.body.itemId).toBe(handoverItemId);

    // توقيع النموذج…
    await auth(request(app.getHttpServer()).post(`/contracts/${upcomingContractId}/handovers/${handoverId}/sign`)).send({ signedBy: `مستلم ${suffix}` }).expect(201);

    // …فيُقفل كل شيء: لا صورة جديدة ولا حذف قائمة.
    await auth(request(app.getHttpServer()).post(`/contracts/handovers/${handoverId}/photos`)).attach('file', png, 'late.png').expect(409);
    await auth(request(app.getHttpServer()).delete(`/contracts/handover-photos/${photoId}`)).expect(409);

    // العرض يبقى مفتوحاً.
    const list = await auth(request(app.getHttpServer()).get(`/contracts/handovers/${handoverId}/photos`)).expect(200);
    expect(list.body).toHaveLength(1);
  }, 60000);
});
