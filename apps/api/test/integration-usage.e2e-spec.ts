import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { usagePeriod } from '../src/api-keys/integration-usage.service';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (55.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(170000);

/**
 * **قياسُ استعمال التكاملات وحصّتُه** (`ق-١٢٩١` · ي/㉑A1).
 *
 * ① كلُّ نداءٍ بمفتاحٍ صحيحٍ **يُعدّ** — بالشهر الجاري بتوقيت الرياض.
 * ② والحصّةُ `null` **بلا حدّ** — فلا رقمَ افتراضيّ يحبس تاجراً قبل أن تُحسم الباقات.
 * ③ وحين تُضبط: ما بعدها يُردّ `429` **برسالةٍ تحمل العدَّ والحصّة**.
 * ④ **والمردودُ معدود** — فلا تُشترى محاولاتٌ بتكرار المحاولة.
 * ⑤ ونداءٌ بمفتاحٍ ملفَّق **لا يُعدّ على أحد**.
 * ⑥ والعزلُ يسري: عدُّ منشأةٍ لا يُرى من أخرى.
 */
describe('قياسُ استعمال التكاملات (e2e)', () => {
  let app: INestApplication;
  let owner: IsolatedCompany;
  let other: IsolatedCompany;
  let token: string;
  let keyToken: string;
  const suffix = `${Date.now()}`;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const withKey = (r: request.Test) => r.set('X-Api-Key', keyToken);
  const setQuota = (companyId: string, quota: number | null) =>
    app.get(TenantPrismaService).runInTenantContext(companyId, (tx) => tx.company.update({ where: { id: companyId }, data: { apiMonthlyQuota: quota } }));
  const countOf = (companyId: string) =>
    app
      .get(TenantPrismaService)
      .runInTenantContext(companyId, (tx) => tx.integrationUsage.findFirst({ where: { kind: 'API_KEY', period: usagePeriod() }, select: { count: true } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    owner = await registerIsolatedCompany(app, 'usage');
    token = owner.token;
    other = await registerIsolatedCompany(app, 'usage-other');

    const template = await auth(http().post('/templates'))
      .send({ name: `قالبُ القياس ${suffix}`, isAllScreens: false, allowedScreens: ['customers'], screenActions: { customers: ['view'] } })
      .expect(201);
    const created = await auth(http().post('/api-keys')).send({ name: `مفتاحُ القياس ${suffix}`, permissionTemplateId: template.body.id }).expect(201);
    keyToken = created.body.token;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, other);
    await removeIsolatedCompany(app, owner);
    await app.close();
  });

  it('⭐ ① كلُّ نداءٍ يُعدّ، و② الحصّةُ `null` بلا حدّ', async () => {
    expect(await countOf(owner.companyId)).toBeNull();
    await withKey(http().get('/customers')).expect(200);
    await withKey(http().get('/customers')).expect(200);
    await withKey(http().get('/customers')).expect(200);
    expect((await countOf(owner.companyId))?.count).toBe(3);

    const view = (await auth(http().get('/api-keys/usage')).expect(200)).body as { quota: number | null; period: string; rows: { count: number }[] };
    expect(view.quota).toBeNull();
    expect(view.period).toBe(usagePeriod());
    expect(view.rows[0].count).toBe(3);
  });

  it('🔴 ③ وحين تُضبط الحصّة: ما بعدها يُردّ ٤٢٩ برسالةٍ تحمل العدَّ والحصّة، و④ المردودُ معدود', async () => {
    await setQuota(owner.companyId, 4);
    // الرابعُ يمرّ (العدُّ يصير `4` وهو ليس أكبرَ من `4`)، والخامسُ يُردّ.
    await withKey(http().get('/customers')).expect(200);
    const rejected = await withKey(http().get('/customers')).expect(429);
    expect(String(rejected.body.message)).toContain('حصة');
    expect(String(rejected.body.message)).toContain('4');

    const afterReject = (await countOf(owner.companyId))?.count;
    expect(afterReject).toBe(5);
    // ومحاولةٌ أخرى تُعدّ كذلك — **فلا تُشترى محاولاتٌ بتكرار المحاولة**.
    await withKey(http().get('/customers')).expect(429);
    expect((await countOf(owner.companyId))?.count).toBe(6);

    await setQuota(owner.companyId, null);
    await withKey(http().get('/customers')).expect(200);
  });

  it('⑤ ونداءٌ بمفتاحٍ ملفَّقٍ لا يُعدّ على أحد، و⑥ العزلُ يسري', async () => {
    const before = (await countOf(owner.companyId))?.count ?? 0;
    await http().get('/customers').set('X-Api-Key', 'mk_00112233445566ff_forged-secret-value-long-enough').expect(401);
    expect((await countOf(owner.companyId))?.count).toBe(before);
    // ولا صفَّ للمنشأة الأخرى أصلاً — فعدُّها لا يتأثّر بنا.
    expect(await countOf(other.companyId)).toBeNull();
  });
});
