import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (105.2 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(316000);

/**
 * ⚖️ `ق-١٣٤٥` (الحزمة م①) — **هويّةُ الموظف ورقمُ حسابه ورقمُ تأميناته تُشفَّر في التطبيق من أوّل حقل.**
 *
 * بنصّ المالك: «فالنصُّ الصريح في القاعدة يصل كلَّ نسخةٍ ومقلب، والتشفيرُ لاحقاً لا يستعيد ما خرج … ومعرّفُ المفتاح يُحفظ
 * مع كلِّ قيمةٍ مشفَّرة … وبصمةٌ ثانيةٌ بمفتاحٍ منفصل للبحث برقم الهويّة.»
 *
 * **يُقرأ الصفُّ من القاعدة نفسِها** (لا من ردّ الخادم) فيُثبَت أن النصَّ الصريح لم يُكتب — ويُقرأ سجلُّ التدقيق كذلك.
 */
describe('⚖️ هويّةُ الموظف مشفَّرةٌ في التطبيق (e2e · ق-١٣٤٥)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const as = (c: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);

  const NATIONAL_ID = '1234567890';
  const IBAN = 'SA0380000000608010167519'; // آيبانٌ صحيحُ التحقّق بالمعيار الدوليّ (ISO 13616) — مثالٌ منشور لا حساب
  const INSURANCE = '44556677';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    a = await registerIsolatedCompany(app, 'identity-a');
    b = await registerIsolatedCompany(app, 'identity-b');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, a);
    await removeIsolatedCompany(app, b);
    await app.close();
  });

  const rawRow = (c: IsolatedCompany, id: string) =>
    tenantPrisma.runInTenantContext(c.companyId, (tx) =>
      tx.$queryRaw<Record<string, string | null>[]>`SELECT * FROM employees WHERE id = ${id}`.then((r) => r[0]),
    );

  let employeeId = '';

  it('① يُكتب مشفَّراً: لا نصَّ صريحاً في أيّ عمود، والصيغةُ تحمل معرّفَ المفتاح', async () => {
    const res = await as(a)(http().post('/employees'))
      .send({ fullName: 'موظفُ الهويّة', hireDate: '2026-01-01', nationalId: NATIONAL_ID, salaryIban: IBAN, socialInsuranceNo: INSURANCE })
      .expect(201);
    employeeId = res.body.id;
    // الردُّ لا يحمل نصّاً مشفَّراً ولا بصمة — وعلامةُ الوجود وحدَها.
    expect(JSON.stringify(res.body)).not.toContain(NATIONAL_ID);
    expect(res.body).not.toHaveProperty('nationalIdCipher');
    expect(res.body.identityOnFile).toEqual({ nationalId: true, salaryIban: true, socialInsuranceNo: true });

    const row = await rawRow(a, employeeId);
    const whole = JSON.stringify(row);
    // مصادقةُ المسبار: الصفُّ قُرئ فعلاً (الاسمُ فيه) — ثم لا نصَّ صريحاً من الثلاثة.
    expect(whole).toContain('موظفُ الهويّة');
    for (const plain of [NATIONAL_ID, IBAN, INSURANCE]) expect(whole).not.toContain(plain);
    expect(row.nationalIdCipher).toMatch(/^f1:test1:/);
    expect(row.salaryIbanCipher).toMatch(/^f1:test1:/);
    expect(row.socialInsuranceNoCipher).toMatch(/^f1:test1:/);
    expect(row.nationalIdIndex).toMatch(/^b1:tb1:/);
  });

  it('② التفصيلُ يفكّ لمن يملك الاطّلاع، والقائمةُ لا تحمله', async () => {
    const detail = await as(a)(http().get(`/employees/${employeeId}`)).expect(200);
    expect({ id: detail.body.nationalId, iban: detail.body.salaryIban, gosi: detail.body.socialInsuranceNo }).toEqual({ id: NATIONAL_ID, iban: IBAN, gosi: INSURANCE });
    const list = await as(a)(http().get('/employees')).expect(200);
    // القائمةُ مصفوفةٌ بلا وسائط صفحة، وصفحةٌ بها — والحكمُ واحد.
    const rows = (Array.isArray(list.body) ? list.body : list.body.items) as Record<string, unknown>[];
    const listed = rows.find((e) => e.id === employeeId)!;
    expect(listed).toBeDefined();
    expect(JSON.stringify(listed)).not.toContain(NATIONAL_ID);
    expect(listed).not.toHaveProperty('nationalIdIndex');
  });

  it('③ البحثُ برقم الهويّة ببصمته — ولا تتطابق البصمةُ عبر المنشآت', async () => {
    const found = await as(a)(http().post('/employees/find-by-national-id')).send({ nationalId: ' 1234-567890 ' }).expect(200);
    expect((found.body as { id: string }[]).map((e) => e.id)).toEqual([employeeId]);
    const other = await as(b)(http().post('/employees')).send({ fullName: 'موظفٌ في منشأةٍ أخرى', hireDate: '2026-01-01', nationalId: NATIONAL_ID }).expect(201);
    const [ra, rb] = [await rawRow(a, employeeId), await rawRow(b, other.body.id)];
    expect(ra.nationalIdIndex).not.toEqual(rb.nationalIdIndex);
    // ومنشأةُ ب لا تجد موظفَ أ بالرقم نفسِه.
    const fromB = await as(b)(http().post('/employees/find-by-national-id')).send({ nationalId: NATIONAL_ID }).expect(200);
    expect((fromB.body as { id: string }[]).map((e) => e.id)).toEqual([other.body.id]);
  });

  it('④ النصُّ المشفَّر مربوطٌ بصفّه: نسخُه إلى موظفٍ آخر يفشل فكُّه لا يُقرأ بياناً لغيره', async () => {
    const second = await as(a)(http().post('/employees')).send({ fullName: 'موظفٌ ثانٍ', hireDate: '2026-01-01' }).expect(201);
    const row = await rawRow(a, employeeId);
    // النصُّ ببصمته معاً — قيدُ القاعدة يمنع أحدَهما بلا الآخر (فالنسخُ «الكامل» هو ما يُجرَّب).
    await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.employee.update({ where: { id: second.body.id }, data: { nationalIdCipher: row.nationalIdCipher, nationalIdIndex: row.nationalIdIndex } }),
    );
    await as(a)(http().get(`/employees/${second.body.id}`)).expect(500);
  });

  it('⑤ سجلُّ التدقيق يكتب أن الحقلَ تغيّر ولا يكتب قيمتَه', async () => {
    await as(a)(http().patch(`/employees/${employeeId}`)).send({ nationalId: '1098765432' }).expect(200);
    // الأثرُ يُكتب بلا انتظار عمداً (لا يُبطئ الطلب) — فيُستطلع حتى يظهر سطرُ التعديل، ثم يُقرأ.
    let logs: { action: string; details: unknown }[] = [];
    for (let i = 0; i < 50; i++) {
      logs = await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.auditLog.findMany({ where: { entityId: employeeId }, select: { action: true, details: true } }));
      if (JSON.stringify(logs).includes('nationalId')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const text = JSON.stringify(logs);
    // مصادقةُ المسبار: السجلُّ قُرئ وفيه الحقل — ثم لا قيمة.
    expect(text).toContain('nationalId');
    for (const plain of [NATIONAL_ID, '1098765432', IBAN, INSURANCE]) expect(text).not.toContain(plain);
  });

  it('⑥ آيبانٌ بتحقّقٍ خاطئ يُرفض بالمعيار الدوليّ لا بطول دولة', async () => {
    await as(a)(http().post('/employees')).send({ fullName: 'آيبانٌ خاطئ', hireDate: '2026-01-01', salaryIban: 'SA0380000000608010167518' }).expect(400);
  });

  it('⑦ تدويرُ المفتاح: الجديدُ يُكتب بمعرّفه والقديمُ يُقرأ بمعرّفه — بلا إعادة تشفير', async () => {
    const before = { keys: process.env.PII_ENCRYPTION_KEYS, id: process.env.PII_ENCRYPTION_KEY_ID };
    try {
      process.env.PII_ENCRYPTION_KEYS = `${before.keys},test2:${Buffer.alloc(32, 7).toString('base64')}`;
      process.env.PII_ENCRYPTION_KEY_ID = 'test2';
      const fresh = await as(a)(http().post('/employees')).send({ fullName: 'بعد التدوير', hireDate: '2026-01-01', nationalId: '2233445566' }).expect(201);
      expect((await rawRow(a, fresh.body.id)).nationalIdCipher).toMatch(/^f1:test2:/);
      // القديمُ (test1) يُفكّ بمعرّفه من الحلقة.
      expect((await as(a)(http().get(`/employees/${employeeId}`)).expect(200)).body.nationalId).toBe('1098765432');
    } finally {
      process.env.PII_ENCRYPTION_KEYS = before.keys;
      process.env.PII_ENCRYPTION_KEY_ID = before.id;
    }
  });
});
