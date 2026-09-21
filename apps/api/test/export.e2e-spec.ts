import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
/**
 * ⚠️ **يُقرأ اسم المفتاح من مصدره لا يُكتب حرفياً.**
 *
 * كانت هذه الحالات تكتب `res.body.data.customers` — وهو اسم القائمة اليدوية
 * القديمة. ولمّا صار التصدير مشتقّاً من المخطط صارت المفاتيح **أسماء مندوبي
 * Prisma** (`customer` لا `customers`)، فسقطت الحالتان في السير بـ
 * `Cannot read properties of undefined (reading 'some')`.
 *
 * والاستيراد من `export-scope` يجعل الاختبار والشيفرة يقرآن **المصدر نفسه**،
 * فلا يفترقان صامتين مرّةً أخرى.
 */
import { delegateName } from '../src/export/export-scope';

/**
 * تصدير البيانات — نسخة التاجر من بياناته (النصف الآخر من «النسخ الاحتياطي»
 * بصيغة SaaS: التصدير ذاتي، أما الحذف فطلب يراجعه الدعم).
 *
 * What must hold: the owner gets one JSON document carrying its real records,
 * an employee cannot walk out with the whole database, and the file never
 * contains another company's rows.
 *
 * Both tenants are registered fresh instead of reusing the demo pair: /export
 * dumps the entire company, and on a dev database carrying residual rows from
 * other suites, exporting demo-company-a is slow enough to blow past timeouts
 * when the whole e2e suite runs. A fresh tenant keeps the export tiny and the
 * assertions independent of whatever other suites left behind.
 */
describe('Data export (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let tokenA: string;
  let tokenB: string;
  let empToken: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const markerName = `عميل التصدير ${suffix}`;
  let markerId: string;
  const cleanupCompanyIds: string[] = [];

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);

  async function registerCompany(username: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ orgName: `منشأة تصدير ${username}`, username, password: 'ExpPass123!', email: `${username}@example.com` })
      .expect(201);
    cleanupCompanyIds.push(res.body.user.companyId);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    adminToken = (
      await request(app.getHttpServer()).post('/auth/login').send({
        username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan',
        password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD,
      })
    ).body.accessToken;

    tokenA = await registerCompany(`exp-a-${suffix}`);
    tokenB = await registerCompany(`exp-b-${suffix}`);

    markerId = (await authA(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: markerName }).expect(201)).body.id;

    // An employee with every screen — proving the export refusal is about
    // ownership, not a missing screen permission.
    const templates = await authA(request(app.getHttpServer()).get('/templates')).expect(200);
    const tpl = (templates.body as { id: string; isAllScreens: boolean; isSystem: boolean }[]).find((t) => t.isAllScreens && !t.isSystem);
    const username = `exp-emp-${suffix}`;
    await authA(request(app.getHttpServer()).post('/company-users'))
      .send({ name: `موظف ${username}`, username, password: 'ExpPass123!', permissionTemplateId: tpl!.id })
      .expect(201);
    empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'ExpPass123!' })).body.accessToken;
  }, 60000);

  afterAll(async () => {
    // Deleting the companies cascades through employees, identities, and rows.
    // مسارُ المنصّة المباشر حُذف (`ق-٥٤٨`) — التنظيفُ بالمسلك نفسه عبر هويّة الدخول.
    const prisma = app.get(PrismaService);
    for (const id of cleanupCompanyIds) await hardDeleteCompanyForTest(prisma, id);
    await app.close();
  });

  it('hands the owner one document with its real records inside', async () => {
    const res = await authA(request(app.getHttpServer()).get('/export')).expect(200);
    expect(res.body.format).toBe('mad-app-export');
    expect(res.body.company.orgName).toBeTruthy();

    const customers = res.body.data[delegateName('Customer')] as { id: string; name: string }[];
    expect(customers).toBeDefined();
    expect(customers.some((c) => c.id === markerId && c.name === markerName)).toBe(true);
    // The big ledgers are present as collections, even if empty.
    for (const model of ['Account', 'Invoice', 'JournalEntry', 'Contract', 'Product']) {
      expect(Array.isArray(res.body.data[delegateName(model)])).toBe(true);
    }
  }, 60000);

  it('refuses an employee — full screens or not', async () => {
    await request(app.getHttpServer()).get('/export').set('Authorization', `Bearer ${empToken}`).expect(403);
  }, 60000);

  it("never carries another company's rows", async () => {
    const res = await request(app.getHttpServer()).get('/export').set('Authorization', `Bearer ${tokenB}`).expect(200);
    const customers = res.body.data[delegateName('Customer')] as { id: string }[];
    // ⚠️ **الوجود يُتحقَّق قبل الغياب.** مفتاحٌ غير موجود يجعل `some` تسقط —
    // وهو ما وقع فعلاً: تغيّرت أسماء المفاتيح فصار هذا التوكيد يقرأ `undefined`.
    // ولو كان مكتوباً `customers?.some(...)` **لمرّ خضراءَ بلا أن يفحص شيئاً**،
    // فيبدو عزلُ المستأجر مُثبَتاً وهو غير مفحوص أصلاً.
    expect(customers).toBeDefined();
    expect(customers.some((c) => c.id === markerId)).toBe(false);
  }, 60000);

  /**
   * 🔴 **النموذجان خارج قائمة العزل — بصفوفٍ حقيقيةٍ لمنشأةٍ أخرى** (2026-09-12).
   *
   * `Customer` في `TENANT_SCOPED_MODELS` فيُرشَّح بالامتداد — **والاختبارُ أعلاه كان
   * يمرّ عليه وحدَه**. أمّا `CompanyUser` و`PermissionTemplate` فليسا في القائمة ولا
   * سياسةَ عليهما، **فكانت حزمةُ المالك تحمل حساباتِ وقوالبَ كلّ المنشآت** (مقيسٌ:
   * ٢٠ و٢٠ لغيره على منشأة العرض). **والطُعمُ حقيقيّ** (`ق-٦٥٠`): موظفُ المنشأة «أ»
   * موجودٌ فعلاً — يظهر في حزمة «أ» ولا يظهر في حزمة «ب».
   */
  it('🔴 ولا حساباتِ ولا قوالبَ منشأةٍ أخرى — النموذجان اللذان لا يرشّحهما الامتداد', async () => {
    const empName = `موظف exp-emp-${suffix}`;
    const [a, b] = await Promise.all([
      authA(request(app.getHttpServer()).get('/export')).expect(200),
      request(app.getHttpServer()).get('/export').set('Authorization', `Bearer ${tokenB}`).expect(200),
    ]);
    const usersA = a.body.data[delegateName('CompanyUser')] as { name: string; companyId: string }[];
    const usersB = b.body.data[delegateName('CompanyUser')] as { name: string; companyId: string }[];
    const templatesB = b.body.data[delegateName('PermissionTemplate')] as { companyId: string | null }[];
    expect(usersA).toBeDefined();
    expect(usersB).toBeDefined();
    expect(templatesB).toBeDefined();

    // الوجودُ أولاً: موظفُ «أ» في حزمة «أ» — فالطُعمُ يصل.
    expect(usersA.some((u) => u.name === empName)).toBe(true);
    // ثم الغياب: لا يظهر في حزمة «ب»، **ولا أيُّ صفٍّ لمنشأةٍ غيرِ «ب» في النموذجين**.
    const companyB = (JSON.parse(Buffer.from(tokenB.split('.')[1], 'base64').toString()) as { companyId: string }).companyId;
    expect(usersB.some((u) => u.name === empName)).toBe(false);
    expect(usersB.every((u) => u.companyId === companyB)).toBe(true);
    expect(templatesB.every((t) => t.companyId === companyB)).toBe(true);
  }, 60000);

  /**
   * 🔴 **اسمُ دخول الحساب الفرعيّ في الحزمة — ولا هاشَ ولا رمزَ استعادة** (`ق-٦٧٢`).
   *
   * حزمةُ الإغلاق بُنيت لتُمكّن التاجر من الوفاء بحفظه (`ق-٥٥٤`)؛ **وحزمةٌ تُعيد
   * صلاحياتِ موظّفٍ بلا اسم دخوله لا تُمكّنه من شيء** — حقٌّ نظاميٌّ لا راحةُ استعمال.
   * والاسمُ يعيش في `login_identities` لا في صفّ الحساب، **فلم يظهر قطّ**.
   *
   * ⚠️ **والطُّعمُ الدائم على الجهة الأخرى**: هاشُ كلمة السرّ سرُّ مصادقةٍ — يُبحث عنه
   * في **نصّ الحزمة كلِّه** (المفتاحُ وبصمةُ `argon2`) لا في نموذجٍ بعينه.
   */
  it('🔴 يحمل اسمَ دخول الحساب الفرعيّ — ولا يحمل هاشاً ولا رمزَ استعادة في نصّه كلِّه', async () => {
    const res = await authA(request(app.getHttpServer()).get('/export')).expect(200);
    const users = res.body.data[delegateName('CompanyUser')] as { name: string; username?: string }[];
    const row = users.find((u) => u.name === `موظف exp-emp-${suffix}`);
    expect(row).toBeDefined();
    expect(row!.username).toBe(`exp-emp-${suffix}`);

    const text = JSON.stringify(res.body);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('$argon2');
    expect(text).not.toContain('tokenHash');
    expect(res.body.data[delegateName('LoginIdentity')]).toBeUndefined();
  }, 60000);
});
