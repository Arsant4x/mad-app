import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { CompaniesService } from '../src/companies/companies.service';
import { CompanyMovementService } from '../src/companies/company-movement.service';
import { FilesService } from '../src/files/files.service';
import { PersonalDataErasureService, REOPEN_WINDOW_DAYS } from '../src/deletion-requests/personal-data-erasure.service';
import { gunzipSync } from 'node:zlib';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { grantPlatformDecision, releaseSecondHand } from './platform-decision';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (73.2 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(220000);

/**
 * حذف الحساب بصيغة SaaS (قاعدة المالك 2026-08-07): التاجر لا يمسح بياناته
 * بنفسه أبداً — يقدّم طلباً، والدعم يراجعه وينفّذه.
 *
 * What must hold: only the owner files it, one open request at a time, the
 * merchant can withdraw before a decision, support sees every tenant's
 * requests, rejection keeps the account alive — and approval actually deletes
 * the company, login and all.
 */
describe('Account deletion requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let templateId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanupCompanyIds: string[] = [];
  /** كلُّ منشأةٍ صُنعت هنا — فطلباتُها تبقى بعد حذفها عمداً (`ق-٥٣٧`) وتُنظَّف من حيث بقيت. */
  const madeCompanyIds: string[] = [];

  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  /**
   * **الفعلُ الحرج بيدين** (`ق-١٣١٨` · ⑪A1): إغلاقُ حسابٍ أو محوُه لا يمضي بيدٍ واحدة —
   * فيُطلب القرارُ بيد الحزمة **ويُقرّه ثانٍ**، ثم يُعاد مسارُ الإقرار.
   *
   * ⚠️ **وإعادةُ الفتح لا تمرّ به** — فعلٌ يُعيد لا يُتلف، فلا قرارَ لها.
   */
  const approvePath = async (id: string) => {
    await grantPlatformDecision(app, 'ACCOUNT_ERASURE', id, adminToken);
    return `/admin/deletion-requests/${id}/approve`;
  };

  let seq = 0;
  async function makeCompany(): Promise<{ id: string; token: string; username: string }> {
    const username = `del-co-${suffix}-${seq++}`;
    const res = await admin(request(app.getHttpServer()).post('/companies'))
      .send({ username, password: 'DelPass123!', orgName: `منشأة حذف ${username}`, permissionTemplateId: templateId, subEnd: '2030-01-01' })
      .expect(201);
    cleanupCompanyIds.push(res.body.id);
    madeCompanyIds.push(res.body.id);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'DelPass123!' });
    return { id: res.body.id, token: login.body.accessToken, username };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    // المرشّحُ العامّ كما في التشغيل — فالوجهُ الذي يُقاس هو ما يراه المستخدم لا ما يراه الاختبار.
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    adminToken = (
      await request(app.getHttpServer()).post('/auth/login').send({
        username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan',
        password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD,
      })
    ).body.accessToken;

    const templates = await admin(request(app.getHttpServer()).get('/templates')).expect(200);
    templateId = (templates.body as { id: string; isAllScreens: boolean }[]).find((t) => t.isAllScreens)!.id;
  }, 30000);

  afterAll(async () => {
    // مسارُ المنصّة المباشر حُذف (`ق-٥٤٨`) — التنظيفُ بالمسلك نفسه عبر هويّة الدخول.
    for (const id of cleanupCompanyIds) await hardDeleteCompanyForTest(prisma, id);
    // نُسخُ الإغلاق المرفوعة للمنشآت المصنوعة هنا — تُحذف من المخزن من حيث رُفعت.
    const files = app.get(FilesService);
    const archived = await prisma.accountDeletionRequest.findMany({ where: { companyId: { in: madeCompanyIds }, archiveProducedAt: { not: null } } });
    for (const row of archived) {
      for (const f of ((row.archiveManifest as { files?: { key: string }[] } | null)?.files ?? [])) await files.deleteArchiveObject(f.key).catch(() => undefined);
    }
    // الطلباتُ تبقى بعد حذف المنشأة عمداً (`ق-٥٣٧`) — فتُنظَّف من حيث بقيت؛ والجدولُ `ENABLE` لا `FORCE` فالمالكُ يراها بلا سياق.
    await prisma.accountDeletionRequest.deleteMany({ where: { companyId: { in: madeCompanyIds } } });
    // اليدُ الثانية وقراراتُها من صنع الحزمة — تُزال معها (`ق-١٣١٨`).
    await releaseSecondHand(app);
    await app.close();
  });

  it('files, follows, and withdraws — one open request at a time', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);

    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'انتقال لنظام آخر' }).expect(201);
    expect(filed.body.status).toBe('PENDING');

    // A second open request is refused.
    await auth(request(app.getHttpServer()).post('/deletion-request')).send({}).expect(409);

    const mine = await auth(request(app.getHttpServer()).get('/deletion-request')).expect(200);
    expect(mine.body.id).toBe(filed.body.id);

    const cancelled = await auth(request(app.getHttpServer()).post(`/deletion-request/${filed.body.id}/cancel`)).expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    // After withdrawing, a fresh request is allowed again.
    await auth(request(app.getHttpServer()).post('/deletion-request')).send({}).expect(201);
  }, 60000);

  it('rejection keeps the account alive and records the note', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'تجربة' }).expect(201);

    const list = await admin(request(app.getHttpServer()).get('/admin/deletion-requests')).expect(200);
    expect((list.body as { id: string }[]).some((r) => r.id === filed.body.id)).toBe(true);

    const rejected = await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/reject`)).send({ note: 'تواصلنا معك هاتفياً' }).expect(201);
    expect(rejected.body.status).toBe('REJECTED');
    expect(rejected.body.decidedNote).toBe('تواصلنا معك هاتفياً');
    // ومن قرّر مكتوبٌ على القرار (`ق-٥٣٧`).
    expect(rejected.body.decidedByName).toBe(process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan');

    // The account still works.
    await auth(request(app.getHttpServer()).get('/customers')).expect(200);
  }, 60000);

  /**
   * 🔴 **ولا يمضي بيدٍ واحدة** (`ق-١٣١٨` · ⑪A1): الموافقةُ **بلا قرارٍ أقرّه مديرٌ آخر** تُردّ.
   *
   * ⚠️ **وهذه الحالةُ كشفها الإثباتُ العكسيّ**: حذفُ الفحص المسبق لم يُسقط شيئاً، **لأن كلَّ
   * حالةٍ كانت تمنح القرارَ أوّلاً** — فالحارسُ لم يكن مُختبَراً حيث يعمل: **حين لا قرارَ أصلاً**.
   */
  it('🔴 الإغلاقُ لا يمضي بلا قرارٍ من يدٍ ثانية — والرفضُ يقول ما ينقص', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'بلا قرار' }).expect(201);

    const refused = await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'محاولةٌ بيدٍ واحدة' }).expect(409);
    expect(String(refused.body.message)).toContain('مدير منصّة آخر');

    // ولم يقع شيء: الطلبُ معلّقٌ والحسابُ يعمل.
    const still = await auth(request(app.getHttpServer()).get('/deletion-request')).expect(200);
    expect(still.body.status).toBe('PENDING');
    await auth(request(app.getHttpServer()).get('/customers')).expect(200);
  }, 60000);

  /**
   * ⚖️ **النسخةُ قبل أيّ شيء** (`ق-٥٥٤`): منشأةٌ بلا حركةٍ كانت تُحذف عند الموافقة — **وذاك محوٌ
   * قبل أن ينال صاحبُه نسختَه**. فصارت الموافقةُ تُنتج النسخةَ أولاً ثم تُغلق، ويُرجأ الحذفُ
   * الصلبُ إلى انقضاء نافذة النسخة (الطبقةُ الثالثة — `ق-٥٥٦`).
   */
  it('⚖️ approval produces the full copy first, then closes — hard deletion is deferred to the copy window', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);

    const executed = await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'نُفِّذ بعد التأكد' }).expect(201);
    expect(executed.body.executed).toBe(true);
    expect(executed.body.outcome).toBe('CLOSED');
    expect(executed.body.movement).toEqual([]);
    expect(executed.body.archive.files).toBeGreaterThanOrEqual(3);

    // لا حذفَ: المنشأةُ باقيةٌ مغلقةً، وأجلُها نافذةُ النسخة لا مددُ الحفظ (لا حركة).
    const company = await prisma.company.findUnique({ where: { id: co.id } });
    expect(company?.status).toBe('CLOSED');
    expect(company!.retainUntil!.getTime() - company!.closedAt!.getTime()).toBe(90 * 24 * 3600 * 1000);
    const row = await prisma.accountDeletionRequest.findUnique({ where: { id: filed.body.id } });
    expect(row?.archiveProducedAt).toBeTruthy();
    expect(row?.archiveExpiresAt?.getTime()).toBe(company!.retainUntil!.getTime());
    // والدخولُ باقٍ — إلى شاشة المغلق ونسختها.
    await request(app.getHttpServer()).post('/auth/login').send({ username: co.username, password: 'DelPass123!' }).expect(200);
    // ولوحةُ المنصّة ما زالت تراها — مغلقةً لا محذوفة.
    const companies = await admin(request(app.getHttpServer()).get('/companies')).expect(200);
    expect((companies.body as { id: string; status: string }[]).find((c) => c.id === co.id)?.status).toBe('CLOSED');
  }, 60000);

  /**
   * ⭐ **طُعمٌ دائم** (`ق-٥٣٦`): لو سبق الإغلاقُ النسخةَ يوماً — بإعادة ترتيبٍ أو بتغاضٍ عن سقوط
   * الرفع — سقطت هذه الحالة. المخزنُ يُعطَّل داخل الاختبار، فلا يُغلق شيء ولا يُمسّ الطلب.
   */
  it('⭐ when the copy cannot be produced, nothing closes: 503, the request stays PENDING and the company ACTIVE', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);

    const files = app.get(FilesService);
    const original = files.putObject.bind(files);
    files.putObject = async () => {
      throw new Error('storage down (test bait)');
    };
    try {
      const refused = await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'محاولة' }).expect(503);
      expect(refused.body.message).toContain('لا يُغلق الحساب ولا يُمحى شيءٌ قبلها');
    } finally {
      files.putObject = original;
    }
    expect((await prisma.accountDeletionRequest.findUnique({ where: { id: filed.body.id } }))?.status).toBe('PENDING');
    expect((await prisma.company.findUnique({ where: { id: co.id } }))?.status).toBe('ACTIVE');
    await auth(request(app.getHttpServer()).get('/customers')).expect(200);
  }, 60000);

  /**
   * 🔴 **إذنُ الدعم وسجلُّه يبقيان بعد حذف المنشأة** (`ق-٥٣١`).
   *
   * **الحذفُ صلب** — مقيس: مساران (`DELETE /companies/:id` وموافقةُ طلب الحذف)
   * ومسلكٌ واحد (حذفُ هويّة الدخول ← `Cascade` على ٦٩ علاقة). **وكان إذنُ الدعم
   * وسجلُّه بينها**: أثرُ دخول المعالج إلى بيانات جهة التحكم — الذي يلزمه النظامُ
   * (م٨ · م٣١) — **يُمحى في أسوأ وقتٍ ممكن** (`ق-٨٠`). فلا مفتاحَ أجنبيَّ إلى
   * المنشأة، والاسمُ محفوظٌ على الإذن.
   */
  it('🔴 support consent and its access log survive the company deletion', async () => {
    prisma = app.get(PrismaService);
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);

    // إذنٌ يُطلب ويُوافَق عليه ويُستعمل مرّةً — فيقوم سطرٌ في السجل.
    const grant = await admin(request(app.getHttpServer()).post('/support-access/admin'))
      .send({ companyId: co.id, reason: `فحص قبل الحذف ${suffix}`, durationMinutes: 30, screens: ['customers'] })
      .expect(201);
    await auth(request(app.getHttpServer()).post(`/support-access/${grant.body.id}/approve`)).expect(201);
    await admin(request(app.getHttpServer()).get('/customers')).set('X-Support-Company', co.id).expect(200);

    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);
    await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'نُفِّذ' }).expect(201);
    // الموافقةُ تُنتج النسخةَ وتُغلق (`ق-٥٥٤`)؛ والحذفُ الصلبُ يقع بعد الأجل بالمسلك نفسه (`ق-٥٥٦`) — يُستدعى هنا مباشرةً ليُقاس البقاءُ بعده.
    await app.get(CompaniesService).remove(co.id);
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(co.id), 1);
    expect(await prisma.company.findUnique({ where: { id: co.id } })).toBeNull();

    // ⭐ والإذنُ باقٍ باسم المنشأة، والسطرُ باقٍ تحته — ولوحةُ المطوّر ما زالت تراه مسمّىً.
    const kept = await prisma.supportAccessGrant.findUnique({ where: { id: grant.body.id }, include: { logs: true } });
    expect(kept).toBeTruthy();
    expect(kept!.companyName).toContain('منشأة حذف');
    expect(kept!.logs.some((l) => l.path === '/customers')).toBe(true);
    const listed = await admin(request(app.getHttpServer()).get('/support-access/admin')).expect(200);
    expect((listed.body as { id: string; companyName: string }[]).find((g) => g.id === grant.body.id)?.companyName).toContain('منشأة حذف');

    // تنظيفُ ما بقي عمداً — من حيث بقي.
    await prisma.supportAccessLog.deleteMany({ where: { grantId: grant.body.id } });
    await prisma.supportAccessGrant.delete({ where: { id: grant.body.id } });
  }, 60000);

  /**
   * 🔴 **سجلُّ التدقيق يبقى بعد حذف المنشأة** (`ق-٨٠` · `ق-٥٣٥`).
   *
   * **كان `Cascade`**: أثرُ آخر عمليةٍ قبل الحذف — «من فعل ماذا» — **يُمحى مع
   * الحذف نفسه، في أسوأ توقيتٍ ممكن**. وقد بُني بقاءُ سجلّ الدعم قبل هذا
   * (`ق-٥٣١`) **فكانت قاعدتين حيث أردنا واحدة** (`ق-٢٧٨`).
   *
   * والجدولُ تحت `FORCE` — فيُقرأ تحت سياق المنشأة الزائلة: **المعرّفُ في السياسة
   * نصٌّ، والصفُّ الذي زال لا يمنع القراءةَ به**.
   */
  it('🔴 the audit trail survives the company deletion — the last act before deletion stays recorded', async () => {
    prisma = app.get(PrismaService);
    const tenantPrisma = app.get(TenantPrismaService);
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);

    // فعلٌ مُدقَّق قبل الحذف — إنشاءُ عميل يمرّ بالمعترض العامّ.
    await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميلٌ قبل الحذف ${suffix}` }).expect(201);
    // ⚠️ كتابةُ التدقيق لا تُنتظَر في الطلب (`AuditInterceptor` يسجّل ولا يُبطئ الردّ) —
    //    فيُستطلَع السطرُ حتى يهبط، كما في `audit-log.e2e`؛ وأوّلُ صياغةٍ عدّت فوراً فوجدت صفراً.
    const countAudit = () => tenantPrisma.runInTenantContext(co.id, (tx) => tx.auditLog.count());
    const deadline = Date.now() + 5000;
    let before = await countAudit();
    while (before === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      before = await countAudit();
    }
    expect(before).toBeGreaterThan(0);

    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);
    await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'نُفِّذ' }).expect(201);
    // الموافقةُ تُغلق بعد النسخة (`ق-٥٥٤`)؛ والحذفُ الصلبُ بعد الأجل بالمسلك نفسه (`ق-٥٥٦`) — يُستدعى هنا ليُقاس البقاءُ بعده.
    await app.get(CompaniesService).remove(co.id);
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(co.id), 1);
    expect(await prisma.company.findUnique({ where: { id: co.id } })).toBeNull();

    // ⭐ والأثرُ باقٍ بعد زوال المنشأة — **بمفتاحه لا بعدّه وحده**: فطلبُ الحذف نفسُه فعلٌ
    //    مُدقَّق يزيد العدّ (أوّلُ صياغةٍ ساوت العدّين فسقطت بـ`2 ≠ 1`)، والمقصودُ أن
    //    آخرَ ما فعله التاجر قبل الحذف — إنشاءُ العميل — ما زال مكتوباً.
    const kept = await tenantPrisma.runInTenantContext(co.id, (tx) => tx.auditLog.findMany({ select: { entity: true, action: true } }));
    expect(kept.length).toBeGreaterThanOrEqual(before);
    expect(kept.some((r) => r.entity === 'customers' && r.action === 'add')).toBe(true);

    // تنظيفُ ما بقي عمداً — من حيث بقي.
    await tenantPrisma.runInTenantContext(co.id, (tx) => tx.auditLog.deleteMany({}));
  }, 60000);

  /**
   * 🔴 **طلبُ الحذف وقرارُه يبقيان بعد حذف المنشأة** (`ق-٥٣٧`).
   *
   * **كان `Cascade`**: الصفُّ الذي يشهد على قرار الإعدام — من طلب، ومن أذن، ومتى،
   * وبأيّ ملاحظة — **يزول مع المنشأة نفسِها**، فلا يبقى إلا سطرُ تحذيرٍ في سجلّ خادم.
   * وهو أثقلُ من بقاء سجلّ الدعم (`ق-٥٣١`) والتدقيق (`ق-٥٣٥`): ذانك يشهدان على ما
   * جرى داخل المنشأة، **وهذا يشهد على قرار إعدامها**.
   *
   * والجدولُ `ENABLE` لا `FORCE` (استثناءٌ أبيض معلَن) — فيُقرأ بلا سياق كما تقرأه لوحةُ المنصّة.
   */
  it('🔴 the deletion request and its decision survive the company deletion — «من أذن؟» stays answerable', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);
    // الاسمُ يُحفظ على الطلب وقتَ تقديمه.
    expect(filed.body.companyName).toContain('منشأة حذف');

    await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'نُفِّذ بعد التأكد' }).expect(201);
    // الموافقةُ تُغلق بعد النسخة (`ق-٥٥٤`)؛ والحذفُ الصلبُ بعد الأجل بالمسلك نفسه (`ق-٥٥٦`) — يُستدعى هنا ليُقاس البقاءُ بعده.
    await app.get(CompaniesService).remove(co.id);
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(co.id), 1);
    expect(await prisma.company.findUnique({ where: { id: co.id } })).toBeNull();

    // ⭐ والصفُّ باقٍ بعد زوال المنشأة — بحالته وقراره **ومن قرّر** — وبنسخته.
    const kept = await prisma.accountDeletionRequest.findUnique({ where: { id: filed.body.id } });
    expect(kept).toBeTruthy();
    expect(kept!.status).toBe('APPROVED');
    expect(kept!.archiveProducedAt).toBeTruthy();
    expect(kept!.companyId).toBe(co.id);
    expect(kept!.companyName).toContain('منشأة حذف');
    expect(kept!.decidedNote).toBe('نُفِّذ بعد التأكد');
    expect(kept!.decidedAt).toBeTruthy();
    expect(kept!.decidedByName).toBe(process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan');
    expect(kept!.decidedById).toBeTruthy();

    // ولوحةُ المنصّة ما زالت تراه مسمّىً وبمن قرّر.
    const listed = await admin(request(app.getHttpServer()).get('/admin/deletion-requests')).expect(200);
    const row = (listed.body as { id: string; companyName: string; decidedByName: string | null }[]).find((r) => r.id === filed.body.id);
    expect(row?.companyName).toContain('منشأة حذف');
    expect(row?.decidedByName).toBeTruthy();
  }, 60000);

  /**
   * 🔴 **الوسمُ والتنفيذُ يسقطان معاً** (`ق-٥٤١`).
   *
   * كان الطلبُ يُوسَم «مُوافَقاً» **قبل** التنفيذ، فإذا رفضت القاعدةُ الحذفَ — سجلٌّ لا
   * يُحذف بحال يشير إلى المنشأة (`Restrict` · `ق-١١٠`) — بقي «مُوافَقاً» والمنشأةُ حيّة:
   * لا إعادةَ (`409`) ولا سحبَ (`409`)، **والتاجرُ يقرأ «نُفِّذ» كذباً** (مقيسٌ في `ق-٥٣٨`).
   * والوجهُ كان `500` بلا اسم — **والرفضُ يسمّي المانعَ** (`ق-٢٦٥`).
   */
  it('🔴 a company with a task is closed, not deleted — the record names the movement, and the direct platform path is gone', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);

    // مهمّةٌ واحدة تكفي — سطرُها في السجل لا يُحذف بحال.
    const tpl = await auth(request(app.getHttpServer()).post('/templates'))
      .send({ name: `كاتب-${suffix}`, isAllScreens: false, allowedScreens: ['dashboard'], screenActions: { dashboard: ['view'] } })
      .expect(201);
    const clerk = await auth(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'كاتب', username: `del-clerk-${suffix}`, password: 'DelPass123!', permissionTemplateId: tpl.body.id })
      .expect(201);
    await auth(request(app.getHttpServer()).post('/tasks'))
      .send({ title: 'مهمّة قبل الحذف', assigneeId: clerk.body.id, assigneeKind: 'USER', targetScreen: 'contracts', targetId: 'c-1' })
      .expect(201);

    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);
    // ⚖️ ما ترفض القاعدةُ حذفَه حركةٌ من الصنف الأوّل (`ق-٥٤٦`) — فالموافقةُ تُغلق لا تحذف، **بلا 409 ولا 500**.
    const approved = await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'لها سجلّات' }).expect(201);
    expect(approved.body.outcome).toBe('CLOSED');
    expect(approved.body.movement.join(' ')).toMatch(/سجلّ المهام|مهامّ/);

    // ⭐ والطلبُ صادق: مُوافَقٌ ووقع الإغلاقُ فعلاً — والمنشأةُ حيّةٌ مغلقة، والحركةُ مكتوبةٌ على القرار.
    const kept = await prisma.accountDeletionRequest.findUnique({ where: { id: filed.body.id } });
    expect(kept!.status).toBe('APPROVED');
    expect(kept!.outcome).toBe('CLOSED');
    expect(kept!.movement.join(' ')).toMatch(/سجلّ المهام|مهامّ/);
    expect(kept!.decidedByName).toBe(process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan');
    const company = await prisma.company.findUnique({ where: { id: co.id } });
    expect(company?.status).toBe('CLOSED');
    expect(company?.closedAt).toBeTruthy();

    // ⛔ ولا مسارَ مباشراً للمنصّة (`ق-٥٤٨`): الطريقُ الذي كان يحذف لم يعد موجوداً.
    await admin(request(app.getHttpServer()).delete(`/companies/${co.id}`)).expect(404);

    // ⚠️ المنشأةُ تبقى على القاعدة عمداً — مهامُّها لا تُحذف (`ق-١١٠`) — فتُسقط من التنظيف.
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(co.id), 1);
  }, 60000);

  /**
   * ⚖️ **المنشأةُ ذاتُ الحركة تُغلَق لا تُحذف — ثم تُفتح بطلبٍ وقرار** (`ق-٥٤٢` · `ق-٥٤٦` · `ق-٥٤٧` · `ق-٥٤٨`).
   *
   * الحركةُ هنا **عرضُ سعرٍ واحد** — **الجدولُ الخامس** الذي أوقع الأمرَ الأضيق (`ق-٥٤٥`): لا مهمّةٌ
   * ولا تفويضٌ ولا فاتورةٌ ولا قيد، وقد كان يُحذف. فتُغلَق: الدخولُ يُقطع برسالةٍ تحمل أجلَ
   * الحفظ الأدنى، والبياناتُ تبقى، والطلبُ يحمل ما وقع والحركةَ ومن قرّر — **وتعود بطلبٍ وقرار**.
   *
   * ⚠️ **والمعيارُ يُقرأ تحت سياق المنشأة**: الجدولُ تحت `FORCE`، فالعدُّ بلا سياقٍ صفرٌ بلا
   * خطأ (`ق-٢٦٢`) — **ويُثبَت هنا أن الصفرَ بلا سياقٍ عمىً والوجودَ تحت السياق حقيقة**.
   */
  it('⚖️ a company with one quote is closed, not deleted — the message carries the deadline, and reopening is by request and recorded decision', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const customer = await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل عرض ${suffix}` }).expect(201);
    const today = new Date().toISOString().slice(0, 10);
    const inTwoWeeks = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await auth(request(app.getHttpServer()).post('/quotes'))
      .send({ customerId: customer.body.id, issueDate: today, validUntil: inTwoWeeks, lines: [{ description: `تصميم ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);

    // ⓪ المجسُّ: بلا سياقٍ صفرٌ (عمى) — وتحت السياق واحدٌ (حقيقة) — فالمعيارُ يقرأ تحت السياق.
    expect(await prisma.quote.count({ where: { companyId: co.id } })).toBe(0);
    const report = await app.get(CompanyMovementService).describe(co.id);
    expect(report.hasMovement).toBe(true);
    expect(report.labels).toEqual(['عروض أسعار']);

    // ① المعاينةُ قبل الضغطة تقول الحقيقة.
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);
    const worklist = await admin(request(app.getHttpServer()).get('/admin/deletion-requests')).expect(200);
    const listed = (worklist.body as { id: string; preview?: { outcome: string; movement: string[] } }[]).find((r) => r.id === filed.body.id);
    expect(listed?.preview).toEqual({ outcome: 'CLOSE', movement: ['عروض أسعار'] });

    // ② الموافقةُ تُنتج النسخةَ ثم تُغلق — وأجلُ الحفظ عشرُ سنواتٍ من الإغلاق (لا عقار).
    const approved = await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'أُغلق' }).expect(201);
    expect(approved.body.outcome).toBe('CLOSED');
    const thisYear = new Date().getUTCFullYear();
    expect(approved.body.archive.years).toContain(thisYear);
    const company = await prisma.company.findUnique({ where: { id: co.id } });
    expect(company?.status).toBe('CLOSED');
    // بسنة UTC كما قُرئ `thisYear` أعلاه لا بسنة منطقة العملية (`ق-١١٩٠`) — والفرقُ عشرٌ في أي إطار،
    // لأن `retentionDeadline` تحسب السنواتِ في الإطار نفسِه (`setFullYear(getFullYear() + n)` — مستثنًى بشكله).
    expect(company?.retainUntil?.getUTCFullYear()).toBe(company!.closedAt!.getUTCFullYear() + 10);
    // ⚖️ مدّةُ الإتاحة = مدّةُ الحفظ (`ق-٥٥٨/ج`) — لا تسعين: ما دمنا نحفظ يصل التاجرُ نسختَه.
    expect((await prisma.accountDeletionRequest.findUnique({ where: { id: filed.body.id } }))?.archiveExpiresAt).toEqual(company!.retainUntil);

    // ⭐ النسخةُ حقيقيةٌ لا بيان: الملفُّ السنويُّ يُنزَّل من رابطه الموقَّع ويُفكّ ويُقرأ فيه عرضُ السعر.
    const archive = await request(app.getHttpServer()).get('/deletion-request/archive').set('Authorization', `Bearer ${(await request(app.getHttpServer()).post('/auth/login').send({ username: co.username, password: 'DelPass123!' })).body.accessToken}`).expect(200);
    const names = (archive.body.files as { name: string }[]).map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['README.md', 'manifest.json', 'master-data.json.gz', `years/${thisYear}.json.gz`]));
    const yearFile = (archive.body.files as { name: string; url: string; sha256: string }[]).find((f) => f.name === `years/${thisYear}.json.gz`)!;
    const downloaded = Buffer.from(await (await fetch(yearFile.url)).arrayBuffer());
    const year = JSON.parse(gunzipSync(downloaded).toString('utf8')) as Record<string, { customerId?: string }[]>;
    expect(year.quote).toHaveLength(1);
    expect(year.quote[0].customerId).toBe(customer.body.id);
    const masterFile = (archive.body.files as { name: string; url: string }[]).find((f) => f.name === 'master-data.json.gz')!;
    const master = JSON.parse(gunzipSync(Buffer.from(await (await fetch(masterFile.url)).arrayBuffer())).toString('utf8')) as Record<string, { id: string }[]>;
    expect(master.customer.some((c) => c.id === customer.body.id)).toBe(true);
    // والحدودُ تُقال في `README` نفسِه (`ق-٥٥٨/ب` · `ق-٥٦٠`): لا عرضَ بشريٌّ للجداول، والإتلافُ يكتمل بدوران النسخ.
    const readmeFile = (archive.body.files as { name: string; url: string }[]).find((f) => f.name === 'README.md')!;
    const readme = await (await fetch(readmeFile.url)).text();
    expect(readme).toContain('لا عرضَ بشريٌّ للجداول');
    expect(readme).toContain('من دوران النسخ الاحتياطية');

    // ③ الدخولُ مقطوع — والرسالةُ تجيب «وأين بياناتي؟» وبأجل — والتاجرُ يقرأ حالَه وحالَ طلبه.
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: co.username, password: 'DelPass123!' }).expect(200);
    expect(login.body.user.status).toBe('CLOSED');
    const closedToken = login.body.accessToken as string;
    const blocked = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${closedToken}`).expect(403);
    expect(blocked.body.code).toBe('ACCOUNT_CLOSED');
    expect(blocked.body.message).toContain('محفوظةٌ بمدد الحفظ النظامية حتى');
    expect(blocked.body.message).toContain(company!.retainUntil!.toISOString().slice(0, 10));
    // ودورةُ النسخ تُعلَن في الرسالة لا تُخفى (`ق-٥٦٠`).
    expect(blocked.body.message).toContain('أربعةَ عشرَ يوماً من دوران النسخ الاحتياطية');
    await request(app.getHttpServer()).post('/subscription/renew').set('Authorization', `Bearer ${closedToken}`).send({ months: 1 }).expect(403);
    const account = await request(app.getHttpServer()).get('/deletion-request/account').set('Authorization', `Bearer ${closedToken}`).expect(200);
    expect(account.body.status).toBe('CLOSED');
    const mine = await request(app.getHttpServer()).get('/deletion-request').set('Authorization', `Bearer ${closedToken}`).expect(200);
    expect(mine.body.outcome).toBe('CLOSED');
    // ولا طلبَ حذفٍ ثانياً وهو مغلق — الوصولُ مقطوعٌ قبل الخدمة (403 بالرمز)، والخدمةُ خلفه دفاعٌ ثانٍ (409).
    const again = await request(app.getHttpServer()).post('/deletion-request').set('Authorization', `Bearer ${closedToken}`).send({}).expect(403);
    expect(again.body.code).toBe('ACCOUNT_CLOSED');

    // ④ إعادةُ الفتح: بطلبٍ من التاجر، وقرارٍ يحمل اسمَ من قرّر — ثم يعود الدخول.
    const reopen = await request(app.getHttpServer()).post('/deletion-request/reopen').set('Authorization', `Bearer ${closedToken}`).expect(201);
    expect(reopen.body.kind).toBe('REOPENING');
    expect(reopen.body.status).toBe('PENDING');
    const reopened = await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${reopen.body.id}/approve`)).send({ note: 'عاد' }).expect(201);
    expect(reopened.body.outcome).toBe('REOPENED');
    const trail = await prisma.accountDeletionRequest.findUnique({ where: { id: reopen.body.id } });
    expect(trail?.outcome).toBe('REOPENED');
    expect(trail?.decidedByName).toBe(process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan');
    expect((await prisma.company.findUnique({ where: { id: co.id } }))?.status).toBe('ACTIVE');
    await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${closedToken}`).expect(200);
    await request(app.getHttpServer()).post('/deletion-request/reopen').set('Authorization', `Bearer ${closedToken}`).expect(409);
  }, 90000);

  /** يُغلق حساباً بطلبٍ وموافقة، ويعيد رمزَ دخوله المغلق. */
  async function closeCompany(co: { id: string; token: string; username: string }): Promise<string> {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);
    await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'أُغلق' }).expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: co.username, password: 'DelPass123!' }).expect(200);
    expect(login.body.user.status).toBe('CLOSED');
    return login.body.accessToken as string;
  }

  /**
   * ⚖️ **الإتلافُ حقٌّ يُطلب** (`ق-٥٥٩/ب` — م٤/٥): صاحبُ الحساب المغلق يطلب محوَ غير الملزِم الآن،
   * فيُقرَّر باسم من قرّر ويُنفَّذ: **الهواتفُ تُمحى والأسماءُ تبقى** — فالفاتورةُ تشترط الاسمَ
   * والعنوانَ لا الهاتف (م٥٣). **والوسمُ بعد التنفيذ** (`ق-٥٤١`)، **وما مُحي لا يعود**: نافذةُ
   * العودة تُغلق بالمحو ولو لم ينقضِ أجلُها — ويُقال ذلك في الرفض بتاريخه.
   */
  it('⚖️ explicit erasure: phones go, names stay, the act is audited — and reopening is refused afterwards', async () => {
    const tenantPrisma = app.get(TenantPrismaService);
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    // وهو نشطٌ لا إتلافَ — الطلبُ لحسابٍ مغلقٍ فقط.
    await auth(request(app.getHttpServer()).post('/deletion-request/erase')).expect(409);

    const customer = await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل هاتف ${suffix}`, phone: '0500000001' }).expect(201);
    await prisma.company.update({ where: { id: co.id }, data: { phone: '0112223344', email: `owner-${suffix}@example.test`, address: 'الرياض — حي الملقا' } });
    const closedToken = await closeCompany(co);
    const closed = (r: request.Test) => r.set('Authorization', `Bearer ${closedToken}`);

    const filed = await closed(request(app.getHttpServer()).post('/deletion-request/erase')).expect(201);
    expect(filed.body.kind).toBe('ERASURE');
    expect(filed.body.status).toBe('PENDING');
    // ولا طلبَ ثانياً وهذا معلّق.
    await closed(request(app.getHttpServer()).post('/deletion-request/reopen')).expect(409);

    const approved = await admin(request(app.getHttpServer()).post(await approvePath(filed.body.id))).send({ note: 'مُحي' }).expect(201);
    expect(approved.body.outcome).toBe('ERASED');
    expect(approved.body.erased['Customer.phone']).toBe(1);

    // ⭐ الهاتفُ مُحي والاسمُ باقٍ — يُقرأ تحت السياق (الجدولُ تحت `FORCE`).
    const kept = await tenantPrisma.runInTenantContext(co.id, (tx) => tx.customer.findUniqueOrThrow({ where: { id: customer.body.id } }));
    expect(kept.phone).toBeNull();
    expect(kept.name).toBe(`عميل هاتف ${suffix}`);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(company.phone).toBeNull();
    expect(company.email).toBeNull();
    expect(company.address).toBe('الرياض — حي الملقا');
    expect(company.erasedAt).toBeTruthy();
    expect(company.status).toBe('CLOSED');
    // والأثرُ مكتوبٌ باسم من قرّر وبسبب التأخير المكتوب.
    const audit = await tenantPrisma.runInTenantContext(co.id, (tx) => tx.auditLog.findFirst({ where: { action: 'erase' } }));
    expect(audit?.actorName).toBe(process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan');
    expect((audit?.details as { trigger: string }).trigger).toBe('REQUEST');
    const trail = await prisma.accountDeletionRequest.findUnique({ where: { id: filed.body.id } });
    expect(trail?.outcome).toBe('ERASED');
    expect(trail?.decidedByName).toBe(process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan');

    // ⚖️ ما مُحي لا يعود: الرفضُ يسمّي الأجل — ولا محوَ ثانياً.
    const refused = await closed(request(app.getHttpServer()).post('/deletion-request/reopen')).expect(409);
    expect(refused.body.message).toContain('انقضت نافذةُ إعادة الفتح');
    await closed(request(app.getHttpServer()).post('/deletion-request/erase')).expect(409);
    const account = await closed(request(app.getHttpServer()).get('/deletion-request/account')).expect(200);
    expect(account.body.erasedAt).toBeTruthy();
    expect(account.body.reopenUntil).toBeTruthy();
  }, 90000);

  /**
   * ⚖️ **والسياسةُ حين لا يطلب أحد** (`ق-٥٥٩/ج`): المسحُ اليوميّ يمحو غيرَ الملزِم بعد نافذة
   * العودة — **لا قبلها** — ويُتلف الحسابَ ونسختَه عند `retainUntil`؛ **وما ترفض القاعدةُ حذفَه
   * (سجلٌّ ملحق — `ق-١١٠`) يُعلَن تعذّرُه ولا يُلتفّ عليه**. الأزمنةُ تُدفع إلى الماضي على
   * صفوف هذا الاختبار وحدها — والساعةُ الحقيقية هي المقياس.
   */
  it('⚖️ the daily sweep erases after the window, not before; destroys at retainUntil; and declares what Restrict refuses', async () => {
    const tenantPrisma = app.get(TenantPrismaService);
    const sweeper = app.get(PersonalDataErasureService);
    const day = 24 * 3600 * 1000;

    // ① انقضت نافذتُها — يُمحى غيرُ الملزِم.
    const past = await makeCompany();
    const pastCustomer = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${past.token}`).send({ kind: 'NATURAL', name: `عميل ماضٍ ${suffix}`, phone: '0500000002' }).expect(201);
    await closeCompany(past);
    await prisma.company.update({ where: { id: past.id }, data: { closedAt: new Date(Date.now() - (REOPEN_WINDOW_DAYS + 1) * day) } });

    // ② أُغلقت أمس — تبقى كما هي.
    const fresh = await makeCompany();
    const freshCustomer = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${fresh.token}`).send({ kind: 'NATURAL', name: `عميل حديث ${suffix}`, phone: '0500000003' }).expect(201);
    await closeCompany(fresh);
    await prisma.company.update({ where: { id: fresh.id }, data: { closedAt: new Date(Date.now() - day) } });

    // ③ انقضى أجلُ حفظها — تُتلف هي ونسختُها.
    const expired = await makeCompany();
    const expiredToken = await closeCompany(expired);
    const archive = await request(app.getHttpServer()).get('/deletion-request/archive').set('Authorization', `Bearer ${expiredToken}`).expect(200);
    const yearUrl = (archive.body.files as { name: string; url: string }[]).find((f) => f.name === 'master-data.json.gz')!.url;
    expect((await fetch(yearUrl)).status).toBe(200);
    await prisma.company.update({ where: { id: expired.id }, data: { closedAt: new Date(Date.now() - 100 * day), retainUntil: new Date(Date.now() - day) } });

    // ④ انقضى أجلُها ولها مهمّة — القاعدةُ ترفض، والمسحُ يعلن.
    const kept = await makeCompany();
    const keptAuth = (r: request.Test) => r.set('Authorization', `Bearer ${kept.token}`);
    const tpl = await keptAuth(request(app.getHttpServer()).post('/templates'))
      .send({ name: `كاتب-محو-${suffix}`, isAllScreens: false, allowedScreens: ['dashboard'], screenActions: { dashboard: ['view'] } })
      .expect(201);
    const clerk = await keptAuth(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'كاتب', username: `erase-clerk-${suffix}`, password: 'DelPass123!', permissionTemplateId: tpl.body.id })
      .expect(201);
    await keptAuth(request(app.getHttpServer()).post('/tasks')).send({ title: 'مهمّة باقية', assigneeId: clerk.body.id, assigneeKind: 'USER', targetScreen: 'contracts', targetId: 'c-2' }).expect(201);
    await closeCompany(kept);
    await prisma.company.update({ where: { id: kept.id }, data: { closedAt: new Date(Date.now() - 100 * day), retainUntil: new Date(Date.now() - day) } });

    const result = await sweeper.sweep();

    // ① مُحي — والاسمُ باقٍ، والأثرُ باسم المحو الآليّ وبسببه.
    expect(result.erased).toContain(past.id);
    const pastKept = await tenantPrisma.runInTenantContext(past.id, (tx) => tx.customer.findUniqueOrThrow({ where: { id: pastCustomer.body.id } }));
    expect(pastKept.phone).toBeNull();
    expect(pastKept.name).toBe(`عميل ماضٍ ${suffix}`);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: past.id } })).erasedAt).toBeTruthy();
    const audit = await tenantPrisma.runInTenantContext(past.id, (tx) => tx.auditLog.findFirst({ where: { action: 'erase' } }));
    expect(audit?.actorType).toBe('SYSTEM');
    expect((audit?.details as { deferralReason: string }).deferralReason).toContain('لأن الغرض — إمكانُ العودة — لم ينتهِ بعد');

    // ② لم يُمسّ.
    expect(result.erased).not.toContain(fresh.id);
    const freshKept = await tenantPrisma.runInTenantContext(fresh.id, (tx) => tx.customer.findUniqueOrThrow({ where: { id: freshCustomer.body.id } }));
    expect(freshKept.phone).toBe('0500000003');
    expect((await prisma.company.findUniqueOrThrow({ where: { id: fresh.id } })).erasedAt).toBeNull();

    // ③ أُتلفت هي ونسختُها — والطلبُ باقٍ يشهد (`ق-٥٣٧`).
    expect(result.deleted).toContain(expired.id);
    expect(await prisma.company.findUnique({ where: { id: expired.id } })).toBeNull();
    expect((await fetch(yearUrl)).status).toBe(404);
    expect(await prisma.accountDeletionRequest.count({ where: { companyId: expired.id, outcome: 'CLOSED' } })).toBe(1);
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(expired.id), 1);

    // ④ مُعلَنٌ تعذّرُها — باقيةٌ مغلقةً بسجلّها، وغيرُ الملزِم فيها مُحي.
    expect(result.blocked).toContain(kept.id);
    const blocked = await prisma.company.findUniqueOrThrow({ where: { id: kept.id } });
    expect(blocked.status).toBe('CLOSED');
    expect(blocked.erasedAt).toBeTruthy();
    // ⚠️ تبقى على القاعدة عمداً — مهامُّها لا تُحذف (`ق-١١٠`) — فتُسقط من التنظيف.
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(kept.id), 1);
  }, 120000);

  it('an ordinary tenant can never reach the support endpoints', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    await auth(request(app.getHttpServer()).get('/admin/deletion-requests')).expect(403);
    await auth(request(app.getHttpServer()).post('/admin/deletion-requests/whatever/approve')).expect(403);
  }, 60000);
});
