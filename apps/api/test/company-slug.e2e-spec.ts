import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (`ق-١٢٨٥`) — **ثلاثةُ أضعاف المقيس لا رقمٌ مختار**: الحزمةُ `38.2 s`
//    على القاعدة النظيفة، **وجُلُّها في `beforeAll`** (تركيبُ `AppModule` ثم منشأتان) —
//    مجموعُ توكيداتها السبعة `~2 s`. ⇒ `35 × 3 ≈ 105` فـ`110000`.
jest.setTimeout(110000);

/**
 * **معرّفُ النطاق الفرعيّ لا يُعاد استعمالُه** (`ق-١٣٠٣` · ك/⑬A2).
 *
 * ① المنشأةُ تبدأ بلا معرّف — **ولا يُخمَّن لها**.
 * ② والشكلُ يُفحص مُطبَّعاً: `Alfa ` تُقبل `alfa`، وما ليس معرّفاً يُردّ باسمه.
 * ③ **ومحجوزاتُ المنصّة لا تُمنح** (`www` · `api` …).
 * ④ ومعرّفُ منشأةٍ أخرى يُردّ مسمّىً.
 * ⑤ 🔴 **والمتروك لا يعود — ولا لصاحبه**: الاستبدالُ يحجز القديم.
 * ⑥ ولا يُمحى بعد اختياره — يُستبدل.
 * ⑦ والموظّفُ يقرأ ولا يكتب.
 *
 * ⚠️ **وقيدُ القاعدة يُثبَت في حارسه الحيّ** (`slug-constraint.live.spec.ts`) لا هنا —
 * **لا لأن هذه الحزمة تعجز عنه** بل لأن الحارسَ يُطابق الرفضَ **باسم القيد** ويقرأ نصَّه
 * من الكتالوج، وتوكيدٌ هنا على مجرّد «رُفض» **يمرّ على تعارض الفهرس الفريد كذلك**
 * (`§8.14`). **وحارسان على الحالة نفسِها كلفةٌ بلا عائد** (`§8.19`).
 */
describe('معرّفُ النطاق الفرعيّ (e2e)', () => {
  let app: INestApplication;
  let owner: IsolatedCompany;
  let other: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}`.slice(-8);
  const mine = `alfa-${suffix}`;
  const next = `beta-${suffix}`;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    owner = await registerIsolatedCompany(app, 'slug');
    token = owner.token;
    other = await registerIsolatedCompany(app, 'slug-other');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, other);
    await removeIsolatedCompany(app, owner);
    await app.close();
  });

  it('① تبدأ بلا معرّف — ولا يُخمَّن لها', async () => {
    const profile = await auth(http().get('/company-profile')).expect(200);
    expect(profile.body.slug).toBeNull();
  });

  it('⭐ ② الشكلُ يُفحص مُطبَّعاً — والخطأُ يُردّ باسمه', async () => {
    for (const bad of ['ab', '-abc', 'abc-', 'ABC_DEF', 'شركة', 'a'.repeat(41)]) {
      const res = await auth(http().patch('/company-profile')).send({ slug: bad }).expect(400);
      expect(String(res.body.message)).toContain('معرّف النطاق');
    }
    // `Alfa ` تُطبَّع إلى `alfa` — فالتاجرُ يكتب كما يقرأ.
    const ok = await auth(http().patch('/company-profile')).send({ slug: ` ${mine.toUpperCase()} ` }).expect(200);
    expect(ok.body.slug).toBe(mine);
  });

  it('🔴 ③ محجوزاتُ المنصّة لا تُمنح', async () => {
    for (const reserved of ['www', 'api', 'admin']) {
      const res = await auth(http().patch('/company-profile')).send({ slug: reserved }).expect(409);
      expect(String(res.body.message)).toContain('محجوز');
    }
    // ولم يتغيّر معرّفُها بمحاولةٍ مرفوضة.
    expect((await auth(http().get('/company-profile')).expect(200)).body.slug).toBe(mine);
  });

  it('🔴 ④ ومعرّفُ منشأةٍ أخرى يُردّ مسمّىً', async () => {
    const theirs = `gamma-${suffix}`;
    await request(app.getHttpServer()).patch('/company-profile').set('Authorization', `Bearer ${other.token}`).send({ slug: theirs }).expect(200);
    const res = await auth(http().patch('/company-profile')).send({ slug: theirs }).expect(409);
    expect(String(res.body.message)).toContain('مستخدَم');
  });

  it('🔴 ⑤ والمتروكُ لا يعود — ولا لصاحبه', async () => {
    await auth(http().patch('/company-profile')).send({ slug: next }).expect(200);
    const prisma = app.get(PrismaService);
    expect(await prisma.reservedSlug.findUnique({ where: { slug: mine } })).not.toBeNull();
    // ولا يعود لصاحبه — وهي الحالةُ التي تُغري بالاستثناء.
    const back = await auth(http().patch('/company-profile')).send({ slug: mine }).expect(409);
    expect(String(back.body.message)).toContain('محجوز');
    expect((await auth(http().get('/company-profile')).expect(200)).body.slug).toBe(next);
  });

  it('⑥ ولا يُمحى بعد اختياره — يُستبدل', async () => {
    const res = await auth(http().patch('/company-profile')).send({ slug: '' }).expect(400);
    expect(String(res.body.message)).toContain('لا يُمحى');
    expect((await auth(http().get('/company-profile')).expect(200)).body.slug).toBe(next);
  });

  it('⑦ والموظّفُ يقرأ ولا يكتب', async () => {
    const template = await auth(http().post('/templates')).send({ name: `قالبٌ ${suffix}`, isAllScreens: true }).expect(201);
    const username = `emp-slug-${suffix}`;
    await auth(http().post('/company-users')).send({ name: 'موظف', username, password: 'EmpPass1234!', permissionTemplateId: template.body.id }).expect(201);
    const employee = (await http().post('/auth/login').send({ username, password: 'EmpPass1234!' }).expect(200)).body.accessToken as string;
    const read = await http().get('/company-profile').set('Authorization', `Bearer ${employee}`).expect(200);
    expect(read.body.slug).toBe(next);
    await http().patch('/company-profile').set('Authorization', `Bearer ${employee}`).send({ slug: `emp-${suffix}` }).expect(403);
  });
});
