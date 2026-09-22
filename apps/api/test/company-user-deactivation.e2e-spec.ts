import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * ق-١٢٥٣/③ — **تعطيلُ الموظف يُنهي جلساتِه، لا يُوقفها.** الحالةُ غيرُ `ACTIVE` تُرفض في حارس المستأجر على
 * الطلب التالي (لا انتظارَ لانتهاء رمز الوصول)، ويُرفض تحديثُ الجلسة، **وتُبطَل رموزُ التحديث كلُّها** — فإعادةُ
 * التفعيل لا تُحيي جهازاً كان داخلاً: يدخل من جديد بكلمته. منشأةٌ معزولة بموظفٍ يُنشأ لها.
 */
describe('Company-user deactivation ends sessions (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let employeeId: string;
  let employeeAccess: string;
  let employeeRefreshCookie: string;
  /** جهازٌ ثانٍ دخل قبل التعطيل ويبقى صامتاً أثناءه — إن أُحيي بعد إعادة التفعيل فالجلسةُ أُوقفت ولم تُنهَ. */
  let quietDeviceRefreshCookie: string;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const EMPLOYEE = { username: `deact-${stamp}`, password: 'DeactPass123!' };

  const owner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const refreshCookieOf = (res: request.Response): string => {
    const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='));
    if (!raw) throw new Error(`لا كعكةَ تحديثٍ في ردّ الدخول: ${JSON.stringify(res.headers['set-cookie'])}`);
    return raw.split(';')[0];
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'deactivation');
    const templates = await owner(request(app.getHttpServer()).get('/templates')).expect(200);
    const templateId = templates.body.find((t: { isSystem: boolean }) => !t.isSystem).id;
    const employee = await owner(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'موظفٌ يُعطَّل', username: EMPLOYEE.username, password: EMPLOYEE.password, permissionTemplateId: templateId })
      .expect(201);
    employeeId = employee.body.id;

    const login = await request(app.getHttpServer()).post('/auth/login').send(EMPLOYEE).expect(200);
    employeeAccess = login.body.accessToken;
    employeeRefreshCookie = refreshCookieOf(login);
    const quiet = await request(app.getHttpServer()).post('/auth/login').send(EMPLOYEE).expect(200);
    quietDeviceRefreshCookie = refreshCookieOf(quiet);
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 1.4] ① the employee works before deactivation', async () => {
    await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${employeeAccess}`).expect(200);
  }, 30000);

  it('[SPEC 1.4] ② after deactivation the very next request is refused, and the session cannot be refreshed', async () => {
    await owner(request(app.getHttpServer()).patch(`/company-users/${employeeId}`)).send({ status: 'STOPPED' }).expect(200);

    // رمزُ الوصول ما زال صالحاً زمنياً — والحارسُ يقرأ الحالةَ من القاعدة لا من الرمز.
    await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${employeeAccess}`).expect(403);
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', employeeRefreshCookie).expect(401);
  }, 30000);

  it('[SPEC 1.4] ③ re-activation does not revive the old session — its refresh token was revoked, and a fresh login is required', async () => {
    await owner(request(app.getHttpServer()).patch(`/company-users/${employeeId}`)).send({ status: 'ACTIVE' }).expect(200);

    // الجلسةُ القديمة أُنهيت لا أُوقفت: رمزُ تحديث الجهاز الصامت — الذي لم يُقدَّم أثناء التعطيل — مُبطَل.
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', quietDeviceRefreshCookie).expect(401);
    // والدخولُ من جديد يعمل — فالتعطيلُ كان إنهاءَ جلسات لا إغلاقَ حساب.
    const again = await request(app.getHttpServer()).post('/auth/login').send(EMPLOYEE).expect(200);
    await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${again.body.accessToken}`).expect(200);
  }, 30000);

  it('[SPEC 1.4] ④ 🔴 تغييرُ المالك لكلمة الموظف يُنهي جلساتِه كالتعطيل — R48 (ق-١٢٧٨/④)', async () => {
    /**
     * **العطلُ الذي يُغلقه**: كان `PATCH /company-users/:id { password }` يكتب التجزئةَ وحدَها —
     * فموظّفٌ غادر وغُيّرت كلمتُه **يبقى داخلاً برمز تحديثه** حتى ثلاثين يوماً ما لم يُجمَّد،
     * والمالكُ الذي غيّر الكلمة يظنّ أنه أغلق الباب. و`auth.resetPassword` كانت تُبطلها
     * **والمسارُ الثاني لا** — فاستوى المساران.
     */
    const fresh = await request(app.getHttpServer()).post('/auth/login').send(EMPLOYEE).expect(200);
    const deviceCookie = refreshCookieOf(fresh);
    /**
     * ⚠️ **وأوّلُ صياغةٍ لهذه المرحلة مرّت على الكسر** (`§8.7` الوجه الرابع): جدّدت بالكعكة الأولى
     * ثم أعادت استعمالَها بعد التغيير — **والتدويرُ يجعلها مستهلَكة**، فيُردّ `401` ولو لم يُبطَل
     * شيء. فتُلتقط **الكعكةُ المدوَّرة** ويُفحص إبطالُها هي.
     */
    // قبلَ التغيير: الجهازُ يُجدّد جلستَه — وإلا لم نفحص شيئاً.
    const rotated = refreshCookieOf(await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', deviceCookie).expect(200));

    const NEW_PASSWORD = 'RotatedPass123!';
    await owner(request(app.getHttpServer()).patch(`/company-users/${employeeId}`)).send({ password: NEW_PASSWORD }).expect(200);

    // بعدَه: رمزُ التحديث مُبطَل — الجهازُ الصامت لا يعود.
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', rotated).expect(401);
    // والكلمةُ القديمة لا تفتح، والجديدةُ تفتح — فالتغييرُ وقع فعلاً لا الإبطالُ وحدَه.
    await request(app.getHttpServer()).post('/auth/login').send(EMPLOYEE).expect(401);
    const relogin = await request(app.getHttpServer()).post('/auth/login').send({ username: EMPLOYEE.username, password: NEW_PASSWORD }).expect(200);
    await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${relogin.body.accessToken}`).expect(200);
  }, 30000);
});
