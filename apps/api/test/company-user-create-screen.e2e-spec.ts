import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة: منشأةٌ معزولة وموظّفان — ثلاثةُ أضعاف ما يلزم عادةً.
jest.setTimeout(60000);

/**
 * ⚖️ **حفظُ موظّفٍ جديد من الشاشة** (توجيه ٢٧٥ · القاعدةُ الدائمة ٣٧ · المسح ٣٣ الخطر ٢).
 *
 * نافذةُ «حساب موظّف جديد» (`apps/web/src/pages/companyUsers/CompanyUserModal.tsx`) ترسل عند الإنشاء
 * `canEditMasterData` منذ 2026-08-07، ونموذجُ الإنشاء في الخادم لا يعرفه (التعديلُ وحدَه يعرفه)، والمرشّحُ
 * العامّ يرفض كلَّ حقلٍ مجهول (`forbidNonWhitelisted`). فكان المتوقَّع من القراءة أن يُرفض كلُّ حفظٍ من الشاشة.
 * **والحالةُ ترسل ما ترسله النافذةُ حرفاً** (الاسم · الدخول · كلمة المرور · القالب · العلَمان)، فتقيس الشاشةَ لا
 * نموذجاً مختصراً منها.
 */
describe('حفظُ موظّفٍ جديد بما ترسله الشاشة (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const owner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let templateId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'cu-screen');
    const templates = (await owner(http().get('/templates')).expect(200)).body as { id: string; isSystem: boolean }[];
    const usable = templates.find((t) => !t.isSystem);
    if (!usable) throw new Error('لا قالبَ غيرُ نظاميٍّ تراه المنشأة، والنافذةُ تختار أوّلَه');
    templateId = usable.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  /** جسمُ النافذة بنصّه: منشأةٌ بلا فروع فلا `branchIds`، والعلَمان يُرسلان دائماً. */
  const screenPayload = (username: string, canEditMasterData: boolean) => ({
    name: `موظّف ${username}`,
    username,
    password: 'ScreenPass123!',
    permissionTemplateId: templateId,
    canEditMasterData,
    allBranches: false,
  });

  it('🔴 النافذةُ بعلَم الاستثناء مطفأً (افتراضُها): يُحفظ الموظّف', async () => {
    const res = await owner(http().post('/company-users')).send(screenPayload(`cu-off-${suffix}`, false)).expect(201);
    expect(res.body.canEditMasterData).toBe(false);
  });

  it('🔴 وبعلَم الاستثناء مفعَّلاً: يُحفظ الموظّف والعلَمُ معه، لا يُرمى ولا يُتجاهل', async () => {
    const res = await owner(http().post('/company-users')).send(screenPayload(`cu-on-${suffix}`, true)).expect(201);
    expect(res.body.canEditMasterData).toBe(true);
    const listed = (await owner(http().get('/company-users')).expect(200)).body as { id: string; canEditMasterData: boolean }[] | { items: { id: string; canEditMasterData: boolean }[] };
    const rows = Array.isArray(listed) ? listed : listed.items;
    expect(rows.find((u) => u.id === res.body.id)?.canEditMasterData).toBe(true);
  });
});
