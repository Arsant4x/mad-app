import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

// ⏱️ ميزانيةُ الحزمة: منشأتان على الأكثر من لوحة المدير — ثلاثةُ أضعاف ما يلزم عادةً.
jest.setTimeout(60000);

/**
 * ⚖️ **قالبُ النظام لا يُركَّب عليه تاجر، ولا من لوحة المدير** (توجيه ٢٧٥ · القاعدةُ الدائمة ٣٧ · المسح ٣٣ الخطر ٤).
 *
 * `ق-٦٤٤` أغلقت ركوبَ المنشآت على قالب «المطوّر» في التسجيل الذاتي (وصحّحت `ق-٦٥١` ما سبق)، وبقي مسارُ المدير
 * (`companies.service.ts`) يفحص «عامٌّ» وحدَه، فيقبله في الإنشاء وفي تغيير قالب منشأةٍ قائمة. والحالتان تحاولانه
 * من البابين؛ **والضابطُ** إنشاءٌ على القالب العامّ الشامل يُقبل، فالرفضُ للقالب لا للمسار.
 */
describe('مسارُ المدير لا يركّب منشأةً على قالب النظام (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const made: string[] = [];
  const http = () => request(app.getHttpServer());
  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  let systemId: string;
  let fullId: string;

  const createBody = (tag: string, permissionTemplateId: string) => ({
    username: `sys-tpl-${tag}-${suffix}`,
    password: 'SysTpl12345!',
    orgName: `منشأة قالب ${tag} ${suffix}`,
    email: `sys-tpl-${tag}-${suffix}@example.com`,
    permissionTemplateId,
    subEnd: '2030-01-01',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    adminToken = (
      await http().post('/auth/login').send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
    ).body.accessToken;
    const templates = (await admin(http().get('/templates')).expect(200)).body as { id: string; isSystem: boolean; isAllScreens: boolean; companyId: string | null }[];
    const system = templates.find((t) => t.isSystem && t.companyId === null);
    const full = templates.find((t) => !t.isSystem && t.isAllScreens && t.companyId === null);
    if (!system || !full) throw new Error('القالبان المزروعان غائبان عن قائمة المدير');
    systemId = system.id;
    fullId = full.id;
  });

  afterAll(async () => {
    for (const id of made) await hardDeleteCompanyForTest(prisma, id);
    await app.close();
  });

  it('🔴 الإنشاءُ على قالب النظام يُرفض، ولا تولد منشأة', async () => {
    const body = createBody('create', systemId);
    const res = await admin(http().post('/companies')).send(body);
    if (res.status === 201) made.push(res.body.id);
    expect(res.status).toBe(403);
    expect(await prisma.loginIdentity.count({ where: { username: body.username } })).toBe(0);
  });

  it('🔴 وتغييرُ قالب منشأةٍ قائمة إلى قالب النظام يُرفض، وقالبُها باقٍ', async () => {
    // الضابط: الإنشاءُ على العامّ الشامل يُقبل من المسار نفسِه.
    const created = await admin(http().post('/companies')).send(createBody('update', fullId)).expect(201);
    made.push(created.body.id);

    await admin(http().patch(`/companies/${created.body.id}`)).send({ permissionTemplateId: systemId }).expect(403);

    const row = await prisma.company.findUnique({ where: { id: created.body.id }, select: { permissionTemplateId: true } });
    expect(row?.permissionTemplateId).toBe(fullId);
  });
});
