import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

/**
 * ثقبُ الحذف الناعم في العملاء — `§6.12` واقعةً (`ق-١٠٢٠` · `ق-١٠٢٨`/④ · `ق-١٠٢٩`/①):
 * ① عميلٌ له عقدُ إيجار لا يُحذف — **بأيّ حالةٍ ولو مُلغاة** — والرسالةُ تسمّي المخرج (الأرشفة).
 * ② عميلٌ في السلة بلا عقود: الاسمُ نفسُه يُرفض `409` مسمّىً **من بابَي العملاء والعقود** — لا `500`
 *    خامٌ من الفهرس الفريد الذي يرى المحذوفَ ناعماً بينما فحصُ التطبيق لا يراه.
 * ③ وبعد الاستعادة يعود الاسمُ يعمل ويرتبط العقدُ الجديد بالمستعاد.
 * منشأةٌ معزولة تُزال في الختام — لا اعتمادَ على بذرة.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(d.getTime() - 86400000);

describe('حرّاسُ سلة العملاء — الحذفُ بعقود، والاسمُ المحذوفُ ناعماً (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let seq = 0;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const monthStart = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  async function makeUnit() {
    const tag = `${Date.now()}-${++seq}`;
    const property = (await auth(http().post('/properties')).send({ name: `عقار ${tag}`, ownership: 'owned' }).expect(201)).body as { id: string };
    return (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `T-${tag}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body as { id: string };
  }
  // العقدُ يُربط بعميلٍ بمعرّفه (ق-١٠٢٩/②) — والمستأجرُ يُنشأ عميلاً صراحةً أولاً.
  const contractPayload = async (customerId: string) => {
    const unit = await makeUnit();
    const start = monthStart();
    return { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId, value: 12000, cycle: 'monthly', start: iso(start), end: iso(dayBefore(addMonths(start, 12))) };
  };
  const makeContract = async (tenant: string, phone: string) => {
    const customerId = await createTenantCustomer(app, token, tenant, phone);
    return (await auth(http().post('/contracts')).send(await contractPayload(customerId)).expect(201)).body as { id: string; customerId: string };
  };
  const message = (r: request.Response) => String((r.body as { message?: unknown }).message ?? '');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    // كما `main.ts`: الرسائلُ تُترجَم — فالتوكيدُ على نصّها العربيّ هو المسارُ الحقيقيّ لا المفتاح.
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'customer-trash');
    token = company.token;
  }, 120000);

  // الإزالةُ تمسح عقوداً وقيوداً واستحقاقاتٍ — تتجاوز الخمسَ ثوانٍ الافتراضية تحت الحِمل (وقع في إثباتٍ عكسيّ).
  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('[SPEC 4.1] ① عميلٌ له عقدٌ حيّ لا يُحذف — 409 تسمّي الأرشفةَ مخرجاً', async () => {
    const c = await makeContract(`مستأجر حيّ ${Date.now()}`, '0500000101');
    expect(c.customerId).toBeTruthy();
    const res = await auth(http().delete(`/customers/${c.customerId}`));
    expect(res.status).toBe(409);
    expect(message(res)).toContain('عقود');
    expect(message(res)).toContain('أرشِف');
  }, 60000);

  it('② ولو كان العقدُ مُلغى — فقيودُه منسوبةٌ إليه، والمفتاحُ الأجنبيّ يجعله زومبياً على كل حال', async () => {
    const c = await makeContract(`مستأجر ملغى ${Date.now()}`, '0500000102');
    await auth(http().post(`/contracts/${c.id}/cancel`))
      // القسطُ الأول مستحقٌّ ومرحَّلٌ ولم يُعترف بمدّته كلِّها بعدُ — فللإلغاء «غيرُ مكتسَب» يلزمه توجيهٌ (ق-٤٧٢)
      .send({ cancelDate: iso(new Date()), cancelReason: 'اختبارُ الحذف', installmentDisposition: 'cancel', settlementBasis: 'none', unearnedDisposition: 'income' })
      .expect(201);
    const cancelled = (await auth(http().get(`/contracts/${c.id}`)).expect(200)).body as { status: string };
    expect(cancelled.status).toBe('CANCELLED');
    const res = await auth(http().delete(`/customers/${c.customerId}`));
    expect(res.status).toBe(409);
    expect(message(res)).toContain('مُلغاة');
  }, 60000);

  it('③ عميلٌ في السلة بلا عقود: الاسمُ نفسُه يُرفض 409 مسمّىً من بابَي العملاء والعقود — لا 500', async () => {
    const name = `عميل في السلة ${Date.now()}`;
    const trashed = (await auth(http().post('/customers')).send({ name, phone: '0500000103' }).expect(201)).body as { id: string };
    await auth(http().delete(`/customers/${trashed.id}`)).expect(204);
    // غابَ من القائمة — الحذفُ ناعم
    const listed = (await auth(http().get('/customers')).expect(200)).body as { id: string }[];
    expect(listed.some((c) => c.id === trashed.id)).toBe(false);

    // بابُ العملاء
    const viaCustomers = await auth(http().post('/customers')).send({ name, phone: '0500000104' });
    expect(viaCustomers.status).toBe(409);
    expect(message(viaCustomers)).toContain('سلة المحذوفات');

    // بابُ العقود — لا اسمَ يُبحث عنه بعد الربط بالمعرّف (ق-١٠٢٩/②): معرّفُ المحذوف ناعماً غائبٌ عن
    // القراءة المرشَّحة فيُرفض مسمّىً لا بخطأِ خادم
    const viaContracts = await auth(http().post('/contracts')).send(await contractPayload(trashed.id));
    expect(viaContracts.status).toBe(404);

    // ④ وبعد الاستعادة يعود العميلُ يُربط بمعرّفه
    await auth(http().post(`/trash/customers/${trashed.id}/restore`)).expect(201);
    const after = (await auth(http().post('/contracts')).send(await contractPayload(trashed.id)).expect(201)).body as { customerId: string };
    expect(after.customerId).toBe(trashed.id);
  }, 90000);

  it('⑤ والرقمُ الضريبي لعميلٍ في السلة يُرفض كذلك — الفحصُ يقرأ الاسمَ والرقمَ معاً', async () => {
    const vat = '300000000000003';
    const first = (await auth(http().post('/customers')).send({ name: `صاحب رقم ضريبي ${Date.now()}`, vatNumber: vat }).expect(201)).body as { id: string };
    await auth(http().delete(`/customers/${first.id}`)).expect(204);
    const res = await auth(http().post('/customers')).send({ name: `اسمٌ آخر ${Date.now()}`, vatNumber: vat });
    expect(res.status).toBe(409);
    expect(message(res)).toContain('سلة المحذوفات');
    await auth(http().post(`/trash/customers/${first.id}/restore`)).expect(201);
  }, 60000);

  it('⑥ الضابط: اسمٌ لا يطابق حيّاً ولا محذوفاً يمرّ 201', async () => {
    await auth(http().post('/customers')).send({ name: `عميل ضابط ${Date.now()}`, phone: '0500000107' }).expect(201);
  }, 30000);
});
