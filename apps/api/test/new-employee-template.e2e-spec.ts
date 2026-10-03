import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): تقديرٌ أوّلٌ قبل أن تُقاس، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيسٍ في السير.
jest.setTimeout(120000);

/**
 * ⚖️ **الموظّفُ الجديد يبدأ بلا شاشات، وقالبُه يُقصّ بقالب منشأته** (توجيه ٢٧٦ · `ق-١٦٠١` · `ق-١٦٠٩`/ج، بحكم صاحب المشروع).
 *
 * «قالبٌ «بلا شاشات» اختيارٌ مسبق · ويجوز إعطاؤه الشاملَ باختيارٍ صريح · وقالبُ الموظّف يُقصّ بقالب المنشأة · وصاحبُ المنشأة شاملٌ
 * في المسارين · والقالبُ العامّ الشامل يُحمى · والقائمون لا يُمسّون · واختبارٌ يحرس الافتراض.»
 *
 * كان الموظّفُ الجديد يأخذ «المستخدم الأول (شامل)» لأنه أوّلُ القائمة، وقالبُه يحلّ محلَّ قالب منشأته فيرى ما لا تراه، ولوحةُ المدير
 * تقبل للمالك قالباً أضيق، والقالبُ العامّ الشامل يُضيَّق أو يُحذف فيوقف التسجيلَ الذاتيَّ كلَّه (المسح ٣٣).
 */
interface Template {
  id: string;
  companyId: string | null;
  isSystem: boolean;
  isAllScreens: boolean;
  allowedScreens: string[];
  isNewUserDefault?: boolean;
}

describe('⚖️ الموظّفُ الجديد بلا شاشات، وقالبُه يُقصّ بقالب منشأته (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let adminToken: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const madeCompanies: string[] = [];
  let narrowId: string | null = null;

  const http = () => request(app.getHttpServer());
  const owner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'new-employee');
    adminToken = (
      await http().post('/auth/login').send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
    ).body.accessToken;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    for (const id of madeCompanies) await hardDeleteCompanyForTest(prisma, id);
    if (narrowId) await tenantPrisma.runAsPlatformAdmin((tx) => tx.permissionTemplate.delete({ where: { id: narrowId! } }));
    await app.close();
  });

  const templates = async (): Promise<Template[]> => (await owner(http().get('/templates')).expect(200)).body as Template[];
  const noScreens = async () => {
    const t = (await templates()).find((x) => x.companyId === null && x.isNewUserDefault === true);
    if (!t) throw new Error('القالبُ العامّ «بلا شاشات» غائبٌ عن قائمة المنشأة');
    return t;
  };
  const fullTemplate = async () => {
    const t = (await templates()).find((x) => x.companyId === null && !x.isSystem && x.isAllScreens);
    if (!t) throw new Error('القالبُ العامّ الشامل غائب');
    return t;
  };

  async function employeeToken(templateId: string, tag: string): Promise<string> {
    const username = `emp-${tag}-${suffix}`;
    await owner(http().post('/company-users')).send({ name: `موظّف ${tag}`, username, password: 'EmpPass123!', permissionTemplateId: templateId }).expect(201);
    // الدخولُ يردّ 200 لا 201 (مقروءٌ من سقوط أوّل تشغيلٍ في السير، ومن platform-admin.e2e-spec).
    return (await http().post('/auth/login').send({ username, password: 'EmpPass123!' }).expect(200)).body.accessToken as string;
  }
  const grantsOf = async (token: string): Promise<string[]> =>
    (await http().get('/me/permissions').set('Authorization', `Bearer ${token}`).expect(200)).body.grants as string[];

  it('① قالبٌ عامٌّ «بلا شاشات» قائمٌ معلَنٌ اختياراً مسبقاً للموظّف الجديد — والموظّفُ عليه لا يرى شيئاً', async () => {
    const t = await noScreens();
    expect(t.isAllScreens).toBe(false);
    expect(t.allowedScreens).toEqual([]);
    expect(t.isSystem).toBe(false);
    const token = await employeeToken(t.id, 'none');
    expect(await grantsOf(token)).toEqual([]);
    await http().get('/invoices').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('② ويجوز إعطاؤه الشاملَ باختيارٍ صريح — فلا منعَ في الخادم', async () => {
    const token = await employeeToken((await fullTemplate()).id, 'full');
    await http().get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('③ قالبُ الموظّف يُقصّ بقالب منشأته: الشاملُ على منشأةٍ قالبُها الفواتيرُ وحدَها لا يرى غيرَها', async () => {
    // منشأةٌ قائمةٌ على قالبٍ أضيق (ركّبها المديرُ قبل هذا الحكم) — يُصنع القالبُ ويُركَّب بمسنَد الإدارة.
    const narrow = await tenantPrisma.runAsPlatformAdmin((tx) =>
      tx.permissionTemplate.create({ data: { name: `فواتير فقط ${suffix}`, companyId: null, isAllScreens: false, allowedScreens: ['invoices'] } }),
    );
    narrowId = narrow.id;
    const token = await employeeToken((await fullTemplate()).id, 'clipped');
    await prisma.company.update({ where: { id: company.companyId }, data: { permissionTemplateId: narrow.id } });
    try {
      await http().get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
      await http().get('/customers').set('Authorization', `Bearer ${token}`).expect(403);
      const grants = await grantsOf(token);
      expect(grants.length).toBeGreaterThan(0);
      expect(grants.every((g) => g.startsWith('invoices:'))).toBe(true);
    } finally {
      await prisma.company.update({ where: { id: company.companyId }, data: { permissionTemplateId: (await fullTemplate()).id } });
    }
  });

  it('④ صاحبُ المنشأة شاملٌ في المسارين: لوحةُ المدير ترفض قالباً غيرَ شامل للمنشأة إنشاءً وتغييراً', async () => {
    const narrow = narrowId ?? (await tenantPrisma.runAsPlatformAdmin((tx) => tx.permissionTemplate.create({ data: { name: `ضيّق ${suffix}`, companyId: null, isAllScreens: false, allowedScreens: ['invoices'] } }))).id;
    narrowId = narrow;
    const body = (tag: string, permissionTemplateId: string) => ({ username: `own-${tag}-${suffix}`, password: 'OwnPass123!', orgName: `منشأة ${tag} ${suffix}`, permissionTemplateId, subEnd: '2030-01-01' });
    const refused = await admin(http().post('/companies')).send(body('narrow', narrow));
    if (refused.status === 201) madeCompanies.push(refused.body.id);
    expect(refused.status).toBe(400);
    const created = await admin(http().post('/companies')).send(body('full', (await fullTemplate()).id)).expect(201);
    madeCompanies.push(created.body.id);
    await admin(http().patch(`/companies/${created.body.id}`)).send({ permissionTemplateId: narrow }).expect(400);
  });

  it('⑤ القالبُ العامّ الشامل والقالبُ «بلا شاشات» يُحميان: لا يُضيَّق الأوّل ولا يُوسَّع الثاني ولا يُحذف أحدُهما', async () => {
    const full = await fullTemplate();
    const none = await noScreens();
    try {
      await admin(http().patch(`/templates/${full.id}`)).send({ isAllScreens: false, allowedScreens: ['invoices'] }).expect(403);
      await admin(http().delete(`/templates/${full.id}`)).expect(403);
      await admin(http().patch(`/templates/${none.id}`)).send({ allowedScreens: ['invoices'] }).expect(403);
      await admin(http().delete(`/templates/${none.id}`)).expect(403);
      // وما زالا كما كانا.
      expect((await fullTemplate()).isAllScreens).toBe(true);
      expect((await noScreens()).allowedScreens).toEqual([]);
    } finally {
      // صمّامٌ للحزم بعدها: إن نفذ تضييقٌ (حمايةٌ مكسورة) يُعاد القالبان كما كانا، فلا يسقط التسجيلُ الذاتيّ في غير هذه الحزمة.
      await tenantPrisma.runAsPlatformAdmin(async (tx) => {
        await tx.permissionTemplate.update({ where: { id: full.id }, data: { isAllScreens: true, allowedScreens: [] } });
        await tx.permissionTemplate.update({ where: { id: none.id }, data: { isAllScreens: false, allowedScreens: [] } });
      });
    }
  });
});
