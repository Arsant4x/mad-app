import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (14.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(45000);

/**
 * التفويض — **إثباتٌ يطرق النقطة مباشرةً بلا واجهة**.
 *
 * القاعدة التي يحرسها: **إخفاء الزر ليس منعاً**. الواجهة ترشّح شجرة
 * الصلاحيات بما يملكه المفوِّض، والترشيح **عرضٌ لا منع** — طلبٌ مصنوع بيد
 * يتجاوزه في ثانية. فكل توكيدٍ هنا يمرّ بـ`supertest` لا بمتصفّح، وهو
 * بالضبط ما يفعله من يحاول التجاوز.
 */
describe('التفويض — المنح والسحب والسجل (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let mgrToken: string;
  let mgrId: string;
  let empId: string;
  let empToken: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const makeUser = async (name: string, templateId: string) => {
    const res = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name, username: `${name}-${suffix}`, password: 'DelegPass123!', permissionTemplateId: templateId })
      .expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: `${name}-${suffix}`, password: 'DelegPass123!' });
    return { id: res.body.id as string, token: login.body.accessToken as string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    ownerToken = login.body.accessToken;

    // ⚠️ قالبٌ **تُنشئه هذه الحزمة** لا «أول ما تجده». الاعتماد على ترتيب
    // صفوفٍ لا يملكه الملف هو ما جعل ثلاث مجموعات تنجح «إن سبقتها» أخرى
    // (CLAUDE.md، إصلاح العزل 2026-08-12).
    const tpl = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `تفويض-${suffix}`,
        isAllScreens: false,
        allowedScreens: ['employees', 'contracts', 'dashboard'],
        screenActions: { employees: ['view', 'edit', 'audit'], contracts: ['view', 'add', 'edit'], dashboard: ['view'] },
      })
      .expect(201);

    const mgr = await makeUser('mgr', tpl.body.id);
    mgrId = mgr.id;
    mgrToken = mgr.token;
    const emp = await makeUser('emp', tpl.body.id);
    empId = emp.id;
    empToken = emp.token;
  }, 120000);

  afterAll(async () => {
    for (const id of [mgrId, empId]) {
      if (id) await request(app.getHttpServer()).delete(`/company-users/${id}`).set('Authorization', `Bearer ${ownerToken}`);
    }
    await app.close();
  });

  it('① `/me/permissions` يعيد الحكم محسوباً لا موادّه', async () => {
    const res = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${mgrToken}`).expect(200);
    expect(res.body.grants).toEqual(expect.arrayContaining(['contracts:view', 'contracts:add', 'employees:view']));
    // ما ليس في القالب لا يظهر — ولو كان في الشجرة.
    expect(res.body.grants).not.toContain('pos:view');
    expect(res.body.grants).not.toContain('contracts:delete');
    expect(res.body.extinguished).toEqual([]);
  });

  it('② المالك يفوّض المدير — والصفّ يُسجَّل فعّالاً', async () => {
    const res = await request(app.getHttpServer())
      .post('/delegations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ granteeId: mgrId, nodeKey: 'contracts', grants: ['contracts:view', 'contracts:edit'] })
      .expect(201);
    expect(res.body.state).toBe('ACTIVE');
    expect(res.body.seq).toBeGreaterThan(0);

    // A delegated employee holds only what was delegated, so the manager also needs the
    // employees node to manage delegations; the guard enforces this like /me/permissions.
    await request(app.getHttpServer())
      .post('/delegations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ granteeId: mgrId, nodeKey: 'employees', grants: ['employees:view', 'employees:edit'] })
      .expect(201);
  });

  it('⭐③ المدير لا يفوّض ما لا يملكه — والرفض من الخادم لا من الواجهة', async () => {
    // `contracts:delete` ليست في قالب المدير ولا فُوّضت له. والطلب هنا
    // **مصنوع بيد** بلا مرور بأي زر — وهو بالضبط ما يفعله من يتجاوز.
    const res = await request(app.getHttpServer())
      .post('/delegations')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ granteeId: empId, nodeKey: 'contracts', grants: ['contracts:delete'] })
      .expect(403);
    expect(res.body.message).toContain('لا تملكها');
  });

  it('④ المدير يفوّض ما يملكه فعلاً', async () => {
    await request(app.getHttpServer())
      .post('/delegations')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ granteeId: empId, nodeKey: 'contracts', grants: ['contracts:view', 'contracts:edit'] })
      .expect(201);
    await request(app.getHttpServer())
      .post('/delegations')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ granteeId: empId, nodeKey: 'employees', grants: ['employees:view', 'employees:edit'] })
      .expect(201);

    const me = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${empToken}`).expect(200);
    expect(me.body.chains.length).toBeGreaterThan(0);
  });

  it('⭐⑤ الدورة مرفوضة — ولو غير مباشرة', async () => {
    const res = await request(app.getHttpServer())
      .post('/delegations')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ granteeId: mgrId, nodeKey: 'contracts', grants: ['contracts:view'] })
      .expect(400);
    expect(res.body.message).toContain('دائري');
  });

  it('لا يفوّض أحدٌ نفسه', async () => {
    await request(app.getHttpServer())
      .post('/delegations')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ granteeId: mgrId, nodeKey: 'contracts', grants: ['contracts:view'] })
      .expect(400);
  });

  /**
   * 🔴 **المفوَّضُ إليه من فضاء المنشأة نفسِها — بطُعمٍ حقيقيٍّ لا بمعرّفٍ معدوم** (`ق-٦٤٥`).
   *
   * كان الطُعمُ هنا معرّفاً صفرياً **لا صفَّ له في أيّ منشأة** — فيُرفض ولو حُذف شرطُ
   * المنشأة من الاستعلام، **والاختبارُ يمرّ على حارسٍ لا يحرس**. فالطُعمُ الآن **حسابٌ
   * فرعيٌّ حقيقيٌّ في منشأةٍ أخرى** (ومالكُها كذلك): ما تحجبه القائمةُ يُطلَب بمعرّفه —
   * **ويُردّ `404`**، ولا صفَّ يتيمَ في سجلٍّ لا يُحذف منه.
   */
  it('🔴 موظفُ منشأةٍ أخرى — ومالكُها — مرفوضان بمعرّفَيهما الحقيقيَّين (ق-٦٤٥)', async () => {
    // منشأةٌ ثانية بمالكها وحسابٍ فرعيٍّ حقيقيّ.
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    const tokenB = loginB.body.accessToken as string;
    const companyB = (await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${tokenB}`).expect(200)).body.id as string;
    const tplB = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `ب-${suffix}`, isAllScreens: false, allowedScreens: ['dashboard'], screenActions: { dashboard: ['view'] } })
      .expect(201);
    const userB = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'غريب', username: `stranger-${suffix}`, password: 'DelegPass123!', permissionTemplateId: tplB.body.id })
      .expect(201);

    try {
      // ① حسابٌ فرعيٌّ حقيقيٌّ من منشأةٍ أخرى — بمعرّفه.
      await request(app.getHttpServer())
        .post('/delegations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ granteeId: userB.body.id, nodeKey: 'contracts', grants: ['contracts:view'] })
        .expect(404);
      // ② ومالكُ المنشأة الأخرى — بمعرّف منشأته (فضاءٌ آخر أصلاً).
      await request(app.getHttpServer())
        .post('/delegations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ granteeId: companyB, nodeKey: 'contracts', grants: ['contracts:view'] })
        .expect(404);
      // ③ ولا أثرَ في سجلّ منشأتنا — فالسجلُّ لا يُحذف منه.
      const log = await request(app.getHttpServer()).get('/delegations/log').set('Authorization', `Bearer ${ownerToken}`).expect(200);
      expect(JSON.stringify(log.body)).not.toContain(userB.body.id);
    } finally {
      await request(app.getHttpServer()).delete(`/company-users/${userB.body.id}`).set('Authorization', `Bearer ${tokenB}`);
    }
  });

  it('⭐⑥ السحب المتتالي بنيويّ — سحبٌ من المدير يطفئ ما وزّعه في الطلب التالي', async () => {
    const before = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${empToken}`).expect(200);
    expect(before.body.grants).toContain('contracts:edit');

    // يُسحب تفويض **المالك للمدير** — لا تفويض المدير للموظف.
    const view = await request(app.getHttpServer()).get(`/delegations/${mgrId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    // Revoke the contracts delegation; the employees one keeps the manager able to manage delegations.
    const link = view.body.links.find((l: { state: string; nodeKey: string }) => l.state === 'ACTIVE' && l.nodeKey === 'contracts');
    const revoked = await request(app.getHttpServer()).patch(`/delegations/${link.id}/revoke`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(revoked.body.state).toBe('REVOKED');
    expect(revoked.body.revokedAt).not.toBeNull();

    // بلا خروجٍ وعودة، وبلا وظيفة إبطالٍ تمشي على الأبناء.
    const after = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${empToken}`).expect(200);
    expect(after.body.grants).not.toContain('contracts:edit');
  });

  it('⭐⑦ المنطفئ يُعاد بسببه — لا يُحذف', async () => {
    const view = await request(app.getHttpServer()).get(`/delegations/${empId}`).set('Authorization', `Bearer ${mgrToken}`).expect(200);
    // المدير ما زال يرى منحته للموظف قائمةً، ومعها سبب انطفائها.
    expect(view.body.extinguished.length).toBeGreaterThan(0);
    const e = view.body.extinguished[0];
    expect(['REVOKED', 'NARROWED', 'NOT_IN_ROOT']).toContain(e.reason);
    expect(view.body.links.some((l: { state: string }) => l.state === 'ACTIVE')).toBe(true);
  });

  it('السحب المكرَّر مرفوض — والصفّ باقٍ', async () => {
    const view = await request(app.getHttpServer()).get(`/delegations/${mgrId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const sealed = view.body.links.find((l: { state: string }) => l.state === 'REVOKED');
    await request(app.getHttpServer()).patch(`/delegations/${sealed.id}/revoke`).set('Authorization', `Bearer ${ownerToken}`).expect(400);
  });

  it('⭐ مدقّقٌ يملك `audit` بلا `employees` يقرأ السجل ولا يدير التفويض', async () => {
    // قرار المالك 2026-08-13: من يدقّق الامتثال يحتاج **تاريخ الصلاحيات**
    // ولا يحتاج إدارة الموظفين. فالسجل على `audit`، وبقية النقاط على
    // `employees` — والاختبار يثبت **الاتجاهين** لا أحدهما.
    const tpl = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `مدقّق-${suffix}`, isAllScreens: false, allowedScreens: ['audit', 'dashboard'], screenActions: { audit: ['view', 'audit'], dashboard: ['view'] } })
      .expect(201);
    const auditor = await makeUser('auditor', tpl.body.id);

    // ✅ يقرأ السجل.
    const log = await request(app.getHttpServer()).get('/delegations/log').set('Authorization', `Bearer ${auditor.token}`).expect(200);
    expect(Array.isArray(log.body.roots)).toBe(true);

    // ⛔ ولا يدير التفويض — الشاشة الأخرى محروسة بـ`employees`.
    await request(app.getHttpServer()).get(`/delegations/${empId}`).set('Authorization', `Bearer ${auditor.token}`).expect(403);
    await request(app.getHttpServer())
      .post('/delegations')
      .set('Authorization', `Bearer ${auditor.token}`)
      .send({ granteeId: empId, nodeKey: 'contracts', grants: ['contracts:view'] })
      .expect(403);

    await request(app.getHttpServer()).delete(`/company-users/${auditor.id}`).set('Authorization', `Bearer ${ownerToken}`);
  });

  it('⭐⑧ السجل غابةٌ لا شجرة — تفويض المدير للموظف ظاهرٌ للمالك', async () => {
    const res = await request(app.getHttpServer()).get('/delegations/log').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const all = JSON.stringify(res.body.roots);
    expect(all).toContain(empId);
    expect(all).toContain(mgrId);
    // والمسحوب **ظاهرٌ مختوماً** لا محذوفاً.
    expect(res.body.rows.some((r: { state: string }) => r.state === 'REVOKED')).toBe(true);
    // ولا فجوة في التسلسل.
    expect(res.body.sequenceBreak).toBeNull();
  });

  it('⭐⑨ مفردات مخترَعة مرفوضة قبل أن تصل الخدمة', async () => {
    for (const bad of [{ nodeKey: 'invoices' }, { grants: ['contracts:approve'] }, { grants: [] }]) {
      await request(app.getHttpServer())
        .post('/delegations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ granteeId: empId, nodeKey: 'contracts', grants: ['contracts:view'], ...bad })
        .expect(400);
    }
  });
});
