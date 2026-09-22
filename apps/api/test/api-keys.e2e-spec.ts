import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { applyApiVersioning } from '../src/common/versioning';
import { ISOLATED_PASSWORD, IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (67.7 ث في أوّل تشغيلٍ كامل) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(205000);

/**
 * **مفاتيحُ الأنظمة — الفاعلُ الخامس** (`ق-١٢٩١` · ي/⑫A3).
 *
 * ① المالكُ يُنشئ مفتاحاً بقالبٍ مضيَّق، **والرمزُ يُعطى مرّةً واحدة** ولا يعود في القائمة.
 * ② والمفتاحُ يعمل على ما يمنحه قالبُه — **وعلى البابين** (المحايد و`/v1`).
 * ③ **ويُردّ `403` على شاشةٍ خارج قالبه** — فهو موظّفٌ مقيَّد لا مالك.
 * ④ **ولا يُدير مفاتيحَ**: `/api-keys` للمالك وحدَه، فمفتاحٌ مسروق لا يُنشئ لنفسه أوسعَ منه.
 * ⑤ **والعزلُ يسري**: مفتاحُ منشأةٍ لا يرى صفوفَ أخرى (يُقرأ عدُّ عملائها لا أكثر).
 * ⑥ **والإبطالُ يسري من ساعته** — والصفُّ يبقى في القائمة مختوماً بتاريخه.
 * ⑦ **وقالبٌ يفتح كلَّ الشاشات يُردّ باسمه** — لا يُقبل صامتاً.
 */
describe('مفاتيحُ الأنظمة (e2e)', () => {
  let app: INestApplication;
  let owner: IsolatedCompany;
  let other: IsolatedCompany;
  let token: string;
  let templateId: string;
  let keyToken: string;
  let keyId: string;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const withKey = (r: request.Test) => r.set('X-Api-Key', keyToken);
  const suffix = `${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    applyApiVersioning(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    owner = await registerIsolatedCompany(app, 'api-keys');
    token = owner.token;
    other = await registerIsolatedCompany(app, 'api-keys-other');

    // قالبٌ مضيَّق: العملاءُ اطّلاعاً فقط — **الشاشةُ والفعلُ معاً**.
    const template = await auth(http().post('/templates'))
      .send({ name: `تكاملُ المتجر ${suffix}`, isAllScreens: false, allowedScreens: ['customers'], screenActions: { customers: ['view'] } })
      .expect(201);
    templateId = template.body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, other);
    await removeIsolatedCompany(app, owner);
    await app.close();
  });

  it('⭐ ① المالكُ يُنشئ مفتاحاً، والرمزُ مرّةً واحدة ولا يعود في القائمة', async () => {
    const created = await auth(http().post('/api-keys')).send({ name: `متجرٌ خارجيّ ${suffix}`, permissionTemplateId: templateId }).expect(201);
    expect(typeof created.body.token).toBe('string');
    expect(created.body.token.startsWith('mk_')).toBe(true);
    keyToken = created.body.token;
    keyId = created.body.id;

    const list = await auth(http().get('/api-keys')).expect(200);
    const row = (list.body as { id: string; token?: string; secretHash?: string; prefix: string }[]).find((k) => k.id === keyId);
    expect(row).toBeDefined();
    // **لا سرَّ ولا هاشَ في القائمة** — والبادئةُ وحدَها تُعرَض ليُميّز التاجرُ مفتاحَه.
    expect(row?.token).toBeUndefined();
    expect(row?.secretHash).toBeUndefined();
    expect(keyToken).toContain(row?.prefix as string);
  });

  it('⭐ ② يعمل على ما يمنحه قالبُه — وعلى البابين معاً', async () => {
    const neutral = await withKey(http().get('/customers')).expect(200);
    const versioned = await withKey(http().get('/v1/customers')).expect(200);
    expect(versioned.body).toEqual(neutral.body);
    // ورأسُ `Authorization: ApiKey …` كالرأس المخصَّص.
    await http().get('/customers').set('Authorization', `ApiKey ${keyToken}`).expect(200);
  });

  it('🔴 ③ ويُردّ على شاشةٍ خارج قالبه، وعلى فعلٍ لا يملكه — فهو مقيَّدٌ لا مالك', async () => {
    await withKey(http().get('/invoices')).expect(403);
    await withKey(http().post('/customers')).send({ kind: 'NATURAL', name: `عميلٌ بمفتاح ${suffix}` }).expect(403);
  });

  it('🔴 ④ ولا يُدير مفاتيحَ: `/api-keys` للمالك وحدَه', async () => {
    await withKey(http().get('/api-keys')).expect(403);
    await withKey(http().post('/api-keys')).send({ name: 'مفتاحٌ بمفتاح', permissionTemplateId: templateId }).expect(403);
  });

  it('🔴 ⑤ والعزلُ يسري: مفتاحُ منشأةٍ لا يرى عملاءَ أخرى', async () => {
    const mine = `عميلُ صاحبِ المفتاح ${suffix}`;
    await auth(http().post('/customers')).send({ kind: 'NATURAL', name: mine }).expect(201);
    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ kind: 'NATURAL', name: `عميلُ الأخرى ${suffix}` })
      .expect(201);

    const seen = (await withKey(http().get('/customers')).expect(200)).body as { name: string }[];
    expect(seen.some((c) => c.name === mine)).toBe(true);
    expect(seen.some((c) => c.name.includes('عميلُ الأخرى'))).toBe(false);
  });

  it('🔴 ⑥ والإبطالُ يسري من ساعته — والصفُّ يبقى مختوماً', async () => {
    await auth(http().post(`/api-keys/${keyId}/revoke`)).expect(201);
    await withKey(http().get('/customers')).expect(401);
    const list = (await auth(http().get('/api-keys')).expect(200)).body as { id: string; revokedAt: string | null }[];
    expect(list.find((k) => k.id === keyId)?.revokedAt).toBeTruthy();
  });

  it('🔴 ⑥-ب والإبطالُ يُنفَذ في **باب الهويّة** لا في حارس المستأجر وحدَه', async () => {
    /**
     * **حارسٌ مغطّىً لا يُثبَت إلا بتجاوز الغطاء** (`§8.18`).
     *
     * `TenantGuard` يفحص الإبطالَ أيضاً — فالمرحلةُ ⑥ تمرّ **بشهادة الغطاء**: أُثبت
     * بالعكس أن إزالةَ الفحص من `authenticate` **تُبقي الحزمةَ خضراء كلَّها**.
     *
     * 🔴 **والثقبُ حقيقيّ**: `/templates` يحمل `JwtAuthGuard` **بلا `TenantGuard`** —
     * فمفتاحٌ مُبطَل كان سيقرأ قوالبَ المنشأة. فالمرحلةُ تطرق ذلك البابَ بعينه.
     */
    await http().get('/templates').set('X-Api-Key', keyToken).expect(401);
  });

  it('⑦ وقالبٌ يفتح كلَّ الشاشات يُردّ باسمه، ورمزٌ ملفَّقٌ يُردّ ٤٠١', async () => {
    const wide = await auth(http().post('/templates')).send({ name: `مفتوحٌ ${suffix}`, isAllScreens: true }).expect(201);
    const rejected = await auth(http().post('/api-keys')).send({ name: `مفتاحٌ واسع ${suffix}`, permissionTemplateId: wide.body.id }).expect(400);
    expect(String(rejected.body.message)).toContain('كل الشاشات');
    await http().get('/customers').set('X-Api-Key', 'mk_0123456789abcdef_not-a-real-secret-value-at-all').expect(401);
    // ودخولُ صاحب المنشأة بكلمته لم يتغيّر — فالبابان منفصلان.
    await http().post('/auth/login').send({ username: owner.username, password: ISOLATED_PASSWORD }).expect(200);
  });

  it('⑧ والقالبُ يُقرأ حيّاً: تضييقُه يسري على المفتاح في الطلب التالي', async () => {
    const created = await auth(http().post('/api-keys')).send({ name: `مفتاحٌ حيّ ${suffix}`, permissionTemplateId: templateId }).expect(201);
    const live = created.body.token as string;
    await http().get('/customers').set('X-Api-Key', live).expect(200);
    await auth(http().patch(`/templates/${templateId}`)).send({ allowedScreens: ['banks'], screenActions: { banks: ['view'] } }).expect(200);
    await http().get('/customers').set('X-Api-Key', live).expect(403);
    // وتُعاد كما كانت كي لا تتأثّر مراحلُ أخرى لو أُعيد ترتيبها.
    await auth(http().patch(`/templates/${templateId}`)).send({ allowedScreens: ['customers'], screenActions: { customers: ['view'] } }).expect(200);
    await auth(http().post(`/api-keys/${created.body.id}/revoke`)).expect(201);
  });

  it('⑨ ولا يبقى صفٌّ للمنشأة بعد إزالتها — والجدولُ تحت عزل الصفوف', async () => {
    const tenantPrisma = app.get(TenantPrismaService);
    const mine = await tenantPrisma.runInTenantContext(owner.companyId, (tx) => tx.apiKey.count());
    expect(mine).toBeGreaterThan(0);
    const seenFromOther = await tenantPrisma.runInTenantContext(other.companyId, (tx) => tx.apiKey.count());
    expect(seenFromOther).toBe(0);
  });
});
