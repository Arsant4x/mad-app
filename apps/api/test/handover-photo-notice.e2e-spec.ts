import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { RETENTION_YEARS } from '../src/companies/company-movement.service';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): عقدٌ ونموذجان وصورةٌ في المخزن؛ لم تُقَس بعد، فالسقفُ ستّون ثانية معلنةً هنا.
jest.setTimeout(60000);

/**
 * ⚖️ إعلامُ المستأجر بحفظ صور نموذج التسليم (توجيه ٢٧٦ · ٢د · `ق-١٦٠٠` · السؤال ٢٤٣، بحكم صاحب المشروع:
 * «يُسأل المستشارُ عن «مستندٍ عائدٍ للعقار»؛ وإلى جوابه تبقى الصورُ بمدّة النموذج ويُعلَم المستأجر»).
 *
 * صورُ داخل المسكن بياناتٌ شخصية، ونظامُ حماية البيانات يوجب إتلافَها بعد غرضها إلا بنصٍّ يوجب مدّة؛ فإن بقيت
 * بمدّة النموذج (حفظُ المستندات العقارية) **وجب أن يعلم المستأجرُ ذلك يومَ التوقيع لا بعده**. فالنموذجُ الذي عليه
 * صورٌ لا يُوقَّع إلا بإقرار الموقِّع أن المستأجرَ أُعلم، وتُختم المدّةُ المعلنة يومَها مع التوقيع بساعة الخادم.
 *
 * والجوابُ محسوبٌ يداً: المدّةُ من مدد الحفظ نفسِها (`RETENTION_YEARS.realEstate`) لا رقمٌ في الاختبار.
 */
describe('إعلامُ المستأجر بحفظ صور نموذج التسليم (ق-١٦٠٠ · السؤال ٢٤٣)', () => {
  let app: INestApplication;
  let token: string;
  let contractId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

  async function draftForm(type: 'DELIVERY' | 'RECEIPT'): Promise<string> {
    const res = await http()
      .post(`/contracts/${contractId}/handovers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type, date: '2026-01-01', items: [{ label: 'غرفة النوم', condition: 'GOOD' }] })
      .expect(201);
    const drafts = res.body.handovers.filter((h: { type: string; status: string }) => h.type === type && h.status === 'DRAFT');
    expect(drafts).toHaveLength(1);
    return drafts[0].id as string;
  }

  async function addPhoto(handoverId: string) {
    await http()
      .post(`/contracts/handovers/${handoverId}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, { filename: `غرفة ${suffix}.png`, contentType: 'image/png' })
      .expect(201);
  }

  function formOf(body: { handovers: { id: string }[] }, id: string) {
    const form = body.handovers.find((h) => h.id === id) as Record<string, unknown> | undefined;
    expect(form).toBeDefined();
    return form as Record<string, unknown>;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' }).expect(200);
    token = login.body.accessToken;

    const property = await http()
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار إعلام الصور ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await http()
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `PN-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await http()
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL',
        vatInclusion: 'EXCLUSIVE',
        unitId: unit.body.id,
        customerId: await createTenantCustomer(app, token, `مستأجر إعلام الصور ${suffix}`),
        value: 12000,
        cycle: 'monthly',
        start: '2026-01-01',
        end: '2026-12-31',
      })
      .expect(201);
    contractId = contract.body.id;
  });

  afterAll(async () => {
    await http()
      .post(`/contracts/${contractId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-12-31', cancelReason: 'تنظيف بيانات الاختبار', installmentDisposition: 'cancel' });
    await app.close();
  });

  it('① العقدُ يحمل مدّةَ حفظ الصور كما تُقرأ من مدد الحفظ، فالشاشةُ تقرؤها ولا تكتبها', async () => {
    const res = await http().get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.handoverPhotoRetentionYears).toBe(RETENTION_YEARS.realEstate);
  });

  it('② نموذجٌ عليه صورٌ لا يُوقَّع بلا إقرار الإعلام، ويبقى مسوّدةً والمدّةُ في الرسالة', async () => {
    const id = await draftForm('DELIVERY');
    await addPhoto(id);

    const refused = await http()
      .post(`/contracts/${contractId}/handovers/${id}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ signedBy: 'المستأجر' })
      .expect(400);
    expect(String(refused.body.message)).toContain(String(RETENTION_YEARS.realEstate));

    // وإقرارٌ بالنفي ليس إقراراً.
    await http()
      .post(`/contracts/${contractId}/handovers/${id}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ signedBy: 'المستأجر', photoNoticeGiven: false })
      .expect(400);

    const after = await http().get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const form = formOf(after.body, id);
    expect(form.status).toBe('DRAFT');
    expect(form.signedAt).toBeNull();
    expect(form.photoNoticeYears).toBeNull();
  });

  it('③ وبالإقرار يُوقَّع، وتُختم المدّةُ المعلنة يومَها ووقتُ الإعلام هو وقتُ التوقيع بساعة الخادم', async () => {
    const contract = await http().get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const id = (contract.body.handovers as { id: string; type: string; status: string }[]).find((h) => h.type === 'DELIVERY' && h.status === 'DRAFT')!.id;

    const before = Date.now();
    const res = await http()
      .post(`/contracts/${contractId}/handovers/${id}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ signedBy: 'المستأجر', photoNoticeGiven: true })
      .expect(201);
    const after = Date.now();

    const form = formOf(res.body, id);
    expect(form.status).toBe('SIGNED');
    expect(form.photoNoticeYears).toBe(RETENTION_YEARS.realEstate);
    expect(form.photoNoticeAt).toBe(form.signedAt);
    const at = new Date(String(form.photoNoticeAt)).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(after + 1000);
  });

  it('④ ونموذجٌ بلا صورٍ يُوقَّع بلا إقرار، ولا يُختم عليه إعلامٌ لم يُطلب', async () => {
    const id = await draftForm('RECEIPT');
    const res = await http()
      .post(`/contracts/${contractId}/handovers/${id}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ signedBy: 'المستأجر' })
      .expect(201);
    const form = formOf(res.body, id);
    expect(form.status).toBe('SIGNED');
    expect(form.photoNoticeYears).toBeNull();
    expect(form.photoNoticeAt).toBeNull();
  });
});
