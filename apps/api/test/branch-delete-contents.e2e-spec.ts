import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر (أطولُ اختبارٍ 0.64 ث · والحزمةُ 53 ث — و65 ث أوّلَ تشغيلٍ بترجمتها) — معلَنةٌ هنا لا مفترَضة.
jest.setTimeout(60000);

/**
 * 🔴 **حذفُ الفرع لا يُفرغه صامتاً** (التوجيه ٢٦٤ §٢ ⑤ — `ق-١٤٣٥`).
 *
 * بنصّ المالك: «**يُرفض حذفُ فرعٍ فيه صندوقٌ أو موظّفٌ أو مستندٌ مفتوح، برسالةٍ تسمّي ما فيه وتدلّ على النقل.**»
 *
 * **ما كان**: مفاتيحُ الفرع على الصناديق والأدراج والموظفين والعروض والمناوبات `ON DELETE SET NULL`، وإسنادُ حسابات
 * الدخول `ON DELETE CASCADE` — فالحذفُ يُخرجها من الفرع إلى «المنشأة كلِّها» بلا أثر، **وحسابُ دخولٍ مقصورٌ على هذا الفرع
 * وحدَه يصير بلا فرعٍ فيرى الفروعَ كلَّها** (`tenant.guard`: بلا إسنادٍ ⟸ `'all'`). والاختبارُ يُثبت الحكمَ بالعكس:
 * كلُّ ما في الفرع يبقى فيه بعد الرفض.
 */
describe('حذفُ الفرع لا يُفرغه صامتاً — يُرفض بما فيه ويدلّ على النقل (ق-١٤٣٥)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  const newBranch = async (label: string) => (await asOwner(http().post('/branches')).send({ name: `${label} ${suffix}`, type: 'فرع' }).expect(201)).body.id as string;
  /** الرفضُ برسالته — والرسالةُ قد تكون قائمةً (سببٌ لكلِّ صنف) فتُضمّ. */
  const refusal = async (branchId: string) => {
    const res = await asOwner(http().delete(`/branches/${branchId}`)).expect(409);
    return ([] as string[]).concat(res.body.message as string | string[]);
  };
  const branchIds = async () => ((await asOwner(http().get('/branches')).expect(200)).body as { id: string }[]).map((b) => b.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'branch-delete');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.4] ① الصندوقُ في الفرع يوقف الحذفَ مسمّىً — ويبقى في فرعه', async () => {
    const branchId = await newBranch('فرع الصندوق');
    const bank = (await asOwner(http().post('/banks')).send({ name: `صندوق الحذف ${suffix}`, openingDate: '2026-01-01', branchId }).expect(201)).body;
    const message = (await refusal(branchId)).join(' | ');
    expect(message).toContain(`صندوق الحذف ${suffix}`);
    expect(message).toContain('انقل');
    const banks = (await asOwner(http().get('/banks')).expect(200)).body as { id: string; branchId: string | null }[];
    expect(banks.find((b) => b.id === bank.id)?.branchId).toBe(branchId);
    expect(await branchIds()).toContain(branchId);
  });

  it('[SPEC 2.4] ② ودرجُ الكاشير كذلك — مسمّىً، وباقٍ في فرعه', async () => {
    const branchId = await newBranch('فرع الدرج');
    const drawer = (await asOwner(http().post('/cash-drawers')).send({ name: `درج الحذف ${suffix}`, branchId }).expect(201)).body;
    const message = (await refusal(branchId)).join(' | ');
    expect(message).toContain(`درج الحذف ${suffix}`);
    const drawers = (await asOwner(http().get('/cash-drawers')).expect(200)).body as { id: string; branchId: string | null }[];
    expect(drawers.find((d) => d.id === drawer.id)?.branchId).toBe(branchId);
  });

  it('[SPEC 2.4] ③ والموظّفُ —مسمّىً، ويدلّ على نقله، وباقٍ في فرعه', async () => {
    const branchId = await newBranch('فرع الموظّف');
    const employee = (await asOwner(http().post('/employees')).send({ fullName: `موظّف الحذف ${suffix}`, hireDate: '2026-01-01', branchId }).expect(201)).body;
    const message = (await refusal(branchId)).join(' | ');
    expect(message).toContain(`موظّف الحذف ${suffix}`);
    expect(message).toContain('انقل');
    expect((await asOwner(http().get(`/employees/${employee.id}`)).expect(200)).body.branchId).toBe(branchId);
  });

  /**
   * ⭐ **حسابُ الدخول المقصورُ على الفرع**: الحذفُ كان يمحو إسنادَه (`CASCADE`) فيصير بلا فرعٍ ⟸ **يرى الفروعَ كلَّها** —
   * توسيعُ صلاحيةٍ صامتٌ بحذفٍ لا علاقةَ له بالحساب. فالرفضُ يسمّيه، والحسابُ بعده مقصورٌ كما كان.
   */
  it('[SPEC 2.7] ④ ⭐ وحسابُ الدخول المُسنَدُ إليه الفرع — مسمّىً، ويبقى مقصوراً عليه لا يرى الفروعَ كلَّها', async () => {
    const branchId = await newBranch('فرع الحساب');
    const other = await newBranch('فرع آخر');
    const template = await asOwner(http().post('/templates')).send({ name: `حذف الفرع ${suffix}`, allowedScreens: ['dashboard', 'employees'] }).expect(201);
    await asOwner(http().post('/company-users'))
      .send({ name: `حساب الحذف ${suffix}`, username: `branch-delete-${suffix}`, password: 'DeletePass123!', permissionTemplateId: template.body.id, branchIds: [branchId] })
      .expect(201);
    const message = (await refusal(branchId)).join(' | ');
    expect(message).toContain(`حساب الحذف ${suffix}`);

    const token = (await http().post('/auth/login').send({ username: `branch-delete-${suffix}`, password: 'DeletePass123!' }).expect(200)).body.accessToken;
    const seen = ((await http().get('/branches').set('Authorization', `Bearer ${token}`).expect(200)).body as { id: string }[]).map((b) => b.id);
    expect(seen).toEqual([branchId]);
    expect(seen).not.toContain(other);
  });

  it('[SPEC 2.4] ⑤ وعرضُ السعر المفتوح — برقمه', async () => {
    const branchId = await newBranch('فرع العرض');
    const customerId = await createTenantCustomer(app, company.token, `عميل الحذف ${suffix}`);
    const quote = (
      await asOwner(http().post('/quotes'))
        .send({ customerId, branchId, issueDate: '2026-09-20', validUntil: '2026-10-20', lines: [{ description: `بندُ العرض ${suffix}`, quantity: 1, unitPrice: 50, taxRate: 15 }] })
        .expect(201)
    ).body;
    const message = (await refusal(branchId)).join(' | ');
    expect(message).toContain(quote.no);
  });

  it('[SPEC 2.4] ⑥ والمناوبةُ المفتوحة — باسم من فتحها', async () => {
    const branchId = await newBranch('فرع المناوبة');
    const shift = (await asOwner(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201)).body;
    const message = (await refusal(branchId)).join(' | ');
    expect(message).toContain(shift.openedByName);
  });

  it('[SPEC 2.4] ⑦ وما في السلّة ويشير إلى الفرع — مسمّىً بأنه في السلّة، لا يُفرَغ من فرعه وهو محذوف', async () => {
    const branchId = await newBranch('فرع السلّة');
    const employee = (await asOwner(http().post('/employees')).send({ fullName: `موظّف السلّة ${suffix}`, hireDate: '2026-01-01', branchId }).expect(201)).body;
    await asOwner(http().delete(`/employees/${employee.id}`)).expect(204);
    const message = (await refusal(branchId)).join(' | ');
    expect(message).toContain(`موظّف السلّة ${suffix}`);
    expect(message).toContain('السلّة');
  });

  it('[SPEC 2.4] ⑧ والفرعُ ذو التاريخ لا يُحذف أبداً — فالتاريخُ لا يُنقل، والرسالةُ تقوله لا «انقل بياناته»', async () => {
    const branchId = await newBranch('فرع التاريخ');
    const customerId = await createTenantCustomer(app, company.token, `عميل التاريخ ${suffix}`);
    await asOwner(http().post('/invoices'))
      .send({ customerId, branchId, issueDate: '2026-09-20', dueDate: '2026-09-20', lines: [{ description: `بندُ التاريخ ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    const message = (await refusal(branchId)).join(' | ');
    expect(message).toContain('لا يُنقل');
    expect(message).not.toContain('انقل بياناته');
  });

  it('[SPEC 2.4] ⑨ وكلُّ ما فيه في رفضٍ واحد — سببٌ لكلِّ صنف، فلا يُكتشف واحدٌ بعد آخر', async () => {
    const branchId = await newBranch('فرع الكلّ');
    await asOwner(http().post('/banks')).send({ name: `صندوق الكلّ ${suffix}`, openingDate: '2026-01-01', branchId }).expect(201);
    await asOwner(http().post('/employees')).send({ fullName: `موظّف الكلّ ${suffix}`, hireDate: '2026-01-01', branchId }).expect(201);
    const reasons = await refusal(branchId);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
    expect(reasons.some((r) => r.includes(`صندوق الكلّ ${suffix}`))).toBe(true);
    expect(reasons.some((r) => r.includes(`موظّف الكلّ ${suffix}`))).toBe(true);
  });

  it('[SPEC 2.4] ⑩ والفرعُ الفارغ يُحذف', async () => {
    const branchId = await newBranch('فرع فارغ');
    await asOwner(http().delete(`/branches/${branchId}`)).expect(204);
    expect(await branchIds()).not.toContain(branchId);
  });
});
