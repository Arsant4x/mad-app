import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { ConsentService } from '../src/consent/consent.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (42.4 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(130000);

/**
 * ⚖️ **موافقةُ التاجر على المعالجين الفرعيين — اختيارٌ لا حجب** (`ق-٥٨١` · `ق-٥٨٩`).
 *
 * اللائحةُ م١٧/٥/ج توجب **موافقةً مسبقة** من جهة التحكم (وهي التاجر) قبل التعاقد مع
 * معالجٍ فرعيّ. **والحكمُ أن يُمنع من لم يقبل — بصيغةِ «اقبل، أو خذ بياناتك واخرج»**.
 *
 * وأربعةٌ تُقاس هنا، وكلُّها **بكسرٍ يُترجم** لا بوصف:
 *   ① **مهلةُ ثلاثين يوماً شرطُ قبولٍ لا تنبيه** — نشرٌ بمهلةٍ أقصر يُرفض.
 *   ② **التذكيرُ متكرّرٌ** — عند النشر وقبل السريان بمراحلَ معلومة.
 *   ③ **المنعُ لا يقع قبل السريان** — والنسخةُ تُقرأ قبله.
 *   ④ **ومنفذُ الخروج لا يُغلق** — التصديرُ والإغلاق والإشعاراتُ تعمل وهو ممنوع.
 */
describe('Sub-processor consent (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let consent: ConsentService;
  let adminToken: string;
  let templateId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanupCompanyIds: string[] = [];
  const madeVersions: number[] = [];
  const madeSubProcessorIds: string[] = [];

  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const DAY = 24 * 3600 * 1000;

  let seq = 0;
  async function makeCompany(): Promise<{ id: string; token: string; username: string }> {
    const username = `consent-co-${suffix}-${seq++}`;
    const res = await admin(request(app.getHttpServer()).post('/companies'))
      .send({ username, password: 'ConsentPass123!', orgName: `منشأة موافقة ${username}`, permissionTemplateId: templateId, subEnd: '2030-01-01' })
      .expect(201);
    cleanupCompanyIds.push(res.body.id);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'ConsentPass123!' });
    return { id: res.body.id, token: login.body.accessToken, username };
  }

  /** نسخةٌ منشورةٌ بمهلةٍ نظامية، ثم يُدفع تاريخُ سريانها إلى الماضي لتصير سارية. */
  async function publishAndMakeEffective(summary: string, effectiveAt: Date): Promise<number> {
    const res = await admin(request(app.getHttpServer()).post('/admin/processing-agreement/versions'))
      .send({ summary, effectiveFrom: new Date(Date.now() + 31 * DAY).toISOString() })
      .expect(201);
    madeVersions.push(res.body.version);
    await prisma.subProcessorListVersion.update({ where: { version: res.body.version }, data: { effectiveFrom: effectiveAt } });
    consent.invalidate();
    return res.body.version;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    consent = app.get(ConsentService);

    adminToken = (
      await request(app.getHttpServer()).post('/auth/login').send({
        username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan',
        password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD,
      })
    ).body.accessToken;

    const templates = await admin(request(app.getHttpServer()).get('/templates')).expect(200);
    // القالبُ العامُّ الشامل غيرُ النظاميّ (ق-٦٤٤): لوحةُ المدير ترفض «المطوّر» منذ توجيه ٢٧٥، وكانت هذه الحزمةُ تأخذه أوّلاً.
    templateId = (templates.body as { id: string; isAllScreens: boolean; isSystem: boolean; companyId: string | null }[]).find((t) => t.isAllScreens && !t.isSystem && t.companyId === null)!.id;

    const sp = await admin(request(app.getHttpServer()).post('/admin/processing-agreement/sub-processors'))
      .send({ name: `مزوّدُ تخزينٍ ${suffix}`, purpose: 'نسخةٌ احتياطية خارج المضيف', location: 'المملكة العربية السعودية — جدة', dataCategories: ['بياناتُ المنشأة', 'مستنداتُها'] })
      .expect(201);
    madeSubProcessorIds.push(sp.body.id);
  }, 60000);

  /**
   * ⚠️ **حدٌّ معلَنٌ في هذه الحزمة**: النسخةُ السارية **بوّابةٌ عامّةٌ لكلِّ المنشآت** — فتنظيفُها
   * هنا ليس ترتيباً بل شرطُ سلامةِ ما بعدها. **ويصحّ لأن الشرائحَ تُشغَّل تباعاً**
   * (`sharded-jest`: حلقةٌ بـ`await`) **والمجموعاتُ داخل الشريحة بـ`--runInBand`** — فلا
   * مجموعةَ أخرى تعمل بينما نسخةٌ من صنعنا سارية.
   */
  afterAll(async () => {
    // ⚠️ القبولُ يشير إلى النسخة بـ`Restrict` — فيجب أن يزول قبلها. **وزوالُه بسلسلة حذف
    //    المنشأة** (`Cascade`) لا بحذفٍ عابرٍ للمستأجرين: الجدولُ تحت `FORCE` فحذفٌ بلا
    //    سياقٍ يمسّ صفراً ويبدو ناجحاً.
    for (const id of cleanupCompanyIds) await hardDeleteCompanyForTest(prisma, id);
    await prisma.subProcessorListVersion.deleteMany({ where: { version: { in: madeVersions } } });
    await prisma.subProcessor.deleteMany({ where: { id: { in: madeSubProcessorIds } } });
    consent.invalidate();
    await app.close();
  });

  /** ① المهلةُ شرطُ قبولٍ لا تنبيه — **وكسرُها يُترجم**. */
  it('① نشرٌ بمهلةٍ أقصر من ثلاثين يوماً يُرفض — والمهلةُ في الرسالة', async () => {
    const soon = await admin(request(app.getHttpServer()).post('/admin/processing-agreement/versions'))
      .send({ summary: 'محاولةٌ بمهلةٍ قصيرة', effectiveFrom: new Date(Date.now() + 3 * DAY).toISOString() })
      .expect(400);
    expect(soon.body.message).toContain('30');
    // ولا نسخةَ خُلقت بالمحاولة.
    expect(await prisma.subProcessorListVersion.findFirst({ where: { summary: 'محاولةٌ بمهلةٍ قصيرة' } })).toBeNull();
  }, 60000);

  /**
   * ③ **المنعُ لا يقع قبل السريان** — والتاجرُ يقرأ ما سيسري ويقبله مبكّراً أو ينتظر.
   * ② **والتذكيرُ يقع عند النشر** — إشعارٌ في صندوقه لا رسالةٌ في وثيقة.
   */
  it('③ نسخةٌ منشورةٌ لم تسرِ بعد: لا منع — ويصل إشعارُها ويُقرأ نصُّها', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const res = await admin(request(app.getHttpServer()).post('/admin/processing-agreement/versions'))
      .send({ summary: `إضافةُ مزوّد تخزينٍ داخل المملكة ${suffix}`, effectiveFrom: new Date(Date.now() + 40 * DAY).toISOString() })
      .expect(201);
    madeVersions.push(res.body.version);
    consent.invalidate();

    // لا منع: العملُ يمضي كما كان.
    await auth(request(app.getHttpServer()).get('/customers')).expect(200);
    const view = await auth(request(app.getHttpServer()).get('/processing-agreement')).expect(200);
    expect(view.body.blocked).toBe(false);
    expect(view.body.upcoming.version).toBe(res.body.version);
    expect(view.body.upcoming.entries[0].location).toContain('السعودية');
    expect(view.body.noticeDays).toBe(30);

    // ② والإشعارُ وصل — بالعنوان الذي يحمل تاريخَ السريان.
    const tenantPrisma = app.get(TenantPrismaService);
    const notes = await tenantPrisma.runInTenantContext(co.id, (tx) => tx.notification.findMany({ where: { kind: 'SUBPROCESSOR_CONSENT' } }));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].dedupeKey).toBe(`subprocessor-v${res.body.version}-published`);
  }, 90000);

  /**
   * ⭐ **الحكمُ بصيغته**: يُمنع من لم يقبل — **وأمامه بابان**. وهذه الحالةُ تقيس الأربعة معاً.
   */
  it('⭐ بعد السريان: يُمنع بالرمز، ويبقى التصديرُ والإغلاقُ والإشعاراتُ والاتفاقيةُ تعمل — ثم يقبل فيعود', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    await auth(request(app.getHttpServer()).get('/customers')).expect(200);

    const version = await publishAndMakeEffective(`سريانٌ فوريّ ${suffix}`, new Date(Date.now() - DAY));

    // ① المنعُ واقعٌ وبالرمز الذي تفرّع عليه الواجهة — والرسالةُ تحمل البابَين.
    const blocked = await auth(request(app.getHttpServer()).get('/customers')).expect(403);
    expect(blocked.body.code).toBe('CONSENT_REQUIRED');
    expect(blocked.body.message).toContain('تنزّل بياناتك');
    expect(blocked.body.message).toContain('تُغلق حسابك');
    // والكتابةُ ممنوعةٌ كالقراءة — فمن لم يأذن لا تمرّ بياناتُه.
    await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميلٌ ممنوع ${suffix}` }).expect(403);

    // ④ ومنفذُ الخروج مفتوح: الاتفاقيةُ تُقرأ · والتصديرُ يعمل · والإغلاقُ يُطلب · والإشعاراتُ تُقرأ.
    const view = await auth(request(app.getHttpServer()).get('/processing-agreement')).expect(200);
    expect(view.body.blocked).toBe(true);
    expect(view.body.requiredVersion).toBe(version);
    expect(view.body.acceptedVersion).toBeNull();
    const exported = await auth(request(app.getHttpServer()).get('/export')).expect(200);
    expect(exported.body.manifest.tables).toBeGreaterThan(0);
    await auth(request(app.getHttpServer()).get('/notifications')).expect(200);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'لا أوافق على المعالج الفرعيّ' }).expect(201);
    await auth(request(app.getHttpServer()).post(`/deletion-request/${filed.body.id}/cancel`)).expect(201);

    // ② ثم يقبل — فيعود العملُ، ويبقى صفُّ القبول شاهداً بمن قبِل.
    const accepted = await auth(request(app.getHttpServer()).post('/processing-agreement/accept')).send({ version }).expect(201);
    expect(accepted.body.blocked).toBe(false);
    expect(accepted.body.acceptedVersion).toBe(version);
    await auth(request(app.getHttpServer()).get('/customers')).expect(200);

    // ⭐ **ويُقرأ تحت سياق المنشأة**: الجدولُ تحت `FORCE` — والقراءةُ بلا سياقٍ صفرٌ بلا خطأ
    //    (`ق-٢٦٢`)، فيُثبَت الوجودُ بالسياق ويُثبَت العمى بغيره.
    const tenantPrisma = app.get(TenantPrismaService);
    expect(await prisma.processingAgreementAcceptance.count({ where: { companyId: co.id } })).toBe(0);
    const row = await tenantPrisma.runInTenantContext(co.id, (tx) => tx.processingAgreementAcceptance.findFirst({ where: { version } }));
    expect(row).toBeTruthy();
    expect(row!.acceptedByName).toBe(co.username);
    expect(row!.acceptedAt).toBeTruthy();
    // والصورةُ على المنشأة كُتبت في المعاملة نفسِها — فلا تفترق عن أصلها.
    expect((await prisma.company.findUniqueOrThrow({ where: { id: co.id } })).consentedListVersion).toBe(version);

    // وقبولٌ ثانٍ للنسخة نفسِها يُرفض.
    await auth(request(app.getHttpServer()).post('/processing-agreement/accept')).send({ version }).expect(409);
  }, 120000);

  /** **الموافقةُ قرارُ مالكٍ لا موظّف** — فموظّفُ المنشأة يُردّ `403` ولو ملك الشاشة. */
  it('الموافقةُ لمالك الحساب وحده — وموظّفُه يُردّ', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    // ⚠️ نسخةٌ سارية من حالةٍ سابقة تمنع هذه المنشأةَ من أوّل طلب — **وهو البناءُ يعمل**.
    //    فيقبلها مالكُها أوّلاً كي يُقاس المنعُ على الموظّف لا على الحساب كلِّه.
    const state = await auth(request(app.getHttpServer()).get('/processing-agreement')).expect(200);
    if (state.body.blocked) await auth(request(app.getHttpServer()).post('/processing-agreement/accept')).send({ version: state.body.requiredVersion }).expect(201);
    const tpl = await auth(request(app.getHttpServer()).post('/templates'))
      .send({ name: `كاتب-موافقة-${suffix}`, isAllScreens: true, allowedScreens: [], screenActions: {} })
      .expect(201);
    await auth(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'كاتب', username: `consent-clerk-${suffix}`, password: 'ConsentPass123!', permissionTemplateId: tpl.body.id })
      .expect(201);
    const clerk = await request(app.getHttpServer()).post('/auth/login').send({ username: `consent-clerk-${suffix}`, password: 'ConsentPass123!' });

    const version = await publishAndMakeEffective(`نسخةُ الموظّف ${suffix}`, new Date(Date.now() - DAY));
    const refused = await request(app.getHttpServer())
      .post('/processing-agreement/accept')
      .set('Authorization', `Bearer ${clerk.body.accessToken}`)
      .send({ version })
      .expect(403);
    expect(refused.body.message).toContain('مالك الحساب');
  }, 120000);

  /**
   * ② **تذكيرٌ متكرّرٌ لا إشعارٌ واحد** — والمراحلُ تُقاس بأيّامها لا بالنيّة.
   */
  it('② التذكيرُ يتكرّر بمراحله: قبل السريان بأربعةَ عشرَ يوماً وبسبعةٍ وبيوم', async () => {
    const co = await makeCompany();
    const tenantPrisma = app.get(TenantPrismaService);
    const res = await admin(request(app.getHttpServer()).post('/admin/processing-agreement/versions'))
      .send({ summary: `نسخةُ التذكير ${suffix}`, effectiveFrom: new Date(Date.now() + 31 * DAY).toISOString() })
      .expect(201);
    madeVersions.push(res.body.version);
    const effectiveFrom = new Date(res.body.effectiveFrom);

    const keys = async () =>
      (await tenantPrisma.runInTenantContext(co.id, (tx) => tx.notification.findMany({ where: { kind: 'SUBPROCESSOR_CONSENT' } })))
        .map((n) => n.dedupeKey)
        .filter((k) => k.startsWith(`subprocessor-v${res.body.version}-`));

    for (const left of [14, 7, 1]) await consent.remind(new Date(effectiveFrom.getTime() - left * DAY));
    expect((await keys()).sort()).toEqual([`subprocessor-v${res.body.version}-published`, `subprocessor-v${res.body.version}-t-1`, `subprocessor-v${res.body.version}-t-14`, `subprocessor-v${res.body.version}-t-7`].sort());

    // ⭐ وتشغيلٌ ثانٍ لليوم نفسِه لا يُنتج إشعاراً ثانياً — والقيدُ الفريد هو الضمانة.
    const before = (await keys()).length;
    await consent.remind(new Date(effectiveFrom.getTime() - 7 * DAY));
    expect((await keys()).length).toBe(before);

    // وبعد السريان يتكرّر أسبوعياً ما دام لم يقبل.
    await consent.remind(new Date(effectiveFrom.getTime() + 7 * DAY));
    expect(await keys()).toContain(`subprocessor-v${res.body.version}-w+1`);
  }, 120000);
});
