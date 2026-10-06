import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformRole, Prisma } from '@mad-app/db';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (22.0 ث على قاعدةٍ معزولة محلّياً).
jest.setTimeout(66000);

/**
 * ⚖️ **محرّكُ النماذج — الموجةُ ١أ: الأنواعُ والقوالبُ المُصدَّرة** (توجيه ٢٧٨ · `ق-١٦٣٤` · الخطّة §٦.١ و§٦.٢ · قرارُ الخطّة ٤٣).
 *
 * الجوابُ معروفٌ يداً في كلِّ حالة: المنصّةُ تنشئ نوعاً وقالباً ببندين، والمنشأةُ تنسخه وتعدّله، والإصدارُ الثاني يؤرشف الأوّل،
 * والمنشورُ لا يُعدَّل، والعزلُ في التطبيق **وفي القاعدة** (سياستان، والمركّب).
 */
describe('Form templates — wave 1a (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let ownerToken: string;
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  let employeeToken: string;
  let operations: { identityId: string; token: string } | undefined;
  const stamp = `${Date.now()}`.slice(-8);
  const typeIds: string[] = [];
  const familyIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => `Bearer ${t}`;

  const ITEMS = [
    { label: 'قراءةُ عدّاد الكهرباء', itemType: 'METER_READING', required: true, unit: 'ك.و.س' },
    { label: 'حرارةُ الثلاجة', itemType: 'TEMPERATURE', minValue: 2, maxValue: 8, isBlocking: true, unit: '°م' },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);

    ownerToken = (
      await http()
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;

    a = await registerIsolatedCompany(app, 'forms-a');
    b = await registerIsolatedCompany(app, 'forms-b');

    // موظّفٌ في «أ» على القالب العامّ «بلا شاشات»: يقرأ القوالب (لكلِّ فاعل) ولا يكتب (للمالك).
    const templates = await http().get('/templates').set('Authorization', bearer(a.token)).expect(200);
    const list = (Array.isArray(templates.body) ? templates.body : templates.body.items) as { id: string; isNewUserDefault?: boolean }[];
    const noScreens = list.find((t) => t.isNewUserDefault);
    expect(noScreens).toBeDefined();
    const username = `forms-emp-${stamp}`;
    await http()
      .post('/company-users')
      .set('Authorization', bearer(a.token))
      .send({ name: 'موظّف النماذج', username, password: 'FormsEmp123!', permissionTemplateId: noScreens!.id })
      .expect(201);
    employeeToken = (await http().post('/auth/login').send({ username, password: 'FormsEmp123!' }).expect(200)).body.accessToken;
  }, 120000);

  afterAll(async () => {
    // النسخُ تُزال مع منشآتها (تسلسلٌ من الشركة)، ثم القوالبُ العامّة بمسنَد الإدارة، ثم الأنواع.
    await removeIsolatedCompany(app, a);
    await removeIsolatedCompany(app, b);
    if (familyIds.length) {
      await tenantPrisma.runAsPlatformAdmin((tx) => tx.formTemplate.deleteMany({ where: { familyId: { in: familyIds }, companyId: null } }));
    }
    if (typeIds.length) await prisma.formType.deleteMany({ where: { id: { in: typeIds } } });
    if (operations) await prisma.loginIdentity.delete({ where: { id: operations.identityId } }).catch(() => undefined);
    await app.close();
  });

  let typeId: string;
  let v1: { id: string; familyId: string };
  // الإصدارُ المنشورُ بعد ④ (وفيه يُؤرشف v1، ومن المؤرشف لا يُنسخ).
  let v2Id: string;
  let copy: { id: string };

  it('① المنصّةُ تنشئ نوعاً وقالباً: الإصدارُ الأوّل مسوّدة لا تراها المنشأة، والنشرُ يضعه في كتالوجها', async () => {
    const type = await http()
      .post('/admin/form-types')
      .set('Authorization', bearer(ownerToken))
      .send({ code: `UNIT_HANDOVER_T${stamp}`, name: 'تسليمُ وحدة', sector: 'REALESTATE' })
      .expect(201);
    typeId = type.body.id;
    typeIds.push(typeId);
    // الرمزُ فريد.
    await http().post('/admin/form-types').set('Authorization', bearer(ownerToken)).send({ code: `UNIT_HANDOVER_T${stamp}`, name: 'مكرَّر' }).expect(409);

    const created = await http()
      .post('/admin/form-templates')
      .set('Authorization', bearer(ownerToken))
      .send({ formTypeId: typeId, name: 'تسليمُ وحدةٍ سكنية', items: ITEMS })
      .expect(201);
    v1 = { id: created.body.id, familyId: created.body.familyId };
    familyIds.push(v1.familyId);
    expect(created.body).toMatchObject({ companyId: null, version: 1, status: 'DRAFT', familyId: created.body.id, publishedAt: null, sourceTemplateId: null });
    expect(created.body.items.map((i: { lineNo: number; label: string }) => `${i.lineNo}:${i.label}`)).toEqual(['1:قراءةُ عدّاد الكهرباء', '2:حرارةُ الثلاجة']);
    expect(created.body.items[1]).toMatchObject({ minValue: '2', maxValue: '8', isBlocking: true });

    // المسوّدةُ العامّة لا تُرى خارج لوحة المطوّر.
    const before = await http().get('/form-templates/catalog').set('Authorization', bearer(a.token)).expect(200);
    expect(before.body.some((t: { id: string }) => t.id === v1.id)).toBe(false);
    await http().get(`/form-templates/${v1.id}`).set('Authorization', bearer(a.token)).expect(404);

    const published = await http().post(`/admin/form-templates/${v1.id}/publish`).set('Authorization', bearer(ownerToken)).expect(201);
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.publishedAt).not.toBeNull();

    const after = await http().get('/form-templates/catalog').set('Authorization', bearer(employeeToken)).expect(200);
    const row = after.body.find((t: { id: string }) => t.id === v1.id);
    expect(row).toMatchObject({ version: 1, status: 'PUBLISHED', itemCount: 2, formType: { id: typeId, sector: 'REALESTATE' } });
  });

  it('② المنشورُ لا يُعدَّل ولا يُحذف، والمنشأةُ أمام العامّ تُردّ برسالةٍ تقول ما تفعل', async () => {
    await http().patch(`/admin/form-templates/${v1.id}`).set('Authorization', bearer(ownerToken)).send({ name: 'تغيير' }).expect(409);
    await http().delete(`/admin/form-templates/${v1.id}`).set('Authorization', bearer(ownerToken)).expect(409);
    const refused = await http().patch(`/form-templates/${v1.id}`).set('Authorization', bearer(a.token)).send({ name: 'نسختي' }).expect(403);
    expect(refused.body.message).toContain('انسخه');
  });

  it('③ المنشأةُ تنسخ الإصدارَ المنشور وتعدّل نسختَها وتنشرها — والموظّفُ يقرأ ولا يكتب', async () => {
    await http().post('/form-templates/copy').set('Authorization', bearer(employeeToken)).send({ sourceTemplateId: v1.id }).expect(403);

    const made = await http()
      .post('/form-templates/copy')
      .set('Authorization', bearer(a.token))
      .send({ sourceTemplateId: v1.id, name: 'تسليمُ شقّة (مع غرفة الخادمة)' })
      .expect(201);
    copy = { id: made.body.id };
    expect(made.body).toMatchObject({ companyId: a.companyId, version: 1, status: 'DRAFT', sourceTemplateId: v1.id, formTypeId: typeId });
    expect(made.body.items).toHaveLength(2);

    const edited = await http()
      .patch(`/form-templates/${copy.id}`)
      .set('Authorization', bearer(a.token))
      .send({ items: [...ITEMS, { label: 'عددُ المفاتيح المسلَّمة', itemType: 'QTY', required: true }] })
      .expect(200);
    expect(edited.body.items.map((i: { lineNo: number }) => i.lineNo)).toEqual([1, 2, 3]);

    // التحقّقُ من البنود في الخادم: مكرَّرٌ يُرفض.
    await http()
      .patch(`/form-templates/${copy.id}`)
      .set('Authorization', bearer(a.token))
      .send({ items: [ITEMS[0], ITEMS[0]] })
      .expect(400);

    await http().post(`/form-templates/${copy.id}/publish`).set('Authorization', bearer(employeeToken)).expect(403);
    await http().post(`/form-templates/${copy.id}/publish`).set('Authorization', bearer(a.token)).expect(201);

    const mine = await http().get('/form-templates').set('Authorization', bearer(employeeToken)).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ id: copy.id, status: 'PUBLISHED', itemCount: 3, sourceLatestVersion: 1 });
  });

  it('④ الإصدارُ الجديد مسوّدةٌ بالرقم التالي، والثانيةُ تُرفض، ونشرُه يؤرشف الأوّل — ونسخةُ التاجر لا تتغيّر', async () => {
    const v2 = await http().post(`/admin/form-templates/${v1.id}/versions`).set('Authorization', bearer(ownerToken)).expect(201);
    expect(v2.body).toMatchObject({ familyId: v1.familyId, version: 2, status: 'DRAFT' });
    v2Id = v2.body.id;
    await http().post(`/admin/form-templates/${v1.id}/versions`).set('Authorization', bearer(ownerToken)).expect(409);
    // من مسوّدةٍ لا يُبنى إصدار.
    await http().post(`/admin/form-templates/${v2.body.id}/versions`).set('Authorization', bearer(ownerToken)).expect(400);

    await http()
      .patch(`/admin/form-templates/${v2.body.id}`)
      .set('Authorization', bearer(ownerToken))
      .send({ items: [...ITEMS, { label: 'حالةُ الخزائن', itemType: 'CONDITION' }] })
      .expect(200);
    await http().post(`/admin/form-templates/${v2.body.id}/publish`).set('Authorization', bearer(ownerToken)).expect(201);

    const family = await http().get('/admin/form-templates').set('Authorization', bearer(ownerToken)).expect(200);
    const mineFamily = family.body.filter((t: { familyId: string }) => t.familyId === v1.familyId).map((t: { version: number; status: string }) => `${t.version}:${t.status}`);
    expect(mineFamily).toEqual(['1:ARCHIVED', '2:PUBLISHED']);

    // المؤرشفُ يبقى مقروءاً ببنوده الأصلية — والسجلُّ المعبّأ عليه يشير إليه.
    const archived = await http().get(`/admin/form-templates/${v1.id}`).set('Authorization', bearer(ownerToken)).expect(200);
    expect(archived.body.items).toHaveLength(2);

    // نسخةُ التاجر على إصدارها، ومعها أن للأصل إصداراً أحدث.
    const mine = await http().get('/form-templates').set('Authorization', bearer(a.token)).expect(200);
    expect(mine.body[0]).toMatchObject({ sourceTemplateId: v1.id, itemCount: 3, sourceLatestVersion: 2 });
    // ومن المؤرشف لا يُنسخ.
    await http().post('/form-templates/copy').set('Authorization', bearer(b.token)).send({ sourceTemplateId: v1.id }).expect(400);
  });

  it('⑤ العزلُ بين المنشأتين في التطبيق', async () => {
    await http().get(`/form-templates/${copy.id}`).set('Authorization', bearer(b.token)).expect(404);
    await http().patch(`/form-templates/${copy.id}`).set('Authorization', bearer(b.token)).send({ name: 'x' }).expect(404);
    const bList = await http().get('/form-templates').set('Authorization', bearer(b.token)).expect(200);
    expect(bList.body).toEqual([]);
    // والمنصّةُ لا ترى نسخَ التجّار.
    await http().get(`/admin/form-templates/${copy.id}`).set('Authorization', bearer(ownerToken)).expect(404);
  });

  it('⑥ العزلُ في القاعدة: مستأجرٌ لا يحذف قالباً عامّاً ولا يرى نسخةَ غيره، والمنصّةُ لا تقرأ النسخ، والمركّبُ يمنع البندَ العابر', async () => {
    const deleted = await tenantPrisma.runInTenantContext(b.companyId, (tx) => tx.formTemplate.deleteMany({ where: { familyId: v1.familyId } }));
    expect(deleted.count).toBe(0);
    // وقرأه قبلها: السياسةُ العامّة للقراءة وحدَها (مصادقةُ المسبار — ق-١٣٦).
    const seen = await tenantPrisma.runInTenantContext(b.companyId, (tx) => tx.formTemplate.count({ where: { familyId: v1.familyId } }));
    expect(seen).toBe(2);

    const foreign = await tenantPrisma.runInTenantContext(b.companyId, (tx) => tx.formTemplate.count({ where: { id: copy.id } }));
    expect(foreign).toBe(0);
    const own = await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.formTemplate.count({ where: { id: copy.id } }));
    expect(own).toBe(1);

    const adminSees = await tenantPrisma.runAsPlatformAdmin((tx) => tx.formTemplate.count({ where: { id: copy.id } }));
    expect(adminSees).toBe(0);

    // الحالةُ الموجبة أوّلاً: بندُ «أ» على قالب «أ» يُقبل — في معاملةٍ تُرجَع فلا يبقى أثر.
    const ROLLBACK = 'form-templates: rollback';
    let ownInserted = false;
    await tenantPrisma
      .runInTenantContext(a.companyId, async (tx) => {
        await tx.formTemplateItem.create({ data: { companyId: a.companyId, templateId: copy.id, lineNo: 99, label: 'مقبول', itemType: 'TEXT' } });
        ownInserted = true;
        throw new Error(ROLLBACK);
      })
      .catch((e: unknown) => {
        if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
      });
    expect(ownInserted).toBe(true);

    // بندٌ لمنشأة «ب» على قالب «أ»: السياسةُ تقبله (المنشأةُ منشأتُه) والمركّبُ يرفضه.
    const crossed = await tenantPrisma
      .runInTenantContext(b.companyId, (tx) =>
        tx.formTemplateItem.create({ data: { companyId: b.companyId, templateId: copy.id, lineNo: 99, label: 'عابر', itemType: 'TEXT' } }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(crossed).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(String((crossed as Error).message)).toContain('form_template_items_companyId_templateId_fkey');
  });

  it('⑦ القوالبُ العامّة لمالك المنصّة وحدَه حتى يُحكم في الدور', async () => {
    const username = `forms-ops-${stamp}`;
    const identity = await prisma.loginIdentity.create({
      data: { username, passwordHash: await argon2.hash('FormsOps123!'), actorType: 'PLATFORM_ADMIN' },
      select: { id: true },
    });
    await prisma.platformAdmin.create({ data: { loginIdentityId: identity.id, displayName: 'تشغيلُ النماذج', role: PlatformRole.OPERATIONS } });
    const token = (await http().post('/auth/login').send({ username, password: 'FormsOps123!' }).expect(200)).body.accessToken as string;
    operations = { identityId: identity.id, token };
    await http().get('/admin/form-templates').set('Authorization', bearer(token)).expect(403);
    await http().post('/admin/form-types').set('Authorization', bearer(token)).send({ code: `NOPE_${stamp}`, name: 'لا' }).expect(403);
    // والمستأجرُ لا يبلغ لوحةَ المطوّر أصلاً.
    await http().get('/admin/form-templates').set('Authorization', bearer(a.token)).expect(403);
  });

  it('⑧ قوالبُ المنشأة يعدّلها من يمنحه المالكُ شاشةَ «النماذج»، كلُّ مسارٍ بفعله (ق-١٦٤١/٢)', async () => {
    const template = await http()
      .post('/templates')
      .set('Authorization', bearer(a.token))
      .send({ name: `محرّر النماذج ${stamp}`, isAllScreens: false, allowedScreens: ['forms'], screenActions: { forms: ['view', 'add', 'edit'] } })
      .expect(201);
    const username = `forms-editor-${stamp}`;
    await http()
      .post('/company-users')
      .set('Authorization', bearer(a.token))
      .send({ name: 'محرّر النماذج', username, password: 'FormsEdit123!', permissionTemplateId: template.body.id })
      .expect(201);
    const editor = (await http().post('/auth/login').send({ username, password: 'FormsEdit123!' }).expect(200)).body.accessToken as string;

    // «إضافة» تنسخ (من المنشور بعد ④)، و«تعديل» يحرّر المسوّدة.
    const made = await http().post('/form-templates/copy').set('Authorization', bearer(editor)).send({ sourceTemplateId: v2Id, name: 'نسخةُ المحرّر' }).expect(201);
    await http()
      .patch(`/form-templates/${made.body.id}`)
      .set('Authorization', bearer(editor))
      .send({ items: [...ITEMS, { label: 'حالةُ الأبواب', itemType: 'CONDITION' }] })
      .expect(200);
    // ولا «مراجعة» فلا ينشر، ولا «حذف» فلا يحذف — والرفضُ يسمّي الفعلَ لا «للمالك وحدَه».
    const unpublished = await http().post(`/form-templates/${made.body.id}/publish`).set('Authorization', bearer(editor)).expect(403);
    expect(unpublished.body.message).not.toContain('المالك');
    await http().delete(`/form-templates/${made.body.id}`).set('Authorization', bearer(editor)).expect(403);
    // والموظّفُ بلا الشاشة ما زال يُردّ، والمالكُ يملكها كلَّها فيحذف المسوّدة.
    await http().patch(`/form-templates/${made.body.id}`).set('Authorization', bearer(employeeToken)).send({ name: 'لا' }).expect(403);
    await http().delete(`/form-templates/${made.body.id}`).set('Authorization', bearer(a.token)).expect(204);
  });
});
