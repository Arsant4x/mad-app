import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

interface Drawer {
  id: string;
  name: string;
  isActive: boolean;
  branchId: string | null;
  account: { id: string; code: string; name: string; balance: string };
}

/**
 * **درجُ الكاشير كياناً وحساباً** (`ق-٢١٨` · `ق-٢٥٣` · `ق-٢٦١` · `ق-٢٦٥`).
 *
 * ما يُقاس هنا:
 *   ① الإنشاء **يُنشئ الحساب معه** في نطاق `1010`–`1099` — لا يُدخِل التاجر رمزاً.
 *   ② والترقيم **`MAX+1` لا `count()`**: رمزٌ في وسط النطاق يدفع التالي فوقه،
 *      **والفجوةُ لا تُعاد تعبئتُها** (`ق-١٩٨`).
 *   ③ والتعطيل **يُرفض برصيدٍ غير صفر**، **والرسالةُ تسمّي الرصيد وتدلّ على
 *      المخرج** (`ق-٢٦٥`) — فمنعٌ بلا مخرجٍ يُلتفّ عليه.
 *   ④ ورصيدُ صفرٍ يُعطَّل بلا اعتراض.
 */
describe('Cash drawers — entity, derived numbering, and the deactivation gate (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const created: string[] = [];
  let plantedAccountId = '';

  const createDrawer = (name: string) => auth(http().post('/cash-drawers')).send({ name });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
  }, 60000);

  afterAll(async () => {
    for (const id of created) await auth(http().delete(`/cash-drawers/${id}`));
    if (plantedAccountId) await auth(http().delete(`/accounts/${plantedAccountId}`));
    await app.close();
  });

  it('① الإنشاء يُنشئ حساب الدرج معه في نطاق 1010–1099 — ولا رمزَ يُدخله التاجر', async () => {
    const res = await createDrawer(`درج الواجهة ${suffix}`).expect(201);
    const drawer = res.body as Drawer;
    created.push(drawer.id);

    expect(drawer.account).toBeTruthy();
    const code = Number(drawer.account.code);
    expect(Number.isInteger(code)).toBe(true);
    expect(code).toBeGreaterThanOrEqual(1010);
    expect(code).toBeLessThanOrEqual(1099);
    expect(drawer.account.name).toContain(drawer.name);
    expect(drawer.isActive).toBe(true);
  });

  it('② الترقيم `MAX+1` لا `count()`: رمزٌ مزروع في وسط النطاق يدفع التاليَ فوقه، والفجوةُ تبقى', async () => {
    // حسابٌ يدويّ في وسط النطاق — لا يمرّ به درج، فهو «فجوة» لعدّادٍ يعدّ الصفوف.
    const planted = await auth(http().post('/accounts'))
      .send({ code: '1077', name: `حسابٌ مزروع ${suffix}`, type: 'asset' })
      .expect(201);
    plantedAccountId = planted.body.id;

    const next = (await createDrawer(`درج ما بعد الفجوة ${suffix}`).expect(201)).body as Drawer;
    created.push(next.id);
    expect(Number(next.account.code)).toBe(1078);
  });

  it('🔴 ③ التعطيل يُرفض برصيدٍ غير صفر — والرسالةُ تسمّي الرصيد وتدلّ على المخرج (ق-٢٦٥)', async () => {
    const drawer = (await createDrawer(`درج فيه نقد ${suffix}`).expect(201)).body as Drawer;
    created.push(drawer.id);

    // رصيدٌ حقيقيّ عبر القيد الافتتاحي — لا كتابةٌ مباشرة على العمود.
    await auth(http().patch(`/accounts/${drawer.account.id}`)).send({ openingBalance: 1240 }).expect(200);

    const res = await auth(http().patch(`/cash-drawers/${drawer.id}`)).send({ isActive: false }).expect(409);
    const message = String(res.body.message);
    expect(message).toContain('1240'); // الرصيد بالرقم
    expect(message).toMatch(/انقل|حوّل/); // والمخرج
    expect(message).toMatch(/درج|البنك/);

    // وبعد تصفير الرصيد يمرّ التعطيل — فالمنع بالرصيد لا بالدرج.
    await auth(http().patch(`/accounts/${drawer.account.id}`)).send({ openingBalance: 0 }).expect(200);
    const ok = (await auth(http().patch(`/cash-drawers/${drawer.id}`)).send({ isActive: false }).expect(200)).body as Drawer;
    expect(ok.isActive).toBe(false);
  });

  it('④ والقائمة تُعيد الأدراج بحساباتها', async () => {
    const list = (await auth(http().get('/cash-drawers')).expect(200)).body as Drawer[];
    expect(list.length).toBeGreaterThanOrEqual(created.length);
    for (const d of list) expect(d.account?.code).toBeTruthy();
  });
});
