import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (أطولُ اختبارٍ 3.3 ث · والحزمةُ 139.9 ث أوّلَ تشغيلٍ بترجمتها) — معلَنةٌ هنا لا مفترَضة.
jest.setTimeout(60000);

/**
 * ⚖️ **النقلُ بين الفروع بمبادئ المالك** (التوجيه ٢٦٣ §٤ — `ق-١٤١٣` · `ق-١٤١٥`).
 *
 * **الدرجُ** (`ق-١٤١٣`): فرعُه مكانُ النقد فعلاً، فالنقلُ **إغلاقٌ وفتح** — يُعدّ النقدُ ويُغلق في الأوّل، ويُنقل رصيدُه
 * بقيدٍ بين الفرعين، ويُفتح في الثاني، **ولا يُنقل تاريخُه**. جوابٌ محسوبٌ يداً: درجٌ بـ`500` في الشمال يُعدّ `480` ⟸
 * عجزٌ `20` على `5900` · خروجُ `480` من الشمال إلى `1190` · دخولُ `480` في درجٍ جديدٍ بالجنوب ⟸ القديمُ مغلقٌ برصيدٍ صفر
 * ورابطُه إلى خلفه، والجديدُ بـ`480`، و`1190` صفرٌ على المنشأة.
 */
describe('النقلُ بين الفروع — الدرجُ إغلاقٌ وفتح، والموظّفُ للقادم (ق-١٤١٣ · ق-١٤١٥)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  let northId: string;
  let southId: string;
  let revenueId: string;
  const accounts = async () => (await asOwner(http().get('/accounts')).expect(200)).body as { id: string; code: string; balance: string }[];
  const ledgerClosing = async (accountId: string) => (await asOwner(http().get(`/reports/ledger?accountId=${accountId}`)).expect(200)).body.closing as string;
  const drawers = async () => (await asOwner(http().get('/cash-drawers')).expect(200)).body as {
    id: string;
    name: string;
    isActive: boolean;
    branchId: string | null;
    transferredToId: string | null;
    account: { id: string; balance: string };
  }[];
  /** درجٌ في الشمال بنقدٍ دفتريّ — قيدٌ يدويّ يمدين حسابَه ويدائن الإيراد. */
  const fundedDrawer = async (name: string, amount: number) => {
    const drawer = (await asOwner(http().post('/cash-drawers')).send({ name, branchId: northId }).expect(201)).body;
    if (amount > 0) {
      await asOwner(http().post('/journal'))
        .send({ date: '2026-09-20', memo: `تمويل ${name}`, lines: [{ accountId: drawer.account.id, debit: amount, credit: 0 }, { accountId: revenueId, debit: 0, credit: amount }] })
        .expect(201);
    }
    return drawer as { id: string; account: { id: string } };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'transfer');
    northId = (await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    southId = (await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    revenueId = (await accounts()).find((a) => a.code === '4100')!.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('⭐ يُعدّ ويُغلق في الشمال، ويُنقل رصيدُه بقيدين، ويُفتح في الجنوب — والفرقُ على 5900 و1190 صفرٌ على المنشأة', async () => {
    const drawer = await fundedDrawer('الدرج الرئيسي', 500);
    const res = await asOwner(http().post(`/cash-drawers/${drawer.id}/transfer`)).send({ toBranchId: southId, countedAmount: 480, date: '2026-09-24' }).expect(201);
    expect(res.body.bookBalance).toBe('500.00');
    expect(res.body.countedAmount).toBe('480.00');
    expect(res.body.variance).toBe('-20.00');
    expect(res.body.entries.variance).toBeTruthy();
    expect(res.body.entries.out).toBeTruthy();
    expect(res.body.entries.in).toBeTruthy();

    const all = await drawers();
    const old = all.find((d) => d.id === drawer.id)!;
    const successor = all.find((d) => d.id === res.body.to.id)!;
    // القديمُ مغلقٌ برصيدٍ صفر، يشير إلى خلفه — وتاريخُه باقٍ على حسابه.
    expect(old.isActive).toBe(false);
    expect(old.transferredToId).toBe(successor.id);
    expect(old.branchId).toBe(northId);
    expect(await ledgerClosing(old.account.id)).toBe('0.00');
    // الجديدُ في الجنوب بحسابٍ جديد بالمعدود.
    expect(successor.isActive).toBe(true);
    expect(successor.branchId).toBe(southId);
    expect(successor.name).toBe('الدرج الرئيسي');
    expect(successor.account.id).not.toBe(old.account.id);
    expect(await ledgerClosing(successor.account.id)).toBe('480.00');
    // العجزُ على 5900 والطريقُ صفرٌ على المنشأة.
    const byCode = new Map((await accounts()).map((a) => [a.code, a.id]));
    expect(await ledgerClosing(byCode.get('5900')!)).toBe('20.00');
    expect(await ledgerClosing(byCode.get('1190')!)).toBe('0.00');
    // **وكلُّ قيدٍ بفرعه** — القيدُ الواحد لا يحمل فرعَين: الخروجُ والعجزُ بالشمال، والدخولُ بالجنوب؛ فالطريقُ في كلِّ
    // فرعٍ منفرداً أثرُ طرفه (الحدُّ المعلَن): موجبٌ في المُرسِل، سالبٌ في المستقبِل.
    const branchClosing = async (accountId: string, branchId: string) =>
      (await asOwner(http().get(`/reports/ledger?accountId=${accountId}&branchId=${branchId}`)).expect(200)).body.closing as string;
    expect(await branchClosing(byCode.get('1190')!, northId)).toBe('480.00');
    expect(await branchClosing(byCode.get('1190')!, southId)).toBe('-480.00');
    expect(await branchClosing(byCode.get('5900')!, northId)).toBe('20.00');
    expect(await branchClosing(successor.account.id, southId)).toBe('480.00');
    expect(await branchClosing(successor.account.id, northId)).toBe('0.00');
  });

  it('والمغلقُ لا يُنقل ثانيةً، ولا يُنقل إلى فرعه، والاسمُ المأخوذُ في الهدف يُسمّى', async () => {
    const drawer = await fundedDrawer('درج الرفض', 0);
    await asOwner(http().post(`/cash-drawers/${drawer.id}/transfer`)).send({ toBranchId: northId, countedAmount: 0, date: '2026-09-24' }).expect(400);

    await asOwner(http().post('/cash-drawers')).send({ name: 'درج الرفض', branchId: southId }).expect(201);
    const taken = await asOwner(http().post(`/cash-drawers/${drawer.id}/transfer`)).send({ toBranchId: southId, countedAmount: 0, date: '2026-09-24' }).expect(409);
    expect(String(taken.body.message)).toContain('درج الرفض');

    const moved = await asOwner(http().post(`/cash-drawers/${drawer.id}/transfer`)).send({ toBranchId: southId, countedAmount: 0, date: '2026-09-24', name: 'درج الرفض ٢' }).expect(201);
    // المعدودُ صفرٌ والدفترُ صفر ⟸ لا قيد (قيدٌ بصفرٍ ضجيج).
    expect(moved.body.entries).toEqual({ variance: null, out: null, in: null });
    await asOwner(http().post(`/cash-drawers/${drawer.id}/transfer`)).send({ toBranchId: southId, countedAmount: 0, date: '2026-09-24', name: 'درج الرفض ٣' }).expect(409);
  });

  /**
   * **الموظّف** (`ق-١٤١٥`): النقلُ للقادم — يتغيّر فرعُه من هذا الطلب ويراه فرعُه الجديد في الطلب التالي، **والفرعُ
   * السابق شرطٌ وأثر**: طلبٌ يذكر فرعاً غيرَ فرعه الحاليّ يُرفض (نقلان متسابقان)، والسجلُّ يحفظ الفرعين معاً.
   */
  it('⭐ الموظّفُ يُنقل للقادم: فرعُه من هذا الطلب، والسابقُ شرطٌ في الطلب وأثرٌ في سجلّ التدقيق', async () => {
    const employee = (await asOwner(http().post('/employees')).send({ fullName: `موظّف النقل ${suffix}`, hireDate: '2026-01-01', branchId: northId }).expect(201)).body;
    const moved = await asOwner(http().post(`/employees/${employee.id}/transfer`)).send({ fromBranchId: northId, toBranchId: southId }).expect(201);
    expect(moved.body.branchId).toBe(southId);
    expect((await asOwner(http().get(`/employees/${employee.id}`)).expect(200)).body.branchId).toBe(southId);

    // نقلٌ ثانٍ يذكر الشمالَ سابقاً — والموظّفُ لم يعد فيه: متسابقٌ متأخّر يُرفض ولا يُطبَّق.
    await asOwner(http().post(`/employees/${employee.id}/transfer`)).send({ fromBranchId: northId, toBranchId: northId }).expect(409);
    // وإلى فرعه نفسِه ليس نقلاً.
    await asOwner(http().post(`/employees/${employee.id}/transfer`)).send({ fromBranchId: southId, toBranchId: southId }).expect(400);
    // وغيابُ السابق ليس «للمنشأة كلِّها» — يُرفض بالتحقّق.
    await asOwner(http().post(`/employees/${employee.id}/transfer`)).send({ toBranchId: northId }).expect(400);

    // والسجلُّ يحفظ الفرعين معاً — الأثرُ الذي كان يضيع مع أوّل نقل.
    type Entry = { details: Record<string, unknown> | null };
    const deadline = Date.now() + 5000;
    let found: Entry | undefined;
    while (!found && Date.now() < deadline) {
      const entries = (await asOwner(http().get('/audit-log?limit=200')).expect(200)).body as Entry[];
      found = entries.find((e) => JSON.stringify(e.details ?? {}).includes(southId) && JSON.stringify(e.details ?? {}).includes(northId));
      if (!found) await new Promise((r) => setTimeout(r, 100));
    }
    expect(found).toBeDefined();
  });

  it('والنقلُ فعلُ مالك: موظّفٌ مقيَّدٌ بفرعٍ لا ينقل موظّفاً ولا درجاً ولو ملك الشاشة', async () => {
    const template = await asOwner(http().post('/templates')).send({ name: `النقل ${suffix}`, allowedScreens: ['dashboard', 'employees'] }).expect(201);
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظّف الشمال', username: `north-transfer-${suffix}`, password: 'TransferPass123!', permissionTemplateId: template.body.id, branchIds: [northId] })
      .expect(201);
    const token = (await http().post('/auth/login').send({ username: `north-transfer-${suffix}`, password: 'TransferPass123!' }).expect(200)).body.accessToken;
    const employee = (await asOwner(http().post('/employees')).send({ fullName: `موظّف الرفض ${suffix}`, hireDate: '2026-01-01', branchId: northId }).expect(201)).body;
    await http().post(`/employees/${employee.id}/transfer`).set('Authorization', `Bearer ${token}`).send({ fromBranchId: northId, toBranchId: southId }).expect(403);
    const drawer = await fundedDrawer('درج الموظّف المقيَّد', 0);
    await http().post(`/cash-drawers/${drawer.id}/transfer`).set('Authorization', `Bearer ${token}`).send({ toBranchId: southId, countedAmount: 0, date: '2026-09-24' }).expect(403);
  });

  it('والعدُّ عدٌّ لكلِّ ما في الدفتر: قيدٌ على الدرج بعد تاريخ العدّ يوقف النقلَ مسمّىً', async () => {
    const drawer = await fundedDrawer('درج متأخّر', 100);
    await asOwner(http().post('/journal'))
      .send({ date: '2026-09-28', memo: 'بعد العدّ', lines: [{ accountId: drawer.account.id, debit: 10, credit: 0 }, { accountId: revenueId, debit: 0, credit: 10 }] })
      .expect(201);
    const refused = await asOwner(http().post(`/cash-drawers/${drawer.id}/transfer`)).send({ toBranchId: southId, countedAmount: 100, date: '2026-09-24' }).expect(409);
    expect(String(refused.body.message)).toContain('2026-09-24');
  });
});
