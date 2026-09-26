import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (49.7 ث على `mad_app_clean`) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(150000);

/**
 * 🔴 **مكسورُ اليوم (أ) — `ق-١٤١١`**: موظّفٌ مقيَّدٌ بفرعٍ كان يعدّل **صندوقَ فرعٍ آخر ورصيدَه الافتتاحيّ**
 * وموظّفَ فرعٍ آخر **بالمعرّف** — لأن مساراتِ التعديل والأرشفة والحذف لا تمرّر فروعَ الفاعل، والخدمةُ تقرأ
 * الصفَّ بمعرّفه وحدَه. **والرصيدُ الافتتاحيّ يرحّل قيداً** — فالثغرةُ كتابةٌ في دفتر فرعٍ لا يراه الكاتب.
 *
 * **الحكم**: الصفُّ خارج فروع الفاعل **غيرُ موجودٍ له** — `404` كالقراءة (`employees.findOne`) لا `403`، فلا يُسرَّب
 * وجودُ مستندِ فرعٍ آخر. **وما هو للمنشأة كلِّها** (`branchId: null`) مرئيٌّ للجميع كما في القراءة (`branchFilter`).
 * **ومالكُ المنشأة يرى الفروعَ كلَّها** فلا يتغيّر عليه شيء — وحالةٌ موجبةٌ لكلِّ مسار تُثبت أن الصلاحيةَ نفسَها تعمل
 * وأن الرفضَ للفرع لا للفعل.
 */
describe('فروعُ الفاعل عند التعديل بالمعرّف — البنكُ والموظّف (ق-١٤١١)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let restrictedToken: string;
  const asRestricted = (r: request.Test) => r.set('Authorization', `Bearer ${restrictedToken}`);

  let northId: string;
  let southId: string;
  let bankNorth: string;
  let bankSouth: string;
  let employeeNorth: string;
  let employeeSouth: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'scope-byid');
    northId = (await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    southId = (await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body.id;

    // قالبٌ تملكه المنشأة بالشاشتين وأفعالهما كلِّها (بلا تفصيل = كلُّ الأفعال) — فالرفضُ لا يأتي من القالب.
    const template = await asOwner(http().post('/templates')).send({ name: `البنوك والموظفون ${suffix}`, allowedScreens: ['dashboard', 'banks', 'employees'] }).expect(201);
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظّف الشمال', username: `north-byid-${suffix}`, password: 'ScopePass123!', permissionTemplateId: template.body.id, branchIds: [northId] })
      .expect(201);
    // الدخولُ يردّ `200` لا `201` (`@HttpCode` على المسار — قُرئ بعد أن سقط افتراضُه في أوّل تشغيل).
    restrictedToken = (await http().post('/auth/login').send({ username: `north-byid-${suffix}`, password: 'ScopePass123!' }).expect(200)).body.accessToken;

    const bank = (name: string, branchId: string) =>
      asOwner(http().post('/banks')).send({ name, kind: 'CASH_BOX', openingBalance: 100, openingDate: '2026-01-01', branchId }).expect(201);
    bankNorth = (await bank(`صندوق الشمال ${suffix}`, northId)).body.id;
    bankSouth = (await bank(`صندوق الجنوب ${suffix}`, southId)).body.id;
    const employee = (fullName: string, branchId: string) => asOwner(http().post('/employees')).send({ fullName, hireDate: '2026-01-01', branchId }).expect(201);
    employeeNorth = (await employee(`موظّف الشمال ${suffix}`, northId)).body.id;
    employeeSouth = (await employee(`موظّف الجنوب ${suffix}`, southId)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.7] 🔴 تعديلُ صندوقِ فرعٍ آخر ورصيدِه الافتتاحيّ بالمعرّف — 404، ولا يتغيّر شيء', async () => {
    await asRestricted(http().patch(`/banks/${bankSouth}`)).send({ name: 'اسمٌ من فرعٍ آخر' }).expect(404);
    await asRestricted(http().patch(`/banks/${bankSouth}`)).send({ openingBalance: 999 }).expect(404);
    const south = (await asOwner(http().get('/banks')).expect(200)).body.find((b: { id: string }) => b.id === bankSouth);
    expect(south.name).toBe(`صندوق الجنوب ${suffix}`);
    expect(Number(south.openingBalance)).toBe(100);
  });

  it('[SPEC 2.7] 🔴 أرشفةُ صندوقِ فرعٍ آخر وحذفُه بالمعرّف — 404', async () => {
    await asRestricted(http().patch(`/banks/${bankSouth}/archive`)).send({ archived: true }).expect(404);
    await asRestricted(http().delete(`/banks/${bankSouth}`)).expect(404);
  });

  it('[SPEC 2.7] 🔴 تعديلُ موظّفِ فرعٍ آخر وأرشفتُه وحذفُه بالمعرّف — 404، ولا يتغيّر شيء', async () => {
    await asRestricted(http().patch(`/employees/${employeeSouth}`)).send({ jobTitle: 'من فرعٍ آخر' }).expect(404);
    await asRestricted(http().patch(`/employees/${employeeSouth}/archive`)).send({ archived: true }).expect(404);
    await asRestricted(http().delete(`/employees/${employeeSouth}`)).expect(404);
    const south = (await asOwner(http().get(`/employees/${employeeSouth}`)).expect(200)).body;
    expect(south.jobTitle ?? null).toBeNull();
    expect(south.archived).toBe(false);
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يعدّل صندوقَ فرعه وموظّفَه — فالرفضُ للفرع لا للفعل', async () => {
    await asRestricted(http().patch(`/banks/${bankNorth}`)).send({ name: `صندوق الشمال المعدَّل ${suffix}` }).expect(200);
    await asRestricted(http().patch(`/employees/${employeeNorth}`)).send({ jobTitle: 'أمين صندوق' }).expect(200);
  });

  it('[SPEC 2.7] والمالكُ يرى الفروعَ كلَّها — يعدّل صندوقَ الجنوب وموظّفَه', async () => {
    await asOwner(http().patch(`/banks/${bankSouth}`)).send({ name: `صندوق الجنوب المعدَّل ${suffix}` }).expect(200);
    await asOwner(http().patch(`/employees/${employeeSouth}`)).send({ jobTitle: 'محاسب' }).expect(200);
  });
});
