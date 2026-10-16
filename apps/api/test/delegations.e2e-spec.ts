import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

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

  /**
   * The tenant guard enforces the delegation chain, not only the template: it reaches the
   * verdict /me/permissions shows on every request, so a revoked delegation stops on the next call.
   * The company is isolated and kept, because the append only log restricts deleting it.
   */
  describe('the delegation chain in the tenant guard', () => {
    let company: IsolatedCompany;
    let contractId: string;
    let editTemplateId: string;
    let viewTemplateId: string;
    let managerTemplateId: string;
    let userSeq = 0;

    const http = () => request(app.getHttpServer());
    const as = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const owner = (r: request.Test) => as(company.token)(r);
    const isoDay = (d: Date) => d.toISOString().slice(0, 10);

    async function makeTemplate(name: string, allowedScreens: string[], screenActions: Record<string, string[]>): Promise<string> {
      const res = await owner(http().post('/templates')).send({ name: `${name} ${suffix}`, isAllScreens: false, allowedScreens, screenActions }).expect(201);
      return res.body.id as string;
    }

    async function makeEmployee(templateId: string): Promise<{ id: string; token: string }> {
      const username = `dg-${suffix}-${userSeq++}`;
      const password = 'DelegGuard123!';
      const res = await owner(http().post('/company-users')).send({ name: username, username, password, permissionTemplateId: templateId }).expect(201);
      const login = await http().post('/auth/login').send({ username, password }).expect(200);
      return { id: res.body.id as string, token: login.body.accessToken as string };
    }

    async function delegate(grantorToken: string, granteeId: string, nodeKey: string, grants: string[]): Promise<string> {
      const res = await as(grantorToken)(http().post('/delegations')).send({ granteeId, nodeKey, grants }).expect(201);
      expect(res.body.state).toBe('ACTIVE');
      return res.body.id as string;
    }

    async function revoke(rowId: string): Promise<void> {
      const res = await owner(http().patch(`/delegations/${rowId}/revoke`)).expect(200);
      expect(res.body.state).toBe('REVOKED');
    }

    const editContract = (token: string) =>
      as(token)(http().patch(`/contracts/${contractId}`)).send({ services: `service ${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });

    async function grantsOf(token: string): Promise<string[]> {
      const res = await as(token)(http().get('/me/permissions')).expect(200);
      return res.body.grants as string[];
    }

    beforeAll(async () => {
      company = await registerIsolatedCompany(app, 'deleg-guard');

      const property = await owner(http().post('/properties')).send({ name: `Delegation guard ${suffix}`, ownership: 'owned' }).expect(201);
      const unit = await owner(http().post('/units')).send({ propertyId: property.body.id, unitNo: `DG-${suffix}`, type: 'شقة', rentMonthly: 1000 }).expect(201);
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 0));
      const contract = await owner(http().post('/contracts'))
        .send({
          unitId: unit.body.id,
          customerId: await createTenantCustomer(app, company.token, `Delegation guard tenant ${suffix}`),
          value: 12000,
          cycle: 'monthly',
          start: isoDay(start),
          end: isoDay(end),
          classification: 'RESIDENTIAL',
          vatInclusion: 'EXCLUSIVE',
        })
        .expect(201);
      contractId = contract.body.id;

      editTemplateId = await makeTemplate('contracts edit', ['contracts'], { contracts: ['view', 'edit'] });
      viewTemplateId = await makeTemplate('contracts view', ['contracts'], { contracts: ['view'] });
      managerTemplateId = await makeTemplate('contracts manager', ['contracts', 'employees'], { contracts: ['view', 'edit'], employees: ['view', 'edit'] });
    });

    it('a revoked delegation stops the next contract edit, as /me/permissions shows', async () => {
      const emp = await makeEmployee(editTemplateId);
      const row = await delegate(company.token, emp.id, 'contracts', ['contracts:view', 'contracts:edit']);
      await editContract(emp.token).expect(200);

      await revoke(row);
      expect(await grantsOf(emp.token)).not.toContain('contracts:edit');
      const refused = await editContract(emp.token).expect(403);
      expect(refused.body.code).toBe('SCREEN_FORBIDDEN');
    });

    it('a delegation narrower than the template limits the employee to what was delegated', async () => {
      const emp = await makeEmployee(editTemplateId);
      await delegate(company.token, emp.id, 'contracts', ['contracts:view']);

      const grants = await grantsOf(emp.token);
      expect(grants).toContain('contracts:view');
      expect(grants).not.toContain('contracts:edit');
      await as(emp.token)(http().get(`/contracts/${contractId}`)).expect(200);
      const refused = await editContract(emp.token).expect(403);
      expect(refused.body.code).toBe('ACTION_FORBIDDEN');
    });

    it('revoking the delegation above a manager stops what the manager passed on, on the next request', async () => {
      const manager = await makeEmployee(managerTemplateId);
      const emp = await makeEmployee(editTemplateId);
      const contractsRow = await delegate(company.token, manager.id, 'contracts', ['contracts:view', 'contracts:edit']);
      await delegate(company.token, manager.id, 'employees', ['employees:view', 'employees:edit']);
      await delegate(manager.token, emp.id, 'contracts', ['contracts:view', 'contracts:edit']);
      await editContract(emp.token).expect(200);
      await editContract(manager.token).expect(200);

      await revoke(contractsRow);
      expect(await grantsOf(emp.token)).not.toContain('contracts:edit');
      await editContract(emp.token).expect(403);
      await editContract(manager.token).expect(403);
      // The manager keeps what the other, still active delegation grants.
      await as(manager.token)(http().get(`/delegations/${emp.id}`)).expect(200);
    });

    it('a still delegated employee keeps the delegated edit', async () => {
      const emp = await makeEmployee(editTemplateId);
      await delegate(company.token, emp.id, 'contracts', ['contracts:view', 'contracts:edit']);

      expect(await grantsOf(emp.token)).toContain('contracts:edit');
      await editContract(emp.token).expect(200);
      await editContract(emp.token).expect(200);
    });

    it('an employee with no delegation chain keeps exactly the template rights', async () => {
      const editor = await makeEmployee(editTemplateId);
      await editContract(editor.token).expect(200);

      const viewer = await makeEmployee(viewTemplateId);
      await as(viewer.token)(http().get(`/contracts/${contractId}`)).expect(200);
      const refused = await editContract(viewer.token).expect(403);
      expect(refused.body.code).toBe('ACTION_FORBIDDEN');
    });
  });
});
