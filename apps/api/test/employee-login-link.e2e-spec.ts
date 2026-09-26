import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — أطولُ اختبارٍ 0.8 ث والحزمةُ 51 ث أوّلَ تشغيلٍ بترجمتها على `mad_app_clean_link`.
jest.setTimeout(240000);

/**
 * ⚖️ **الموظّفُ وحسابُ دخوله منفصلان، والربطُ صريحٌ من المالك** (`ق-١٤٤٥` · `ق-١٤٣٤`) — **والكاشيرُ على مناوبةٍ مفتوحة
 * لا يُنقل حسابُه حتى تُقفل** (`ق-١٤٤٦`).
 *
 * بنصّ المالك: «**`companyUserId` فريدٌ اختياريٌّ يضبطه المالكُ صراحةً، والقائمُ بلا ربطٍ حتى يُربط. ⛔ ولا ربطَ بالاسم.**» ·
 * «**يُمنع نقلُ حسابه حتى تُقفل، برسالةٍ تسمّيها ⇒ وهو حكمُ الصندوق نفسُه: الإغلاقُ قبل النقل.**»
 *
 * **وشاشةُ النقل** (`ق-١٤٣٤`) عقدُ المسار: ردُّ النقل يعرض الحسابَ المربوط وفروعَه، **وتغييرُها حقلٌ صريحٌ في الطلب نفسِه** —
 * فلا يتغيّر أحدُهما بالآخر صامتاً. (ولا شاشةَ ويب للنقل — `ق-١١٠١`.)
 */
describe('الموظّفُ وحسابُ دخوله — ربطٌ صريحٌ من المالك، ولا نقلَ لحسابٍ على مناوبةٍ مفتوحة (ق-١٤٤٥ · ق-١٤٤٦)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  let northId: string;
  let southId: string;
  let templateId: string;

  const newAccount = async (tag: string, branchIds: string[]) => {
    const username = `link-${tag}-${suffix}`;
    const res = await asOwner(http().post('/company-users')).send({ name: `حساب ${tag}`, username, password: 'LinkPass123!', permissionTemplateId: templateId, branchIds }).expect(201);
    const token = (await http().post('/auth/login').send({ username, password: 'LinkPass123!' }).expect(200)).body.accessToken as string;
    return { id: res.body.id as string, token };
  };
  const newEmployee = async (fullName: string, branchId: string) =>
    (await asOwner(http().post('/employees')).send({ fullName, hireDate: '2026-01-01', branchId }).expect(201)).body.id as string;
  const accountBranches = async (id: string) => {
    const rows = (await asOwner(http().get('/company-users')).expect(200)).body as { id: string; branches?: { branchId: string }[]; branchIds?: string[] }[];
    const row = rows.find((r) => r.id === id);
    return (row?.branchIds ?? row?.branches?.map((b) => b.branchId) ?? []).slice().sort();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'login-link');
    northId = (await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    southId = (await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    templateId = (await asOwner(http().post('/templates')).send({ name: `الموظفون والكاشير ${suffix}`, allowedScreens: ['dashboard', 'employees', 'pos'] }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.7] ① المالكُ يربط الموظّفَ بحسابه صراحةً — والقراءةُ تعرض الحسابَ وفروعَه، ويُفكّ بـnull', async () => {
    const account = await newAccount('a', [northId]);
    const employeeId = await newEmployee(`موظّف أ ${suffix}`, northId);
    const linked = (await asOwner(http().patch(`/employees/${employeeId}/login-account`)).send({ companyUserId: account.id }).expect(200)).body;
    expect(linked.loginAccount).toMatchObject({ id: account.id, branchIds: [northId] });
    const read = (await asOwner(http().get(`/employees/${employeeId}`)).expect(200)).body;
    expect(read.loginAccount?.id).toBe(account.id);
    const unlinked = (await asOwner(http().patch(`/employees/${employeeId}/login-account`)).send({ companyUserId: null }).expect(200)).body;
    expect(unlinked.loginAccount).toBeNull();
  });

  it('[SPEC 2.7] ② الحسابُ لموظّفٍ واحد — ربطُه بثانٍ يُرفض مسمّىً، والموظّفُ غيرُ المالك لا يربط', async () => {
    const account = await newAccount('b', [northId]);
    const first = await newEmployee(`موظّف ب١ ${suffix}`, northId);
    const second = await newEmployee(`موظّف ب٢ ${suffix}`, northId);
    await asOwner(http().patch(`/employees/${first}/login-account`)).send({ companyUserId: account.id }).expect(200);
    const clash = await asOwner(http().patch(`/employees/${second}/login-account`)).send({ companyUserId: account.id }).expect(409);
    expect(String(clash.body.message)).toContain(`موظّف ب١ ${suffix}`);
    await http().patch(`/employees/${second}/login-account`).set('Authorization', `Bearer ${account.token}`).send({ companyUserId: account.id }).expect(403);
  });

  it('[SPEC 2.7] ③ ⛔ لا ربطَ بالاسم — موظّفٌ وحسابٌ باسمٍ واحد يبقيان منفصلَين حتى يُربطا', async () => {
    const account = await newAccount('same', [northId]);
    const employeeId = await newEmployee('حساب same', northId);
    const read = (await asOwner(http().get(`/employees/${employeeId}`)).expect(200)).body;
    expect({ accountName: 'حساب same', linked: read.loginAccount ?? null }).toEqual({ accountName: 'حساب same', linked: null });
    expect(account.id).toBeTruthy();
  });

  it('[SPEC 2.7] ④ النقلُ يعرض الحسابَ المربوط وفروعَه ولا يغيّرها صامتاً — وتغييرُها صريحٌ في الطلب نفسِه', async () => {
    const account = await newAccount('c', [northId]);
    const employeeId = await newEmployee(`موظّف ج ${suffix}`, northId);
    await asOwner(http().patch(`/employees/${employeeId}/login-account`)).send({ companyUserId: account.id }).expect(200);

    const silent = (await asOwner(http().post(`/employees/${employeeId}/transfer`)).send({ fromBranchId: northId, toBranchId: southId }).expect(201)).body;
    expect(silent.branchId).toBe(southId);
    expect(silent.loginAccount).toMatchObject({ id: account.id, branchIds: [northId] });
    expect(await accountBranches(account.id)).toEqual([northId]);

    const explicit = (await asOwner(http().post(`/employees/${employeeId}/transfer`)).send({ fromBranchId: southId, toBranchId: northId, loginAccountBranchIds: [southId] }).expect(201)).body;
    expect(explicit.loginAccount).toMatchObject({ id: account.id, branchIds: [southId] });
    expect(await accountBranches(account.id)).toEqual([southId]);
  });

  it('[SPEC 2.7] ⑤ فروعُ حسابٍ في طلب نقلِ موظّفٍ بلا حسابٍ مربوط — تُرفض مسمّاةً ولا يُنقل شيء', async () => {
    const employeeId = await newEmployee(`موظّف د ${suffix}`, northId);
    const res = await asOwner(http().post(`/employees/${employeeId}/transfer`)).send({ fromBranchId: northId, toBranchId: southId, loginAccountBranchIds: [southId] }).expect(400);
    expect(String(res.body.message)).toContain('حساب');
    expect((await asOwner(http().get(`/employees/${employeeId}`)).expect(200)).body.branchId).toBe(northId);
  });

  it('[SPEC 27.1] 🔴 ⑥ حسابٌ على مناوبةٍ مفتوحة لا يُنقل عن فرعها — برسالةٍ تسمّيها، ثم يُنقل بعد إقفالها (ق-١٤٤٦)', async () => {
    const account = await newAccount('shift', [northId]);
    const shift = (await http().post('/pos/shifts').set('Authorization', `Bearer ${account.token}`).send({ openingFloat: 0, branchId: northId }).expect(201)).body;
    const blocked = await asOwner(http().patch(`/company-users/${account.id}`)).send({ branchIds: [southId] });
    expect({ status: blocked.status, names: String(blocked.body.message).includes(`الشمال ${suffix}`) }).toEqual({ status: 409, names: true });
    expect(await accountBranches(account.id)).toEqual([northId]);
    // ويبقى إضافةُ فرعٍ مع فرع المناوبة جائزة — فالمنعُ لإخراج الحساب من فرع مناوبته لا لكلِّ تعديل.
    await asOwner(http().patch(`/company-users/${account.id}`)).send({ branchIds: [northId, southId] }).expect(200);
    await http().post(`/pos/shifts/${shift.id}/close`).set('Authorization', `Bearer ${account.token}`).send({ declaredClosing: 0 }).expect(201);
    await asOwner(http().patch(`/company-users/${account.id}`)).send({ branchIds: [southId] }).expect(200);
    expect(await accountBranches(account.id)).toEqual([southId]);
  });

  it('[SPEC 27.1] 🔴 ⑦ ونقلُ الموظّف بفروع حسابه يُرفض كلُّه إن كان الحسابُ على مناوبةٍ مفتوحة — لا نصفَ نقل', async () => {
    const account = await newAccount('both', [northId]);
    const employeeId = await newEmployee(`موظّف هـ ${suffix}`, northId);
    await asOwner(http().patch(`/employees/${employeeId}/login-account`)).send({ companyUserId: account.id }).expect(200);
    await http().post('/pos/shifts').set('Authorization', `Bearer ${account.token}`).send({ openingFloat: 0, branchId: northId }).expect(201);
    await asOwner(http().post(`/employees/${employeeId}/transfer`)).send({ fromBranchId: northId, toBranchId: southId, loginAccountBranchIds: [southId] }).expect(409);
    expect((await asOwner(http().get(`/employees/${employeeId}`)).expect(200)).body.branchId).toBe(northId);
    expect(await accountBranches(account.id)).toEqual([northId]);
  });
});
