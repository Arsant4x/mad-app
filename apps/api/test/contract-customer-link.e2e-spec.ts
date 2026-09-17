import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * **المستأجرُ يُربط بالعميل بالمعرّف لا بالاسم** (`§6.3` · `ق-٤٩٧` · `ق-١٠٢٨` · `ق-١٠٢٩`/②):
 * ① عميلان بالاسم نفسِه بعقدين **لا يندمجان** وهاتفُ كلٍّ محفوظ · ② عميلُ بيعٍ قائم لا يُلتهم ·
 * ③ المسوّدةُ تُربط عند الإنشاء · ④ اسمُ العقد وهاتفُه **مشتقّان** من العميل ويتبعان تعديلَه ·
 * ⑤ `PATCH` بالاسم يُرفض · ⑥ تغييرُ الطرف قبل أوّل ترحيلٍ فقط وبعده `409` تسمّي المخرج ·
 * ⑦ الاسمُ المكرَّر تنبيهٌ يُؤكَّد لا قيدٌ يمنع · ⑧ عميلٌ في السلة أو مؤرشَف لا يُربط.
 * منشأةٌ معزولة تُزال في الختام — لا اعتمادَ على بذرة.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(d.getTime() - 86400000);
const monthStart = (offset = 0) => addMonths(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)), offset);

type ContractBody = { id: string; customerId: string | null; tenant: string; phone: string | null; status: string; no: string };
type CustomerBody = { id: string; name: string; phone: string | null };

describe('الربطُ بالمعرّف — العقدُ يختار عميلَه ولا يبحث عنه بالاسم (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let seq = 0;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const message = (r: request.Response) => String((r.body as { message?: unknown }).message ?? '');

  async function makeUnit() {
    const tag = `${Date.now()}-${++seq}`;
    const property = (await auth(http().post('/properties')).send({ name: `عقار ${tag}`, ownership: 'owned' }).expect(201)).body as { id: string };
    return (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `L-${tag}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body as { id: string };
  }
  const createCustomer = async (name: string, phone?: string, allowSameName = false) =>
    (await auth(http().post('/customers')).send({ name, ...(phone ? { phone } : {}), ...(allowSameName ? { allowSameName: true } : {}) }).expect(201)).body as CustomerBody;
  const contractPayload = async (customerId: string | undefined, extra: Record<string, unknown> = {}, startOffset = 0) => {
    const unit = await makeUnit();
    const start = monthStart(startOffset);
    return { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, ...(customerId ? { customerId } : {}), value: 12000, cycle: 'monthly', start: iso(start), end: iso(dayBefore(addMonths(start, 12))), ...extra };
  };
  const makeContract = async (customerId: string, extra: Record<string, unknown> = {}, startOffset = 0) =>
    (await auth(http().post('/contracts')).send(await contractPayload(customerId, extra, startOffset)).expect(201)).body as ContractBody;
  const readContract = async (id: string) => (await auth(http().get(`/contracts/${id}`)).expect(200)).body as ContractBody;
  const customers = async () => (await auth(http().get('/customers')).expect(200)).body as CustomerBody[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'contract-link');
    token = company.token;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('[SPEC 16.1] ① عميلان بالاسم نفسِه بعقدين لا يندمجان — وهاتفُ كلٍّ محفوظ ومشتقٌّ على عقده', async () => {
    const name = `سعد الغامدي ${Date.now()}`;
    const a = await createCustomer(name, '0500000201');
    const b = await createCustomer(name, '0500000202', true);
    expect(a.id).not.toBe(b.id);
    const ca = await makeContract(a.id);
    const cb = await makeContract(b.id);
    expect(ca.customerId).toBe(a.id);
    expect(cb.customerId).toBe(b.id);
    expect(ca.phone).toBe('0500000201');
    expect(cb.phone).toBe('0500000202');
    expect(ca.tenant).toBe(name);
    const list = await customers();
    expect(list.filter((c) => c.name === name).map((c) => c.phone).sort()).toEqual(['0500000201', '0500000202']);
  }, 90000);

  it('② عميلُ بيعٍ قائم بالاسم نفسِه لا يُلتهم — العقدُ يرتبط بمن اختير وحدَه', async () => {
    const name = `نورة العتيبي ${Date.now()}`;
    const sales = await createCustomer(name, '0511111111');
    await auth(http().post('/invoices')).send({ customerId: sales.id, issueDate: iso(new Date()), dueDate: iso(new Date()), lines: [{ description: 'خدمة', quantity: 1, unitPrice: 500, taxRate: 15 }] }).expect(201);
    const tenantCustomer = await createCustomer(name, '0522222222', true);
    const c = await makeContract(tenantCustomer.id);
    expect(c.customerId).toBe(tenantCustomer.id);
    const salesAfter = (await customers()).find((x) => x.id === sales.id);
    expect(salesAfter?.phone).toBe('0511111111');
    const aging = (await auth(http().get('/reports/receivables-aging')).expect(200)).body as { rentRows?: { customerId: string }[] };
    expect((aging.rentRows ?? []).filter((r) => r.customerId === sales.id)).toHaveLength(0);
  }, 90000);

  it('③ المسوّدةُ تُربط عند الإنشاء — ومسوّدةٌ بلا عميل تُرفض كالعقد الحيّ', async () => {
    const cust = await createCustomer(`مسوّدة ${Date.now()}`, '0500000203');
    const draft = await makeContract(cust.id, { draft: true });
    expect(draft.status).toBe('DRAFT');
    expect(draft.customerId).toBe(cust.id);
    const res = await auth(http().post('/contracts')).send(await contractPayload(undefined, { draft: true }));
    expect(res.status).toBe(400);
  }, 60000);

  it('④ اسمُ العقد وهاتفُه مشتقّان — تعديلُ العميل يصل عقودَه في المعاملة نفسِها وتعكسه القراءة', async () => {
    const cust = await createCustomer(`فهد القحطاني ${Date.now()}`, '0500000204');
    const c = await makeContract(cust.id);
    await auth(http().patch(`/customers/${cust.id}`)).send({ name: `${cust.name} (مصحَّح)`, phone: '0500000205' }).expect(200);
    const after = await readContract(c.id);
    expect(after.tenant).toBe(`${cust.name} (مصحَّح)`);
    expect(after.phone).toBe('0500000205');
    const list = (await auth(http().get('/contracts')).expect(200)).body as { items: ContractBody[] };
    expect(list.items.find((x) => x.id === c.id)?.tenant).toBe(`${cust.name} (مصحَّح)`);
    // **الذاكرةُ المشتقّة على العقد نفسِها تحدّثت** — البحثُ الخادميّ يقرأ العمودَ لا بطاقةَ العميل، فاسمٌ
    // جديد لا يُعثر عليه إلا إن كُتب في معاملة التعديل (لا اشتقاقاً عند القراءة وحدَه).
    const found = (await auth(http().get('/contracts').query({ search: '(مصحَّح)' })).expect(200)).body as { items: ContractBody[] };
    expect(found.items.some((x) => x.id === c.id)).toBe(true);
  }, 90000);

  it('⑤ PATCH بالاسم أو الهاتف يُرفض — الحقلان ليسا مُدخَلَين', async () => {
    const cust = await createCustomer(`لا يُعدَّل ${Date.now()}`, '0500000206');
    const c = await makeContract(cust.id);
    const res = await auth(http().patch(`/contracts/${c.id}`)).send({ tenant: 'اسمٌ آخر' });
    expect(res.status).toBe(400);
    expect((await readContract(c.id)).tenant).toBe(cust.name);
  }, 60000);

  it('⑥ تغييرُ الطرف قبل أوّل ترحيلٍ يمرّ — وبعده يُرفض 409 تسمّي المخرج: إنهاءٌ وعقدٌ جديد', async () => {
    const first = await createCustomer(`طرفٌ أول ${Date.now()}`, '0500000207');
    const second = await createCustomer(`طرفٌ ثانٍ ${Date.now()}`, '0500000208');
    // عقدٌ قادم (يبدأ الشهرَ التالي) — لا استحقاقَ رُحِّل بعد
    const upcoming = await makeContract(first.id, {}, 1);
    const relinked = await auth(http().patch(`/contracts/${upcoming.id}`)).send({ customerId: second.id }).expect(200);
    expect((relinked.body as ContractBody).customerId).toBe(second.id);
    expect((relinked.body as ContractBody).tenant).toBe(second.name);
    // عقدٌ جارٍ — قسطُه الأول مستحقٌّ ورُحِّل استحقاقُه عند الإنشاء
    const current = await makeContract(first.id);
    const refused = await auth(http().patch(`/contracts/${current.id}`)).send({ customerId: second.id });
    expect(refused.status).toBe(409);
    expect(message(refused)).toContain('عقداً جديداً');
    expect((await readContract(current.id)).customerId).toBe(first.id);
  }, 120000);

  it('⑦ الاسمُ المكرَّر تنبيهٌ يُؤكَّد لا قيدٌ يمنع — «أهو نفسُه؟»', async () => {
    const name = `خالد الدوسري ${Date.now()}`;
    await createCustomer(name, '0500000209');
    const warned = await auth(http().post('/customers')).send({ name, phone: '0500000210' });
    expect(warned.status).toBe(409);
    expect(message(warned)).toContain('أهو نفسُه');
    await createCustomer(name, '0500000210', true);
    expect((await customers()).filter((c) => c.name === name)).toHaveLength(2);
  }, 60000);

  it('⑧ عميلٌ في السلة أو مؤرشَف لا يُربط — والرسالةُ تسمّي المخرج', async () => {
    const trashed = await createCustomer(`في السلة ${Date.now()}`, '0500000211');
    await auth(http().delete(`/customers/${trashed.id}`)).expect(204);
    const viaTrashed = await auth(http().post('/contracts')).send(await contractPayload(trashed.id));
    expect(viaTrashed.status).toBe(404);
    const archived = await createCustomer(`مؤرشَف ${Date.now()}`, '0500000212');
    await auth(http().patch(`/customers/${archived.id}/archive`)).send({ archived: true }).expect(200);
    const viaArchived = await auth(http().post('/contracts')).send(await contractPayload(archived.id));
    expect(viaArchived.status).toBe(409);
    expect(message(viaArchived)).toContain('مؤرشَف');
  }, 60000);
});
