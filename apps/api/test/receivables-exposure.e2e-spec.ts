import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { customerExposure, exposureOf } from '../src/reports/receivables-exposure.util';

/**
 * **رقمٌ واحد لا رقمان** (`ق-٣٤١`) — شرطُ قبولٍ يسبق حدَّ الائتمان.
 *
 * ⚠️ **العلّة**: «المتبقّي» كان يُحسب في ثلاثة مواضع بلا دالّةٍ مشتركة،
 * **وحدُّ الائتمان كان سيصير رابعاً**. **وتاجرٌ يقرأ في تقرير الأعمار
 * `٤٠٬٠٠٠` وفي رسالة المنع `٤٥٬٠٠٠` يفقد الثقة في الاثنين** — فلا يعرف أيَّهما
 * يصدّق، **ويصير كلاهما بلا قيمة**.
 *
 * **فما يُثبَت هنا**: ما يقرأه الحدُّ (`exposureOf`) **هو عينُ ما يعرضه
 * التقرير** — لا «قريبٌ منه» ولا «محسوبٌ بالطريقة نفسها».
 */
describe('تعرّضُ العميل: رقمٌ واحد لا رقمان (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  interface AgingRow {
    customerId: string;
    customerName: string;
    total: number;
  }

  const endOfToday = () => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
    tenantPrisma = app.get(TenantPrismaService);
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 30000);

  it('🔴 ما يقرأه الحدُّ هو عينُ ما يعرضه التقرير — لكل عميلٍ له رصيد', async () => {
    const report = (await auth(http().get('/reports/receivables-aging')).expect(200)).body as {
      rows: AgingRow[];
      totals: { total: number };
    };

    // **السطح غير فارغ**: مقارنةٌ على صفر صفوفٍ تمرّ عمىً.
    expect(report.rows.length).toBeGreaterThan(0);

    for (const row of report.rows) {
      const fromSource = await tenantPrisma.runInTenantContext(companyId, (tx) => exposureOf(tx, row.customerId, endOfToday()));
      // ⚠️ **بالضبط لا بالتقريب**: فرقُ هللةٍ بين شاشتين يُقرأ عطلاً في إحداهما.
      expect(fromSource).toBe(row.total);
    }
  }, 40000);

  it('🔴 وعميلٌ متعادل: غيابُ صفّه يعني صفراً لا «غيرَ معروف»', async () => {
    // **العميلُ الذي لا يظهر في التقرير لا رصيدَ له** — والحدُّ يقرأ صفراً
    // لا `undefined`، **فلا يُمنع بيعٌ لعميلٍ لا يدين بشيء**.
    const customers = (await auth(http().get('/customers')).expect(200)).body as { id: string; name: string }[];
    const report = (await auth(http().get('/reports/receivables-aging')).expect(200)).body as { rows: AgingRow[] };
    const owing = new Set(report.rows.map((r) => r.customerId));

    const settled = customers.find((c) => !owing.has(c.id));
    if (!settled) throw new Error('كلُّ عملاء العرض مدينون — فلا حالةَ متعادلة تُقاس');

    const exposure = await tenantPrisma.runInTenantContext(companyId, (tx) => exposureOf(tx, settled.id, endOfToday()));
    expect(exposure).toBe(0);
  }, 30000);

  it('🔴 وترشيحُ العميل لا يغيّر رقمَه — فالمرشّح يضيّق ولا يُعيد الحساب', async () => {
    // ⚠️ **وهذا ما يجعل قراءةَ الحدّ رخيصة**: يقرأ عميلاً واحداً لا الدفترَ
    // كلَّه، **ويحصل على الرقم نفسه** — فلا إغراءَ بحسابٍ مختصرٍ رابع.
    const report = (await auth(http().get('/reports/receivables-aging')).expect(200)).body as { rows: AgingRow[] };
    const target = report.rows[0];
    expect(target).toBeTruthy();

    const narrowed = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      customerExposure(tx, { asOf: endOfToday(), customerId: target.customerId }),
    );
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0].total).toBe(target.total);
  }, 30000);
});
