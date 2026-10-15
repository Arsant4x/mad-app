import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — يُكتب بعد أوّل تشغيل.
jest.setTimeout(120000);

/**
 * ⚖️ **إعدادُ توقيع النماذج** (توجيه ٢٨٧ ② و④ · `ق-١٦٣٣` ⑬ · `ق-١٦٣٥` ①). الجوابُ معروفٌ يداً:
 * ① منشأةٌ نسخت قالباً ترى نوعَه بسبعة أيّامٍ افتراضاً، والحدُّ فارغ · ② المالكُ يضبط المدّةَ عشرةً والحدَّ مئةَ ألف · ③ وتفريغُ الحدّ يمحوه
 * ④ الموظّفُ يقرأ ولا يكتب (`403`) — والقراءةُ لكلِّ فاعل · ⑤ نوعٌ ليس من أنواع قوالب المنشأة يُردّ `400` · ⑥ منشأةٌ أخرى لا ترى إعدادَ الأولى
 * ⑦ القاعدةُ ترفض مدّةً دون يوم وحدّاً سالباً (قيدا `CHECK`).
 */
describe('Form signing settings — period per type and identity threshold (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let ownerToken: string;
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  let employeeToken: string;
  let typeId: string;
  let otherTypeId: string;
  const typeIds: string[] = [];
  const familyIds: string[] = [];
  const stamp = `${Date.now()}`.slice(-8);
  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => `Bearer ${t}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    ownerToken = (
      await http()
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
    a = await registerIsolatedCompany(app, 'sign-set-a');
    b = await registerIsolatedCompany(app, 'sign-set-b');

    // نوعان عامّان، ولكلٍّ قالبٌ منشور؛ تنسخ «أ» الأوّلَ وحدَه.
    for (const code of [`SIGN_A${stamp}`, `SIGN_B${stamp}`]) {
      const type = await http().post('/admin/form-types').set('Authorization', bearer(ownerToken)).send({ code, name: `نوعُ ${code}` }).expect(201);
      typeIds.push(type.body.id);
      const tpl = await http()
        .post('/admin/form-templates')
        .set('Authorization', bearer(ownerToken))
        .send({ formTypeId: type.body.id, name: `قالبُ ${code}`, items: [{ label: 'عددُ المفاتيح', itemType: 'QTY' }] })
        .expect(201);
      familyIds.push(tpl.body.familyId);
      await http().post(`/admin/form-templates/${tpl.body.id}/publish`).set('Authorization', bearer(ownerToken)).expect(201);
      if (code.startsWith('SIGN_A')) await http().post('/form-templates/copy').set('Authorization', bearer(a.token)).send({ sourceTemplateId: tpl.body.id }).expect(201);
    }
    [typeId, otherTypeId] = typeIds;

    const templates = await http().get('/templates').set('Authorization', bearer(a.token)).expect(200);
    const list = (Array.isArray(templates.body) ? templates.body : templates.body.items) as { id: string; isNewUserDefault?: boolean }[];
    const noScreens = list.find((t) => t.isNewUserDefault);
    const username = `sign-set-emp-${stamp}`;
    await http()
      .post('/company-users')
      .set('Authorization', bearer(a.token))
      .send({ name: 'موظّفُ الإعداد', username, password: 'SignSet1234!', permissionTemplateId: noScreens!.id })
      .expect(201);
    employeeToken = (await http().post('/auth/login').send({ username, password: 'SignSet1234!' }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, a);
    await removeIsolatedCompany(app, b);
    await tenantPrisma.runAsPlatformAdmin(async (tx) => {
      await tx.formTemplate.deleteMany({ where: { familyId: { in: familyIds }, companyId: null } });
      await tx.formType.deleteMany({ where: { id: { in: typeIds } } });
    });
    await app.close();
  });

  it('① نوعُ القالب المنسوخ وحدَه بسبعة أيّامٍ افتراضاً، والحدُّ فارغ', async () => {
    const res = await http().get('/form-signing-settings').set('Authorization', bearer(a.token)).expect(200);
    expect(res.body.nafathThreshold).toBeNull();
    expect(res.body.defaultSignPeriodDays).toBe(7);
    expect(res.body.types).toEqual([expect.objectContaining({ formTypeId: typeId, signPeriodDays: 7, isDefault: true })]);
  });

  it('② المالكُ يضبط المدّةَ والحدّ — ③ وتفريغُ الحدّ يمحوه', async () => {
    const set = await http()
      .put('/form-signing-settings')
      .set('Authorization', bearer(a.token))
      .send({ nafathThreshold: 100000, periods: [{ formTypeId: typeId, signPeriodDays: 10 }] })
      .expect(200);
    expect(set.body.nafathThreshold).toBe('100000');
    expect(set.body.types).toEqual([expect.objectContaining({ formTypeId: typeId, signPeriodDays: 10, isDefault: false })]);
    const cleared = await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: null }).expect(200);
    expect(cleared.body.nafathThreshold).toBeNull();
    expect(cleared.body.types[0].signPeriodDays).toBe(10);
  });

  it('④ الموظّفُ يقرأ ولا يكتب', async () => {
    await http().get('/form-signing-settings').set('Authorization', bearer(employeeToken)).expect(200);
    await http().put('/form-signing-settings').set('Authorization', bearer(employeeToken)).send({ nafathThreshold: 1 }).expect(403);
    await http()
      .put('/form-signing-settings')
      .set('Authorization', bearer(employeeToken))
      .send({ periods: [{ formTypeId: typeId, signPeriodDays: 1 }] })
      .expect(403);
    const after = await http().get('/form-signing-settings').set('Authorization', bearer(a.token)).expect(200);
    expect(after.body.types[0].signPeriodDays).toBe(10);
    expect(after.body.nafathThreshold).toBeNull();
  });

  it('⑤ نوعٌ ليس من أنواع قوالب المنشأة يُردّ — ومدّةٌ دون يومٍ يردّها التحقّق', async () => {
    await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ periods: [{ formTypeId: otherTypeId, signPeriodDays: 3 }] }).expect(400);
    await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ periods: [{ formTypeId: typeId, signPeriodDays: 0 }] }).expect(400);
    await http().put('/form-signing-settings').set('Authorization', bearer(a.token)).send({ nafathThreshold: -1 }).expect(400);
  });

  it('⑥ منشأةٌ أخرى لا ترى إعدادَ الأولى', async () => {
    const res = await http().get('/form-signing-settings').set('Authorization', bearer(b.token)).expect(200);
    expect(res.body.types).toEqual([]);
    expect(res.body.nafathThreshold).toBeNull();
    const seen = await tenantPrisma.runInTenantContext(b.companyId, (tx) => tx.formTypeSetting.count());
    expect(seen).toBe(0);
  });

  it('⑦ القاعدةُ ترفض مدّةً دون يوم وحدّاً سالباً، ولو تجاوزت الكتابةُ التطبيق', async () => {
    const period = await tenantPrisma
      .runInTenantContext(a.companyId, (tx) => tx.$executeRaw`UPDATE "form_type_settings" SET "signPeriodDays" = 0 WHERE "formTypeId" = ${typeId}`)
      .catch((e: unknown) => e);
    expect(String((period as Error)?.message ?? period)).toContain('form_type_settings_period_positive');
    const threshold = await tenantPrisma
      .runInTenantContext(a.companyId, (tx) => tx.$executeRaw`UPDATE "companies" SET "formsNafathThreshold" = -1 WHERE "id" = ${a.companyId}`)
      .catch((e: unknown) => e);
    expect(String((threshold as Error)?.message ?? threshold)).toContain('companies_forms_nafath_threshold_nonnegative');
  });
});
