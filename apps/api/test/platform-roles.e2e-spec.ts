import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformRole } from '@mad-app/db';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (`ق-١٢٨٥`) — **ثلاثةُ أضعاف المقيس لا رقمٌ مختار**: `75.6 s` على القاعدة
//    النظيفة، **وجُلُّها في `beforeAll`** (تركيبُ `AppModule` ثم **خمسةُ مديرين بخمس تهشيرات
//    `argon2`** — وهي بطيئةٌ بتصميمها). ⇒ `73 × 3 ≈ 219` فـ`220000`.
jest.setTimeout(220000);

/**
 * **الأدوارُ الداخلية وفصلُها** (`ق-١٣١٢` · ⑪A2 — باب `⑪ تشغيلُ المنصّة`).
 *
 * العلّةُ بنصّ المسح: «دورٌ واحدٌ يرى كلَّ شيءٍ ويفعل كلَّ شيء: **أوّلُ موظفِ دعمٍ يُعيَّن
 * يرث صلاحيةَ المالك — وما رآه أو فعله لا يُستردّ**».
 *
 * فالمصفوفةُ تُقاس **بابَين اثنين لكلِّ دور**: بابُه يُفتح، وبابُ غيره يُردّ `403` —
 * **فإذنٌ يُثبت وحدَه لا يشهد بفصل**.
 */
describe('أدوارُ مديري المنصّة (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`.slice(-9);
  const PASSWORD = 'RolePass123!';
  const tokens: Partial<Record<PlatformRole, string>> = {};
  const createdIdentityIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (role: PlatformRole) => `Bearer ${tokens[role]}`;

  /** مديرُ منصّةٍ بدورٍ معلوم — **من صنع الحزمة**، فلا تعتمد على ما تركته البذرة (`ق-٦٥٩`). */
  async function makeAdmin(role: PlatformRole): Promise<void> {
    const username = `plat-${role.toLowerCase()}-${suffix}`;
    const identity = await prisma.loginIdentity.create({
      data: { username, passwordHash: await argon2.hash(PASSWORD), actorType: 'PLATFORM_ADMIN' },
      select: { id: true },
    });
    createdIdentityIds.push(identity.id);
    await prisma.platformAdmin.create({ data: { loginIdentityId: identity.id, displayName: `اختبار ${role}`, role } });
    const login = await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200);
    tokens[role] = login.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    for (const role of [PlatformRole.OWNER, PlatformRole.SUPPORT, PlatformRole.FINANCE, PlatformRole.OPERATIONS, PlatformRole.COMPLIANCE]) {
      await makeAdmin(role);
    }
  });

  afterAll(async () => {
    // القراراتُ تشير إلى المديرَين بـ`Restrict` (`ق-١٣١٨`) — فتُزال قبلهما.
    await prisma.platformDecision.deleteMany({ where: { summary: { contains: suffix } } });
    // An administrator with rows in the platform audit log cannot be deleted (Restrict): the trail keeps them.
    for (const id of createdIdentityIds) await prisma.loginIdentity.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('⭐ ① المالكُ يمرّ من كلِّ باب — ولا أحدَ يفقد ما كان يملكه', async () => {
    await http().get('/companies').set('Authorization', as(PlatformRole.OWNER)).expect(200);
    await http().get('/admin/deletion-requests').set('Authorization', as(PlatformRole.OWNER)).expect(200);
    await http().get('/support-access/admin').set('Authorization', as(PlatformRole.OWNER)).expect(200);
    await http().get('/admin/processing-agreement').set('Authorization', as(PlatformRole.OWNER)).expect(200);
  });

  it('🔴 ② والدعمُ لا يمحو حساباً ولا يرى الحسابات — بابُه الدخولُ بموافقة التاجر وحدَه', async () => {
    await http().get('/support-access/admin').set('Authorization', as(PlatformRole.SUPPORT)).expect(200);
    const denied = await http().get('/admin/deletion-requests').set('Authorization', as(PlatformRole.SUPPORT)).expect(403);
    expect(String(denied.body.message)).toContain('الدعم الفني');
    await http().get('/companies').set('Authorization', as(PlatformRole.SUPPORT)).expect(403);
  });

  it('🔴 ③ والامتثالُ يقرّر الحذفَ وينشر البنود — ولا يدخل حساب تاجر', async () => {
    await http().get('/admin/deletion-requests').set('Authorization', as(PlatformRole.COMPLIANCE)).expect(200);
    await http().get('/admin/processing-agreement').set('Authorization', as(PlatformRole.COMPLIANCE)).expect(200);
    await http().get('/support-access/admin').set('Authorization', as(PlatformRole.COMPLIANCE)).expect(403);
  });

  it('🔴 ④ والتشغيلُ والماليةُ يريان الحسابات ولا يمحوان بياناتٍ', async () => {
    await http().get('/companies').set('Authorization', as(PlatformRole.OPERATIONS)).expect(200);
    await http().get('/companies').set('Authorization', as(PlatformRole.FINANCE)).expect(200);
    await http().get('/admin/deletion-requests').set('Authorization', as(PlatformRole.OPERATIONS)).expect(403);
    await http().get('/admin/deletion-requests').set('Authorization', as(PlatformRole.FINANCE)).expect(403);
  });

  /**
   * 🔴 **والاشتراكُ للمالية وحدَها** (`ق-١٣١٧`): مالٌ يُحصَّل ويُردّ، **والتشغيلُ يخصّ
   * الخادمَ والنسخ لا المال** — **وفصلُهما غرضُ الأدوار أصلاً**.
   */
  it('🔴 ⑦ والاشتراكُ للمالية وحدَها — والتشغيلُ يعدّل الاسمَ ولا يمدّ اشتراكاً', async () => {
    const target = await registerIsolatedCompany(app, 'roles-sub');
    try {
      const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      // التشغيلُ يعدّل حسابَ المنشأة نفسَه.
      await http().patch(`/companies/${target.companyId}`).set('Authorization', as(PlatformRole.OPERATIONS)).send({ orgName: `منشأةٌ مُعاد تسميتُها ${suffix}` }).expect(200);
      // **ولا يمدّ اشتراكاً** — والمسارُ نفسُه يقبل المالية.
      // ⚠️ **والدورُ يُفحص قبل اليدين**: يُردّ `403` بلا قرارٍ أصلاً — فالرفضُ عن الدور لا عن نقصِ إقرار.
      const denied = await http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as(PlatformRole.OPERATIONS)).send({ subEnd: nextYear }).expect(403);
      expect(String(denied.body.message)).toContain('التشغيل');
      // ⑪A1 (`ق-١٣١٨`): والماليةُ تمدّه **بيدين** — طلبٌ من المالية وإقرارٌ من الامتثال.
      const asked = await http()
        .post('/admin/decisions')
        .set('Authorization', as(PlatformRole.FINANCE))
        .send({ action: 'SUBSCRIPTION_CHANGE', targetId: target.companyId, summary: `تمديدُ اشتراكٍ للاختبار ${suffix}`, subEnd: nextYear })
        .expect(201);
      await http().post(`/admin/decisions/${asked.body.id}/approve`).set('Authorization', as(PlatformRole.COMPLIANCE)).expect(201);
      await http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as(PlatformRole.FINANCE)).send({ subEnd: nextYear }).expect(200);
      // ⚠️ **والحقلُ لا يعود من الباب الخلفيّ**: إرسالُه على المسار العامّ يُردّ باسمه.
      const back = await http().patch(`/companies/${target.companyId}`).set('Authorization', as(PlatformRole.OWNER)).send({ subEnd: nextYear }).expect(400);
      expect(JSON.stringify(back.body)).toContain('subEnd');
    } finally {
      await removeIsolatedCompany(app, target);
    }
  });

  it('🔴 ⑤ والدورُ يُقرأ حيّاً — سحبُه ينفذ في الطلب التالي بلا انتظار انتهاء الرمز', async () => {
    const admin = await prisma.platformAdmin.findFirstOrThrow({
      where: { displayName: `اختبار ${PlatformRole.SUPPORT}`, loginIdentity: { username: `plat-${PlatformRole.SUPPORT.toLowerCase()}-${suffix}` } },
      select: { id: true },
    });
    await http().get('/support-access/admin').set('Authorization', as(PlatformRole.SUPPORT)).expect(200);
    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { role: PlatformRole.FINANCE } });
    // **الرمزُ نفسُه** — ولم يُعد الدخول.
    await http().get('/support-access/admin').set('Authorization', as(PlatformRole.SUPPORT)).expect(403);
    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { role: PlatformRole.SUPPORT } });
  });

  it('⑥ وفاعلُ المنشأة يُردّ من مسارات المنصّة كما كان — الدورُ يضيّق ولا يفتح', async () => {
    // ⚠️ **منشأةٌ من صنع الحزمة لا منشأةُ البذرة** (`ق-٦٥٩`): أوّلُ صياغةٍ قرأت `demo-company-a`
    //    **وانسحبت بصمتٍ إن غابت** — فأدانها حارسُ التخطّي الصامت (`ق-٢٦٨`)، وهو محقّ:
    //    حزمةٌ تنسحب على قاعدةٍ بلا بذرةٍ تُقرأ خضراء ولم تقس شيئاً.
    const merchant = await registerIsolatedCompany(app, 'roles-merchant');
    try {
      await http().get('/companies').set('Authorization', `Bearer ${merchant.token}`).expect(403);
      await http().get('/admin/deletion-requests').set('Authorization', `Bearer ${merchant.token}`).expect(403);
    } finally {
      await removeIsolatedCompany(app, merchant);
    }
  });
});
