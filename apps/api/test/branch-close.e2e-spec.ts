import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — تُعلَن بعد أوّل تشغيل.
jest.setTimeout(240000);

/**
 * ⚖️ **الفرعُ يُغلق، ولا يُحذف إلا إن لم يُستعمل قطّ** (`ق-١٤٥٣`).
 *
 * بنصّ المالك: «**🔬 قِس أوّلاً: أيُرفض حذفُ فرعٍ له تاريخٌ مغلقٌ فقط؟ وأحالةُ «مغلق» موجودة؟ ▶️ ثم ابنِ: الإغلاق: لا مستندَ
 * جديدٌ فيه · ويبقى في التقارير والتاريخ · ويُعاد فتحُه بصلاحية. وشرطُه: صناديقُه نُقلت أو أُقفلت · وموظّفوه نُقلوا ·
 * ومستنداتُه المفتوحة سُوّيت. والرفضُ يسمّي ما بقي ويدلّ على النقل. والحذف: لفرعٍ لا أثرَ له إطلاقاً ولا في التاريخ، وما
 * عداه يُدلّ على الإغلاق.**»
 *
 * **المفتوحُ** بتعريف `ق-١٤٣٥` المعتمد (`OPEN_WHERE`): عرضُ سعرٍ مسوَّدةٌ أو مُرسَل · مناوبةٌ مفتوحة · إتلافٌ بانتظار المراجعة.
 * **والفاتورةُ غيرُ المحصَّلة تاريخٌ لا مفتوح** — تُحصَّل بعد الإغلاق بسندٍ في فرعٍ آخر أو للمنشأة كلِّها.
 */
describe('إغلاقُ الفرع — لا مستندَ جديدٌ فيه، ويبقى في التاريخ، ولا يُحذف إلا ما لا أثرَ له (ق-١٤٥٣)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const messageOf = (body: { message?: string | string[] }) => ([] as string[]).concat(body.message ?? []).join(' | ');

  const newBranch = async (label: string) => (await asOwner(http().post('/branches')).send({ name: `${label} ${suffix}`, type: 'فرع' }).expect(201)).body.id as string;
  const branchRow = async (id: string) => ((await asOwner(http().get('/branches')).expect(200)).body as Record<string, unknown>[]).find((b) => b.id === id);
  const invoiceIn = (customerId: string, branchId: string | undefined, label: string) =>
    asOwner(http().post('/invoices')).send({
      customerId,
      ...(branchId ? { branchId } : {}),
      issueDate: '2026-09-20',
      dueDate: '2026-09-20',
      lines: [{ description: `${label} ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }],
    });

  let customerId: string;
  let templateId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'branch-close');
    customerId = await createTenantCustomer(app, company.token, `عميل الإغلاق ${suffix}`);
    templateId = (await asOwner(http().post('/templates')).send({ name: `إغلاق الفرع ${suffix}`, allowedScreens: ['dashboard', 'employees', 'invoice', 'branches'] }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.4] 🔬 ① فرعٌ تاريخُه مناوبةٌ مغلقةٌ وحدَها — حذفُه يُرفض، والرفضُ يدلّ على الإغلاق', async () => {
    const branchId = await newBranch('فرع المناوبة المغلقة');
    const shift = (await asOwner(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201)).body;
    await asOwner(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 0 }).expect(201);
    const res = await asOwner(http().delete(`/branches/${branchId}`));
    expect({ status: res.status, directsToClose: messageOf(res.body).includes('أغلق') }).toEqual({ status: 409, directsToClose: true });
  });

  it('[SPEC 2.4] 🔬 ② حالةُ «مغلق» — الفرعُ يُغلق ويحمل تاريخَ إغلاقه في القائمة', async () => {
    const branchId = await newBranch('فرع الحالة');
    const closed = await asOwner(http().post(`/branches/${branchId}/close`));
    const row = await branchRow(branchId);
    expect({ status: closed.status, closedInList: Boolean(row?.closedAt) }).toEqual({ status: 201, closedInList: true });
  });

  it('[SPEC 2.4] ③ الإغلاقُ يُرفض وفيه ما لم يُنقل أو يُسوَّ — مسمّىً في رفضٍ واحد ويدلّ على النقل', async () => {
    const branchId = await newBranch('فرع الشرط');
    const other = await newBranch('فرع الوجهة');
    const box = (await asOwner(http().post('/banks')).send({ name: `صندوق الشرط ${suffix}`, kind: 'CASH_BOX', openingDate: '2026-01-01', branchId }).expect(201)).body;
    const employee = (await asOwner(http().post('/employees')).send({ fullName: `موظّف الشرط ${suffix}`, hireDate: '2026-01-01', branchId }).expect(201)).body;
    const account = (
      await asOwner(http().post('/company-users'))
        .send({ name: `حساب الشرط ${suffix}`, username: `close-cond-${suffix}`, password: 'ClosePass123!', permissionTemplateId: templateId, branchIds: [branchId] })
        .expect(201)
    ).body;
    const shift = (await asOwner(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201)).body;
    const quote = (
      await asOwner(http().post('/quotes'))
        .send({ customerId, branchId, issueDate: '2026-09-20', validUntil: '2026-10-20', lines: [{ description: `بندُ الشرط ${suffix}`, quantity: 1, unitPrice: 50, taxRate: 15 }] })
        .expect(201)
    ).body;

    const refused = await asOwner(http().post(`/branches/${branchId}/close`)).expect(409);
    const message = messageOf(refused.body);
    for (const named of [`صندوق الشرط ${suffix}`, `موظّف الشرط ${suffix}`, `حساب الشرط ${suffix}`, shift.openedByName, quote.no]) expect(message).toContain(named);
    expect(message).toContain('انقل');
    expect((await branchRow(branchId))?.closedAt ?? null).toBeNull();

    // التسوية: الصندوقُ يُؤرشف · الموظّفُ يُنقل · الحسابُ يُعاد إسنادُه · المناوبةُ تُقفل · العرضُ يُحذف ⟸ يُغلق.
    await asOwner(http().patch(`/banks/${box.id}/archive`)).send({ archived: true }).expect(200);
    await asOwner(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 0 }).expect(201);
    await asOwner(http().post(`/employees/${employee.id}/transfer`)).send({ fromBranchId: branchId, toBranchId: other }).expect(201);
    await asOwner(http().patch(`/company-users/${account.id}`)).send({ branchIds: [other] }).expect(200);
    await asOwner(http().delete(`/quotes/${quote.id}`)).expect(204);
    await asOwner(http().post(`/branches/${branchId}/close`)).expect(201);
  });

  it('[SPEC 2.4] ④ المغلقُ لا مستندَ جديدٌ فيه — فاتورةٌ · مناوبةٌ · موظّفٌ · صندوقٌ · إسنادُ حساب · نقلُ موظّفٍ إليه — مسمّاةً باسمه', async () => {
    const branchId = await newBranch('فرع مغلق');
    const other = await newBranch('فرع مفتوح');
    await asOwner(http().post(`/branches/${branchId}/close`)).expect(201);
    const name = `فرع مغلق ${suffix}`;

    const attempts = {
      invoice: await invoiceIn(customerId, branchId, 'فاتورةٌ في مغلق'),
      shift: await asOwner(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }),
      employee: await asOwner(http().post('/employees')).send({ fullName: `موظّفٌ في مغلق ${suffix}`, hireDate: '2026-01-01', branchId }),
      box: await asOwner(http().post('/banks')).send({ name: `صندوقٌ في مغلق ${suffix}`, kind: 'CASH_BOX', openingDate: '2026-01-01', branchId }),
      account: await asOwner(http().post('/company-users')).send({
        name: `حسابٌ في مغلق ${suffix}`,
        username: `close-acc-${suffix}`,
        password: 'ClosePass123!',
        permissionTemplateId: templateId,
        branchIds: [branchId],
      }),
    };
    const moving = (await asOwner(http().post('/employees')).send({ fullName: `موظّفٌ ينتقل ${suffix}`, hireDate: '2026-01-01', branchId: other }).expect(201)).body;
    const transfer = await asOwner(http().post(`/employees/${moving.id}/transfer`)).send({ fromBranchId: other, toBranchId: branchId });

    const outcome = Object.fromEntries(
      Object.entries({ ...attempts, transfer }).map(([k, r]) => [k, { status: r.status, named: messageOf(r.body).includes(name) && messageOf(r.body).includes('مغلق') }]),
    );
    const refused = { status: 409, named: true };
    expect(outcome).toEqual({ invoice: refused, shift: refused, employee: refused, box: refused, account: refused, transfer: refused });

    // والمستندُ للمنشأة كلِّها أو في فرعٍ مفتوح يمضي — البوّابةُ على المغلق وحدَه.
    await invoiceIn(customerId, undefined, 'فاتورةٌ للمنشأة').expect(201);
    await invoiceIn(customerId, other, 'فاتورةٌ في مفتوح').expect(201);
  });

  it('[SPEC 2.4] ⑤ المغلقُ يبقى في التاريخ والتقارير — فاتورتُه في القائمة وإيرادُه في ملخّص الفروع', async () => {
    const branchId = await newBranch('فرع التاريخ المغلق');
    const invoice = (await invoiceIn(customerId, branchId, 'فاتورةُ ما قبل الإغلاق').expect(201)).body;
    await asOwner(http().post(`/branches/${branchId}/close`)).expect(201);

    const listed = (await asOwner(http().get(`/invoices?search=${encodeURIComponent(invoice.no)}`)).expect(200)).body;
    const rows = (Array.isArray(listed) ? listed : listed.items) as { id: string }[];
    expect(rows.some((r) => r.id === invoice.id)).toBe(true);
    const summary = (await asOwner(http().get('/reports/branch-summary')).expect(200)).body as { branches: { branchId: string; revenue: string }[] };
    expect(Number(summary.branches.find((b) => b.branchId === branchId)?.revenue)).toBe(100);
  });

  it('[SPEC 2.4] ⑥ يُعاد فتحُه بصلاحية — المالكُ يفتحه فيُقبل المستند، والموظّفُ يُرفض إغلاقاً وفتحاً', async () => {
    const branchId = await newBranch('فرع إعادة الفتح');
    await asOwner(http().post('/company-users'))
      .send({ name: `موظّف الفتح ${suffix}`, username: `close-staff-${suffix}`, password: 'ClosePass123!', permissionTemplateId: templateId })
      .expect(201);
    const staff = (await http().post('/auth/login').send({ username: `close-staff-${suffix}`, password: 'ClosePass123!' }).expect(200)).body.accessToken;

    await http().post(`/branches/${branchId}/close`).set('Authorization', `Bearer ${staff}`).expect(403);
    await asOwner(http().post(`/branches/${branchId}/close`)).expect(201);
    await asOwner(http().post(`/branches/${branchId}/close`)).expect(409);
    await http().post(`/branches/${branchId}/reopen`).set('Authorization', `Bearer ${staff}`).expect(403);
    await asOwner(http().post(`/branches/${branchId}/reopen`)).expect(201);
    expect((await branchRow(branchId))?.closedAt ?? null).toBeNull();
    await asOwner(http().post(`/branches/${branchId}/reopen`)).expect(409);
    await invoiceIn(customerId, branchId, 'فاتورةٌ بعد الفتح').expect(201);
  });

  it('[SPEC 2.4] ⑦ الحذفُ لما لا أثرَ له وحدَه — المغلقُ بلا أثرٍ يُحذف، وذو التاريخ يُدلّ على الإغلاق', async () => {
    const unused = await newBranch('فرعٌ لم يُستعمل');
    await asOwner(http().post(`/branches/${unused}/close`)).expect(201);
    await asOwner(http().delete(`/branches/${unused}`)).expect(204);

    const used = await newBranch('فرعٌ استُعمل');
    await invoiceIn(customerId, used, 'أثرٌ في الفرع').expect(201);
    const refused = await asOwner(http().delete(`/branches/${used}`)).expect(409);
    expect(messageOf(refused.body)).toContain('أغلق');
  });
});
