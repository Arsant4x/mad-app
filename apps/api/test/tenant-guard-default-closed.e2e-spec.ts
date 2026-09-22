import { Controller, Get, INestApplication, Module, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { MSG, translate } from '../src/common/i18n/messages';
import { OwnerOnly } from '../src/common/tenant/owner-only.decorator';
import { TenantWide } from '../src/common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../src/common/tenant/tenant.guard';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (26.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(80000);

/**
 * **`TenantGuard` مغلقٌ افتراضياً — مسارٌ لا يُعلن نفسَه يُرفض** (`ق-١١٩٨`/①).
 *
 * ── ما كان ───────────────────────────────────────────────────────────────
 *
 * المراجعةُ الخارجية: «رفضٌ افتراضيٌّ لمتحكّمٍ بلا وسم — أيُّ موظفٍ يغيّر سعرَ الصرف
 * والرقمَ الضريبيَّ ومستودعَ الفرع». **والقياسُ قبل الإصلاح**: الأثرُ المسمّى **لا يقع** —
 * خدماتُ الثلاثة تفحص `assertIsCompanyOwner` فيُردّ الموظّفُ `403` (الحالاتُ ④–⑥ هنا مرّت
 * قبل الإصلاح وبعده). **والآليةُ تقع**: الحارسُ كان يمرّر أيَّ مسارٍ بلا وسمٍ إلى خدمته
 * (الحالةُ ① سقطت على الشيفرة القديمة بـ`200`)، وثلاثةَ عشرَ متحكّماً (`108` مساراً) كانت
 * بلا وسمٍ تعتمد على ذاكرة خدماتها؛ **وواحدٌ منها لم يتذكّر**: تعيينُ النشاط الرئيسي
 * (`PATCH /activities/primary`) كان بلا فحصٍ للفاعل — الحالةُ ⑦.
 *
 * ── ما صار ───────────────────────────────────────────────────────────────
 *
 * مسارٌ بلا `@RequiresScreen` ولا `@OwnerOnly` ولا `@TenantWide('سبب')` ولا `@SupportShell`
 * يُردّ `403` بـ`screen_undeclared` **قبل أن يبلغ الخدمة**؛ و`@OwnerOnly` يُنفَذ في الحارس.
 * الثلاثةُ المسبارية أدناه متحكّماتُ اختبارٍ تُركَّب مع `AppModule` — لا في الشيفرة.
 */
@Controller('probe-bare')
@UseGuards(JwtAuthGuard, TenantGuard)
class ProbeBareController {
  @Get()
  read() {
    return { ok: true, kind: 'bare' };
  }
}

@Controller('probe-wide')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('مسبارُ اختبارٍ مفتوحٌ لكلّ فاعلٍ بإعلانٍ صريحٍ وسببٍ مكتوب')
class ProbeWideController {
  @Get()
  read() {
    return { ok: true, kind: 'wide' };
  }
}

@Controller('probe-owner')
@UseGuards(JwtAuthGuard, TenantGuard)
class ProbeOwnerController {
  @Post()
  @OwnerOnly()
  write() {
    return { ok: true, kind: 'owner' };
  }
}

@Module({ controllers: [ProbeBareController, ProbeWideController, ProbeOwnerController] })
class ProbeModule {}

describe('TenantGuard مغلقٌ افتراضياً — الإعلانُ أو الرفض (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let ownerToken: string;
  let employeeToken: string;
  let branchId: string;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${ownerToken}`);
  const asEmployee = (r: request.Test) => r.set('Authorization', `Bearer ${employeeToken}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'guard-closed');
    ownerToken = company.token;

    // موظّفٌ بقالبٍ لا يمنح إلا لوحة التحكم — الأضيقُ الممكن.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const template = await asOwner(http().post('/templates'))
      .send({ name: `قالب ضيق ${suffix}`, isAllScreens: false, allowedScreens: ['dashboard'] })
      .expect(201);
    const username = `guard-emp-${suffix}`;
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظف مسبار', username, password: 'ProbePass123!', permissionTemplateId: template.body.id })
      .expect(201);
    employeeToken = (await http().post('/auth/login').send({ username, password: 'ProbePass123!' }).expect(200)).body.accessToken;
    branchId = (await asOwner(http().post('/branches')).send({ name: `فرع المسبار ${suffix}` }).expect(201)).body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('🔴 ① مسارٌ بلا إعلانٍ يُرفض لكلّ فاعل — للمالك والموظّف معاً، وبالسبب المسمّى', async () => {
    const employee = await asEmployee(http().get('/probe-bare')).expect(403);
    expect(employee.body.message).toBe(translate(MSG.screen_undeclared, 'ar'));
    await asOwner(http().get('/probe-bare')).expect(403);
  });

  it('② المعلَنُ لكلّ فاعلٍ يمرّ بالموظّف — والإعلانُ هو الفرق لا شيءَ غيره', async () => {
    const res = await asEmployee(http().get('/probe-wide')).expect(200);
    expect(res.body).toEqual({ ok: true, kind: 'wide' });
  });

  it('③ @OwnerOnly يُنفَذ في الحارس: الموظّفُ 403 برسالة المالك، والمالكُ يمرّ', async () => {
    const refused = await asEmployee(http().post('/probe-owner')).expect(403);
    expect(refused.body.message).toBe(translate(MSG.owner_only, 'ar'));
    await asOwner(http().post('/probe-owner')).expect(201);
  });

  it('④ الأثرُ الذي سمّته المراجعة لا يقع: سعرُ الصرف — الموظّفُ 403 والمالكُ يمرّ', async () => {
    await asEmployee(http().post('/currencies/rates')).send({ fromCode: 'USD', toCode: 'SAR', rate: 3.75, date: '2026-09-20' }).expect(403);
    await asEmployee(http().get('/currencies')).expect(200);
  });

  it('⑤ الرقمُ الضريبي — الموظّفُ يقرأ الملفَّ ولا يعدّله', async () => {
    await asEmployee(http().get('/company-profile')).expect(200);
    await asEmployee(http().patch('/company-profile')).send({ vatNumber: '300000000000003' }).expect(403);
  });

  it('⑥ مستودعُ الفرع — الموظّفُ يقرأ الفروعَ ولا يعدّلها', async () => {
    await asEmployee(http().get('/branches')).expect(200);
    await asEmployee(http().patch(`/branches/${branchId}`)).send({ name: 'محاولة موظف' }).expect(403);
  });

  it('🔴 ⑦ ما كان بلا فحصٍ فعلاً: تعيينُ النشاط الرئيسي — كان يمرّ بالموظّف (200)، وصار 403 من الحارس', async () => {
    const refused = await asEmployee(http().patch('/activities/primary')).send({ activityId: null, confirmed: true }).expect(403);
    expect(refused.body.message).toBe(translate(MSG.owner_only, 'ar'));
    await asOwner(http().patch('/activities/primary')).send({ activityId: null, confirmed: true }).expect(200);
  });
});
