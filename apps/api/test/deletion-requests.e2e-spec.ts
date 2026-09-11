import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { CompanyMovementService } from '../src/companies/company-movement.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

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
    // الطلباتُ تبقى بعد حذف المنشأة عمداً (`ق-٥٣٧`) — فتُنظَّف من حيث بقيت؛ والجدولُ `ENABLE` لا `FORCE` فالمالكُ يراها بلا سياق.
    await prisma.accountDeletionRequest.deleteMany({ where: { companyId: { in: madeCompanyIds } } });
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

  it('approval executes: the company is gone, login and all', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);

    const executed = await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'نُفِّذ بعد التأكد' }).expect(201);
    expect(executed.body.executed).toBe(true);
    expect(executed.body.companyId).toBe(co.id);

    // Login is dead — the account really is gone.
    await request(app.getHttpServer()).post('/auth/login').send({ username: co.username, password: 'DelPass123!' }).expect(401);
    // And it no longer appears in the companies list.
    const companies = await admin(request(app.getHttpServer()).get('/companies')).expect(200);
    expect((companies.body as { id: string }[]).some((c) => c.id === co.id)).toBe(false);
    // Drop from cleanup — already deleted.
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(co.id), 1);
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
    await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'نُفِّذ' }).expect(201);
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
    await auth(request(app.getHttpServer()).post('/customers')).send({ name: `عميلٌ قبل الحذف ${suffix}` }).expect(201);
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
    await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'نُفِّذ' }).expect(201);
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

    await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'نُفِّذ بعد التأكد' }).expect(201);
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(co.id), 1);
    expect(await prisma.company.findUnique({ where: { id: co.id } })).toBeNull();

    // ⭐ والصفُّ باقٍ بعد زوال المنشأة — بحالته وقراره **ومن قرّر**.
    const kept = await prisma.accountDeletionRequest.findUnique({ where: { id: filed.body.id } });
    expect(kept).toBeTruthy();
    expect(kept!.status).toBe('APPROVED');
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
      .send({ title: 'مهمّة قبل الحذف', assigneeId: clerk.body.id, targetScreen: 'contracts', targetId: 'c-1' })
      .expect(201);

    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);
    // ⚖️ ما ترفض القاعدةُ حذفَه حركةٌ من الصنف الأوّل (`ق-٥٤٦`) — فالموافقةُ تُغلق لا تحذف، **بلا 409 ولا 500**.
    const approved = await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'لها سجلّات' }).expect(201);
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
    const customer = await auth(request(app.getHttpServer()).post('/customers')).send({ name: `عميل عرض ${suffix}` }).expect(201);
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

    // ② الموافقةُ تُغلق — وأجلُ الحفظ عشرُ سنواتٍ من الإغلاق (لا عقار).
    const approved = await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'أُغلق' }).expect(201);
    expect(approved.body.outcome).toBe('CLOSED');
    const company = await prisma.company.findUnique({ where: { id: co.id } });
    expect(company?.status).toBe('CLOSED');
    expect(company?.retainUntil?.getFullYear()).toBe(company!.closedAt!.getFullYear() + 10);
    expect(await prisma.quote.count()).toBeGreaterThanOrEqual(0); // البياناتُ تبقى — لا حذف.

    // ③ الدخولُ مقطوع — والرسالةُ تجيب «وأين بياناتي؟» وبأجل — والتاجرُ يقرأ حالَه وحالَ طلبه.
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: co.username, password: 'DelPass123!' }).expect(200);
    expect(login.body.user.status).toBe('CLOSED');
    const closedToken = login.body.accessToken as string;
    const blocked = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${closedToken}`).expect(403);
    expect(blocked.body.code).toBe('ACCOUNT_CLOSED');
    expect(blocked.body.message).toContain('محفوظةٌ بمدد الحفظ النظامية حتى');
    expect(blocked.body.message).toContain(company!.retainUntil!.toISOString().slice(0, 10));
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

  it('an ordinary tenant can never reach the support endpoints', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    await auth(request(app.getHttpServer()).get('/admin/deletion-requests')).expect(403);
    await auth(request(app.getHttpServer()).post('/admin/deletion-requests/whatever/approve')).expect(403);
  }, 60000);
});
