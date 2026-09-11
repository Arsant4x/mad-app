import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';

/**
 * وضع الدعم الفني (احتياجات §1.10) — «بموافقتها الصريحة فقط، لمدة محددة،
 * مع سجل كامل تراه المنشأة»، كلّه مفروضاً تقنياً:
 * بلا موافقة لا دخول · الموافقة تفتح قراءةً فقط · كل طلب يُسجَّل بسبب
 * الدعم واسمه أمام المالك · المالك يقطع النافذة متى شاء · وانقضاء المدة
 * يميتها وحده.
 */
describe('Support mode (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let ownerToken: string;
  let companyId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let grantId: string;

  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const owner = (r: request.Test) => r.set('Authorization', `Bearer ${ownerToken}`);
  const support = (r: request.Test) => admin(r).set('X-Support-Company', companyId);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const devUsername = process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan';
    const devPassword = process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD;
    adminToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: devUsername, password: devPassword })).body.accessToken;
    ownerToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    companyId = (JSON.parse(Buffer.from(ownerToken.split('.')[1], 'base64').toString()) as { companyId: string }).companyId;
  }, 30000);

  afterAll(async () => {
    // تنظيف: سجلات وطلبات هذا الاختبار فقط (unscoped — نمط جانب المدير).
    await prisma.supportAccessLog.deleteMany({ where: { grant: { reason: { contains: suffix } } } });
    await prisma.supportAccessGrant.deleteMany({ where: { reason: { contains: suffix } } });
    await app.close();
  });

  it('[SPEC 1.10] no consent, no entry — with or without the header', async () => {
    await admin(request(app.getHttpServer()).get('/customers')).expect(401);
    await support(request(app.getHttpServer()).get('/customers')).expect(403);
  }, 30000);

  it('the admin requests; a duplicate is refused while one is pending', async () => {
    // ⛔ **إذنٌ بلا نطاقٍ ليس تعليمة** (`ق-٥٢٧`): الطلبُ بلا شاشاتٍ يُرفض قبل أن يصل المالك.
    await admin(request(app.getHttpServer()).post('/support-access/admin'))
      .send({ companyId, reason: `بلا نطاق ${suffix}`, durationMinutes: 30 })
      .expect(400);
    await admin(request(app.getHttpServer()).post('/support-access/admin'))
      .send({ companyId, reason: `شاشة مخترَعة ${suffix}`, durationMinutes: 30, screens: ['everything'] })
      .expect(400);

    const res = await admin(request(app.getHttpServer()).post('/support-access/admin'))
      .send({ companyId, reason: `فحص شكوى ترقيم ${suffix}`, durationMinutes: 30, screens: ['customers'] })
      .expect(201);
    grantId = res.body.id;
    expect(res.body.status).toBe('PENDING');
    expect(res.body.screens).toEqual(['customers']);

    await admin(request(app.getHttpServer()).post('/support-access/admin'))
      .send({ companyId, reason: `طلب ثانٍ ${suffix}`, durationMinutes: 30, screens: ['customers'] })
      .expect(409);

    // وما زال الدخول ممنوعاً — الطلب ليس موافقة.
    await support(request(app.getHttpServer()).get('/customers')).expect(403);
  }, 30000);

  it('[SPEC 1.10] the owner approves → read opens, writes stay closed', async () => {
    const pending = await owner(request(app.getHttpServer()).get('/support-access')).expect(200);
    const mine = (pending.body as { id: string; reason: string; screens: string[] }[]).find((g) => g.id === grantId);
    expect(mine?.reason).toContain(suffix);
    // ⭐ **المالكُ يرى النطاقَ في شاشة القرار قبل موافقته** — لا في السجل بعدها (شرطُ المالك، `ق-٥٢٧`).
    expect(mine?.screens).toEqual(['customers']);

    const approved = await owner(request(app.getHttpServer()).post(`/support-access/${grantId}/approve`)).expect(201);
    expect(approved.body.status).toBe('APPROVED');
    expect(new Date(approved.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    await support(request(app.getHttpServer()).get('/customers')).expect(200);
    await support(request(app.getHttpServer()).post('/customers')).send({ name: 'محاولة كتابة' }).expect(403);
  }, 30000);

  /**
   * 🔴 **النطاقُ يُنفَذ لا يُعرض فحسب** (`ق-٥٢٧`) — وهو «فئاتُ البيانات الشخصية
   * المعالجة» التي توجب اللائحةُ التنفيذية (م١٧/١/ب) أن يتضمّنها اتفاقُ
   * المعالجة، **وم١٧/٤**: من خالف التعليمةَ عُدّ في حكم جهة التحكم.
   *
   * ثلاثةُ أبواب: **شاشةٌ خارج النطاق** تُغلق · **ومسارٌ لا يُعلن شاشتَه** يُغلق
   * (مغلقٌ افتراضياً) · **وصلاحياتُ الداخل نفسِه** (`@SupportShell`) تُقرأ —
   * فبها ترسم الواجهةُ أزرارَها ولا تكشف صفّاً من بيانات المنشأة.
   */
  it('[SPEC 1.10] 🔴 the scope is enforced: outside it 403, undeclared routes 403, the shell 200', async () => {
    // خارج النطاق — الفواتيرُ لم تُطلب ولم يوافق عليها المالك.
    await support(request(app.getHttpServer()).get('/invoices')).expect(403);
    await support(request(app.getHttpServer()).get('/reports/trial-balance')).expect(403);
    // مسارٌ بلا شاشةٍ معلَنة — الإشعاراتُ بياناتُ منشأةٍ ولا شاشةَ لها، فتُغلق.
    await support(request(app.getHttpServer()).get('/notifications')).expect(403);
    // والصدفةُ: صلاحياتُ الداخل نفسِه تُقرأ.
    await support(request(app.getHttpServer()).get('/me/permissions')).expect(200);

    // ⚠️ والمغلقُ لا يُسجَّل وصولاً — لم يصل للبيانات أصلاً.
    const log = await owner(request(app.getHttpServer()).get('/support-access/log')).expect(200);
    const lines = log.body as { method: string; path: string }[];
    expect(lines.some((l) => l.path === '/invoices')).toBe(false);
    expect(lines.some((l) => l.path === '/notifications')).toBe(false);
  }, 30000);

  it('[SPEC 1.10] every support request lands in the owner-visible log, named and reasoned', async () => {
    const log = await owner(request(app.getHttpServer()).get('/support-access/log')).expect(200);
    const lines = log.body as { method: string; path: string; grant: { requestedByName: string; reason: string } }[];
    const read = lines.find((l) => l.path === '/customers' && l.method === 'GET');
    expect(read).toBeTruthy();
    expect(read!.grant.reason).toContain(suffix);
    expect(read!.grant.requestedByName.length).toBeGreaterThan(0);
    // محاولة الكتابة المرفوضة لا تظهر كوصول — لم تصل للبيانات أصلاً.
    expect(lines.some((l) => l.method === 'POST' && l.path === '/customers')).toBe(false);
  }, 30000);

  it('the owner revokes mid-window → the door shuts immediately', async () => {
    await owner(request(app.getHttpServer()).post(`/support-access/${grantId}/revoke`)).expect(201);
    await support(request(app.getHttpServer()).get('/customers')).expect(403);
  }, 30000);

  it('expiry alone kills the window — no one has to remember to revoke', async () => {
    const res = await admin(request(app.getHttpServer()).post('/support-access/admin'))
      .send({ companyId, reason: `نافذة قصيرة ${suffix}`, durationMinutes: 30, screens: ['customers'] })
      .expect(201);
    await owner(request(app.getHttpServer()).post(`/support-access/${res.body.id}/approve`)).expect(201);
    await support(request(app.getHttpServer()).get('/customers')).expect(200);

    // نلفّ عقارب الساعة: النافذة انقضت.
    await prisma.supportAccessGrant.update({ where: { id: res.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await support(request(app.getHttpServer()).get('/customers')).expect(403);
  }, 30000);

  it('an employee cannot decide on support consent even with the settings screen', async () => {
    const tpl = await owner(request(app.getHttpServer()).post('/templates'))
      .send({ name: `إعدادات دعم ${suffix}`, allowedScreens: ['settings'] })
      .expect(201);
    const username = `sup-emp-${suffix}`;
    const emp = await owner(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'موظف إعدادات', username, password: 'SupPass123!', permissionTemplateId: tpl.body.id })
      .expect(201);
    const empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'SupPass123!' })).body.accessToken;

    await request(app.getHttpServer()).get('/support-access').set('Authorization', `Bearer ${empToken}`).expect(403);

    await owner(request(app.getHttpServer()).delete(`/company-users/${emp.body.id}`));
    await owner(request(app.getHttpServer()).delete(`/templates/${tpl.body.id}`));
  }, 30000);
});
