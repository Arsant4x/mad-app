import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@mad-app/db';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { CompanyMovementService, RETENTION_YEARS, retentionDeadline } from '../src/companies/company-movement.service';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): عقدٌ وخمسةُ نماذج وصورٌ في المخزن وقفلٌ مقصود؛ لم تُقَس بعد، فالسقفُ تسعون ثانية معلنةً هنا.
jest.setTimeout(90000);

/**
 * ⚖️ صورُ نموذج التسليم بحكم صاحب المشروع (توجيه ٢٧٧ · ٢ج · `ق-١٦١٩`/ج و`ق-١٦٢٥`):
 * «الاستلامُ والتسليمُ والوحدةُ فارغة يكفيهما بندٌ في العقد، ولا يُطلب فيهما إقرارُ الموظّف. … والصورُ لا تُحذف، وتبقى في سجلّ
 * العقد طوالَ مدّة الحفظ النظامية. … وقفلُ الصفّ بين رفع الصورة والتوقيع.» و«تُنقل صورُه الجديدة إلى المخزن الحسّاس الآن».
 *
 * كان النموذجُ الذي عليه صورٌ لا يُوقَّع إلا بإقرار الموظّف أنه أعلم المستأجر (`ق-١٦٠٠` · #718)؛ فالإقرارُ يسقط في النوعين، وتبقى
 * مدّةُ الحفظ تُختم يومَ التوقيع (ما يحفظه بندُ العقد). والجوابُ محسوبٌ يداً: المدّةُ من مدد الحفظ نفسِها (`RETENTION_YEARS.realEstate`).
 */
describe('صورُ نموذج التسليم: بندُ العقد يكفي، والصورةُ في المخزن الحسّاس، وقفلٌ بين الرفع والتوقيع (ق-١٦١٩/ج · ق-١٦٢٥)', () => {
  let app: INestApplication;
  let token: string;
  let contractId: string;
  let companyId: string;
  const prisma = new PrismaClient();

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

  async function draftForm(type: 'DELIVERY' | 'RECEIPT'): Promise<string> {
    const before = await http().get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const known = new Set((before.body.handovers as { id: string }[]).map((h) => h.id));
    const res = await http()
      .post(`/contracts/${contractId}/handovers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type, date: '2026-01-01', items: [{ label: 'غرفة النوم', condition: 'GOOD' }] })
      .expect(201);
    const fresh = (res.body.handovers as { id: string }[]).filter((h) => !known.has(h.id));
    expect(fresh).toHaveLength(1);
    return fresh[0].id;
  }

  const addPhoto = (handoverId: string) =>
    http()
      .post(`/contracts/handovers/${handoverId}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, { filename: `غرفة ${suffix}.png`, contentType: 'image/png' });

  const sign = (handoverId: string) =>
    http().post(`/contracts/${contractId}/handovers/${handoverId}/sign`).set('Authorization', `Bearer ${token}`).send({ signedBy: 'المستأجر' });

  async function formOf(id: string) {
    const res = await http().get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const form = (res.body.handovers as Record<string, unknown>[]).find((h) => h.id === id);
    expect(form).toBeDefined();
    return form as Record<string, unknown>;
  }

  /** عددُ الجلسات المنتظرة على قفل صفٍّ في هذه القاعدة الآن. */
  const waitingOnLocks = async (): Promise<number> => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    return Number(rows[0].n);
  };

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
      .send({ name: `عقار صور التسليم ${suffix}`, ownership: 'owned' })
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
        customerId: await createTenantCustomer(app, token, `مستأجر صور التسليم ${suffix}`),
        value: 12000,
        cycle: 'monthly',
        start: '2026-01-01',
        end: '2026-12-31',
      })
      .expect(201);
    contractId = contract.body.id;
    companyId = contract.body.companyId;
    expect(typeof companyId).toBe('string');
  });

  afterAll(async () => {
    await prisma.$disconnect();
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

  it('② التسليمُ والاستلامُ عليهما صورٌ يُوقَّعان بلا إقرارٍ من الموظّف، وتُختم مدّةُ الحفظ يومَ التوقيع بساعة الخادم (ق-١٦١٩/ج)', async () => {
    const forms: Record<string, unknown>[] = [];
    const before = Date.now();
    for (const type of ['DELIVERY', 'RECEIPT'] as const) {
      const id = await draftForm(type);
      await addPhoto(id).expect(201);
      await sign(id).expect(201);
      forms.push(await formOf(id));
    }
    const after = Date.now();
    for (const form of forms) {
      expect({ status: form.status, years: form.photoNoticeYears, at: form.photoNoticeAt }).toEqual({
        status: 'SIGNED',
        years: RETENTION_YEARS.realEstate,
        at: form.signedAt,
      });
      const at = new Date(String(form.photoNoticeAt)).getTime();
      expect(at).toBeGreaterThanOrEqual(before - 1000);
      expect(at).toBeLessThanOrEqual(after + 1000);
    }
  });

  it('⚖️ ②ب والمدّةُ المختومة يقرؤها قياسُ الحفظ عند الإغلاق والحذف النهائيّ، فختمٌ أطولُ يمدّ الأجل (توجيه ٢٨٦ · القاعدة ٣٧)', async () => {
    const movement = app.get(CompanyMovementService);
    const tenantPrisma = app.get(TenantPrismaService);
    const id = await draftForm('DELIVERY');
    await addPhoto(id).expect(201);
    await sign(id).expect(201);
    // تحت سياق المنشأة: الصفرُ بلا سياقٍ عمى (`ق-٢٦٢`)، فالقراءةُ الموجبة هنا تُثبت أن المسبار يرى.
    expect((await movement.retention(companyId)).sealedYears).toBe(RETENTION_YEARS.realEstate);
    // ختمٌ بمدّةٍ أطولَ (كأنه قيل يومَها ثم قصُرت المدّة) يُقرأ ويمدّ الأجل، ثم يُعاد كما كان.
    const longer = RETENTION_YEARS.realEstate + 5;
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.contractHandover.update({ where: { id }, data: { photoNoticeYears: longer } }));
    try {
      const kept = await movement.retention(companyId);
      expect(kept.sealedYears).toBe(longer);
      const closedAt = new Date('2026-09-11T00:00:00Z');
      expect(retentionDeadline(closedAt, kept.models, kept.sealedYears).getUTCFullYear()).toBe(2026 + longer);
    } finally {
      await tenantPrisma.runInTenantContext(companyId, (tx) => tx.contractHandover.update({ where: { id }, data: { photoNoticeYears: RETENTION_YEARS.realEstate } }));
    }
  });

  it('③ ونموذجٌ بلا صورٍ يُوقَّع ولا تُختم عليه مدّةُ حفظٍ لا موضوعَ لها', async () => {
    const id = await draftForm('RECEIPT');
    await sign(id).expect(201);
    const form = await formOf(id);
    expect({ status: form.status, years: form.photoNoticeYears, at: form.photoNoticeAt }).toEqual({ status: 'SIGNED', years: null, at: null });
  });

  it('④ الصورةُ الجديدة في المخزن الحسّاس: تُبثّ عبر الخادم ببايتاتها، ولا رابطَ موقَّعاً لها (ق-١٦٢٥)', async () => {
    const id = await draftForm('DELIVERY');
    const photoId = (await addPhoto(id).expect(201)).body.id as string;
    const streamed = await http()
      .get(`/contracts/handover-photos/${photoId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    const signedUrl = await http().get(`/contracts/handover-photos/${photoId}/download-url`).set('Authorization', `Bearer ${token}`);
    expect({ streamed: streamed.status, same: Buffer.compare(streamed.body as Buffer, PNG) === 0, signedUrl: signedUrl.status }).toEqual({
      streamed: 200,
      same: true,
      signedUrl: 403,
    });
  });

  /**
   * 🔴 **قفلُ الصفّ بين رفع الصورة والتوقيع** (`ق-١٦١٩`/ج): كان التوقيعُ يعدّ الصورَ ثم يكتب، والرفعُ يقرأ الحالَ ثم يُدرج، بلا قفلٍ بينهما؛ فصورةٌ
   * تُرفع بعد أن عدّ التوقيعُ صفراً وقبل أن يُكتب تدخل نموذجاً وُقّع بدونها، فيصير نموذجٌ موقَّعٌ عليه صورةٌ بلا مدّة حفظٍ مختومة.
   * **والتداخلُ مفروضٌ لا منتظَر** (`§8.8` الوجهُ الثالث): معاملةٌ جانبيّة تمسك صفَّ النموذج (`FOR NO KEY UPDATE`: يقف عليه ما يكتب الصفَّ،
   * ولا يقف عليه إدراجٌ يشير إليه)، فيقف التوقيعُ أوّلاً، ثم يُرسل الرفع، ثم تُفلت. **والجوابُ**: إمّا أن تدخل الصورةُ قبل التوقيع فتُختم مدّتُها
   * معه، وإمّا أن تُردّ `409` بعده؛ ولا ثالث.
   */
  it('🔴 ⑤ صورةٌ تُرفع في لحظة التوقيع إمّا قبله فتُختم مدّتُها معه وإمّا تُردّ بعده، ولا تدخل نموذجاً وُقّع بدونها', async () => {
    const id = await draftForm('DELIVERY');
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    let held = 0;
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
        held = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "contract_handovers" WHERE id = ${id} FOR NO KEY UPDATE`).length;
        locked();
        await released;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    await lockTaken;
    const baseline = await waitingOnLocks();
    let signReply: request.Response | null = null;
    let addReply: request.Response | null = null;
    let waiting = 0;
    try {
      const signing = sign(id).then((r) => (signReply = r));
      for (let i = 0; i < 100 && (waiting = await waitingOnLocks()) < baseline + 1; i++) await new Promise((r) => setTimeout(r, 100));
      const adding = addPhoto(id).then((r) => (addReply = r));
      for (let i = 0; i < 100 && !addReply && (await waitingOnLocks()) < baseline + 2; i++) await new Promise((r) => setTimeout(r, 100));
      release();
      await holder;
      await Promise.all([signing, adding]);
    } finally {
      release();
    }
    const form = await formOf(id);
    const photos = (await http().get(`/contracts/handovers/${id}/photos`).set('Authorization', `Bearer ${token}`).expect(200)).body as unknown[];
    const added = (addReply as request.Response | null)?.status;
    // المسبارُ يرى (القاعدة ٢٩): القفلُ الجانبيّ أمسك صفَّ النموذج، والتوقيعُ وقف عليه قبل أن يُرسل الرفع.
    expect({ held, signStood: waiting >= baseline + 1 }).toEqual({ held: 1, signStood: true });
    expect({
      signed: (signReply as request.Response | null)?.status,
      status: form.status,
      outcome: added === 201 ? { photos: photos.length, years: form.photoNoticeYears } : { added, photos: photos.length, years: form.photoNoticeYears },
    }).toEqual({
      signed: 201,
      status: 'SIGNED',
      outcome: added === 201 ? { photos: 1, years: RETENTION_YEARS.realEstate } : { added: 409, photos: 0, years: null },
    });
  });
});
