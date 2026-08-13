import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * ترشيح الشاشات بالنشاط — **سلوكياً على قاعدة حيّة**.
 *
 * وما يُثبَت هنا لا يُثبته حارسٌ نصّي: الحارس يقول إن الشيفرة **مكتوبةٌ**
 * كذلك، وهذا يقول إنها **تتصرّف** كذلك عبر المسار الكامل — بطلباتٍ مصنوعة
 * بيد لا بواجهة، وهو ما يفعله من يتجاوز.
 */
describe('ترشيح الشاشات بالنشاط (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let empToken: string;
  let empId: string;
  let companyId: string;
  let adminToken: string;
  let realestateId = '';
  let restaurantId = '';

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const username = `sector-${suffix}`;

  /** يُطفئ الترشيح — التراجع الفوري. يُستدعى بين الحالات لعزلها. */
  const clearPrimary = () =>
    request(app.getHttpServer()).patch('/activities/primary').set('Authorization', `Bearer ${token}`).send({ activityId: null, confirmed: true });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    // ⚠️ منشأةٌ **تُسجَّل لهذه الحزمة** لا `demo-company-a`: الاختبار يغيّر
    // نشاطها الرئيسي، وتغييرُه على منشأةٍ مشتركة يُخفي شاشاتٍ عن مجموعاتٍ
    // أخرى تعمل عليها — وهو بالضبط ما تمنعه قاعدة العزل.
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ orgName: `منشأة القطاعات ${suffix}`, username, password: 'SectorPass123!' })
      .expect(201);
    token = reg.body.accessToken;
    companyId = reg.body.user.companyId;

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME, password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD });
    adminToken = adminLogin.body.accessToken;
  }, 120000);

  afterAll(async () => {
    if (companyId && adminToken) {
      await request(app.getHttpServer()).delete(`/companies/${companyId}`).set('Authorization', `Bearer ${adminToken}`);
    }
    await app.close();
  });

  it('⭐① منشأةٌ بلا نشاط رئيسي ترى **كل** شاشاتها', async () => {
    // الجواب على «ماذا يحدث للمنشآت القائمة لحظة التطبيق؟» — لا يستيقظ
    // تاجرٌ فلا يجد شاشاته.
    const me = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${token}`).expect(200);
    for (const g of ['contracts:view', 'pos:view', 'products:view', 'quotes:view']) expect(me.body.grants).toContain(g);

    // والعنوان المباشر يمرّ كذلك.
    await request(app.getHttpServer()).get('/contracts').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('ينشئ نشاطين — والمطابقة الآلية تقترح ولا تحكم', async () => {
    const re = await request(app.getHttpServer())
      .post('/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'الفرع العقاري', activityType: 'عقارات' })
      .expect(201);
    realestateId = re.body.id;
    // ⚠️ **الاقتراح لا يُكتب في `sector`** — المالك يؤكّد.
    expect(re.body.sector).toBeNull();
    expect(re.body.sectorSuggested).toBe('REALESTATE');

    const rest = await request(app.getHttpServer())
      .post('/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'المطعم', sector: 'RESTAURANT' })
      .expect(201);
    restaurantId = rest.body.id;
    // وتأكيدٌ صريح ⇒ لا اقتراح.
    expect(rest.body.sector).toBe('RESTAURANT');
    expect(rest.body.sectorSuggested).toBeNull();
  });

  it('⭐② المعاينة تعرض ما سيختفي **بالاسم** قبل أن يقع', async () => {
    await request(app.getHttpServer()).patch(`/activities/${realestateId}`).set('Authorization', `Bearer ${token}`).send({ sector: 'REALESTATE' }).expect(200);

    const pv = await request(app.getHttpServer())
      .get(`/activities/primary/preview?activityId=${realestateId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // نشاطان مفعَّلان (عقاري + مطعم) ⇒ الاتحاد. والمختفي ما ليس فيهما.
    expect(pv.body.willHide.map((h: { screen: string }) => h.screen)).toContain('quotes');
    // ⚠️ **بالاسم لا بالمفتاح**: «ستُخفى 4 شاشات» بلا أسمائها لا يُمكّن
    // المالك من الحكم، و`quotes` ليست اسماً يقرأه تاجر.
    expect(pv.body.willHide.every((h: { screen: string; label: string }) => h.label && h.label !== h.screen)).toBe(true);
    // ⚠️ والمعاينة **لا تطبّق**: الترشيح ما زال مطفأً.
    const still = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${token}`).expect(200);
    expect(still.body.grants).toContain('quotes:view');
  });

  it('⭐③ ولا تطبيق بلا تأكيد صريح', async () => {
    const res = await request(app.getHttpServer())
      .patch('/activities/primary')
      .set('Authorization', `Bearer ${token}`)
      .send({ activityId: realestateId, confirmed: false })
      .expect(400);
    expect(res.body.message).toContain('تأكيد');
  });

  it('⭐④ التطبيق يُرشِّح — والعنوان المباشر يُرفض بـ403 لا 404', async () => {
    await request(app.getHttpServer())
      .patch('/activities/primary')
      .set('Authorization', `Bearer ${token}`)
      .send({ activityId: realestateId, confirmed: true })
      .expect(200);

    // عقارات + مطعم ⇒ لا `quotes`.
    const me = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.grants).not.toContain('quotes:view');
    expect(me.body.grants).toContain('contracts:view');
    expect(me.body.grants).toContain('pos:view');

    // ⚠️ **الطلب مصنوعٌ بيد** — لا نقرة ولا ترشيح بصري.
    const denied = await request(app.getHttpServer()).get('/quotes').set('Authorization', `Bearer ${token}`).expect(403);
    expect(denied.body.message).toContain('غير مفعّلة لنشاط منشأتك');
    expect(denied.body.message).toContain('الإعدادات');
  });

  it('⭐⑤ التغيير مسجَّل في سجل التدقيق بالأسماء العربية', async () => {
    const log = await request(app.getHttpServer()).get('/audit-log').set('Authorization', `Bearer ${token}`).expect(200);
    const rows = Array.isArray(log.body) ? log.body : (log.body.items ?? []);
    const entry = rows.find((r: { entity?: string }) => r.entity === 'primaryActivity');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).toContain('عروض الأسعار');
  });

  it('⭐⑥ موظفٌ يعمل على شاشة ثم يُعطَّل نشاطها — يُرفض في **الطلب التالي** بلا إعادة دخول', async () => {
    // نفس متطلب `Absence of user session management` (الملحق 1): تغييرٌ في
    // السلطة ينفذ فوراً، لا عند انتهاء الجلسة.
    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${token}`).expect(200);
    const tpl = templates.body.find((t: { isAllScreens: boolean }) => t.isAllScreens) ?? templates.body[0];

    const emp = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'كاشير', username: `cashier-${suffix}`, password: 'SectorPass123!', permissionTemplateId: tpl.id })
      .expect(201);
    empId = emp.body.id;
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: `cashier-${suffix}`, password: 'SectorPass123!' });
    empToken = login.body.accessToken;

    // يعمل على الكاشير الآن — النشاط «مطعم» مفعَّل.
    await request(app.getHttpServer()).get('/products').set('Authorization', `Bearer ${empToken}`).expect(200);

    // المالك يعطّل نشاط المطعم — **ولا خروج ولا رمز جديد**.
    await request(app.getHttpServer())
      .patch(`/activities/${restaurantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ disabled: true })
      .expect(200);

    // ⚠️ **بنفس الرمز**: الطلب التالي يُرفض.
    const denied = await request(app.getHttpServer()).get('/products').set('Authorization', `Bearer ${empToken}`).expect(403);
    expect(denied.body.message).toContain('غير مفعّلة');

    // والعقارات باقية — التعطيل يخصّ نشاطاً واحداً.
    await request(app.getHttpServer()).get('/contracts').set('Authorization', `Bearer ${empToken}`).expect(200);
  });

  it('⭐⑦ والبيانات لم تُمسّ — إعادة التفعيل تُرجع الشاشة فوراً', async () => {
    await request(app.getHttpServer())
      .patch(`/activities/${restaurantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ disabled: false })
      .expect(200);

    await request(app.getHttpServer()).get('/products').set('Authorization', `Bearer ${empToken}`).expect(200);
    if (empId) await request(app.getHttpServer()).delete(`/company-users/${empId}`).set('Authorization', `Bearer ${token}`);
  });

  it('⭐⑧ التراجع فوريّ — `null` يُعيد كل الشاشات', async () => {
    await clearPrimary().expect(200);
    const me = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.grants).toContain('quotes:view');
    await request(app.getHttpServer()).get('/quotes').set('Authorization', `Bearer ${token}`).expect(200);
  });
});
