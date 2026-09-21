import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * ميزان المراجعة (احتياجات 10.4) + التصدير (10.12): يقرأ من القيود الحقيقية،
 * إجماليا المدين والدائن متطابقان حتماً، الفترة والفرع يرشّحان فعلاً،
 * والـCSV يخرج بعربية سليمة (BOM) وبأعمدته المسماة.
 */
describe('Trial balance + CSV export (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let cashCode: string;
  let revenueCode: string;
  let branchId: string;
  const entryIds: [string, string][] = [];
  const accountIds: string[] = [];

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;

    // حسابان مخصصان لهذا الاختبار كي لا نعتمد على أرصدة البذرة المتحركة.
    cashCode = `19${Date.now() % 100000}`;
    revenueCode = `49${Date.now() % 100000}`;
    const cash = await auth(request(app.getHttpServer()).post('/accounts')).send({ code: cashCode, name: `صندوق ميزان ${suffix}`, type: 'asset' }).expect(201);
    const rev = await auth(request(app.getHttpServer()).post('/accounts')).send({ code: revenueCode, name: `إيراد ميزان ${suffix}`, type: 'revenue' }).expect(201);
    accountIds.push(cash.body.id, rev.body.id);

    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع الميزان ${suffix}` }).expect(201)).body.id;

    // قيد داخل الفترة (على الفرع) + قيد خارجها — الميزان يجب أن يرى الأول فقط.
    const inPeriod = await auth(request(app.getHttpServer()).post('/journal'))
      .send({
        date: '2026-05-10',
        memo: `قيد داخل الفترة ${suffix}`,
        branchId,
        lines: [
          { accountId: cash.body.id, debit: 750, credit: 0 },
          { accountId: rev.body.id, debit: 0, credit: 750 },
        ],
      })
      .expect(201);
    const outPeriod = await auth(request(app.getHttpServer()).post('/journal'))
      .send({
        date: '2026-07-20',
        memo: `قيد خارج الفترة ${suffix}`,
        lines: [
          { accountId: cash.body.id, debit: 111, credit: 0 },
          { accountId: rev.body.id, debit: 0, credit: 111 },
        ],
      })
      .expect(201);
    entryIds.push([inPeriod.body.id, '2026-05-10'], [outPeriod.body.id, '2026-07-20']);
  }, 60000);

  afterAll(async () => {
    // التنظيفُ بالعكس لا بالحذف (ق-١٢٥٣/①) بتاريخ كلِّ أصل — والحساباتُ تبقى بأثرها (`409` على حذفها، يُتجاهَل).
    for (const [id, date] of entryIds) await auth(request(app.getHttpServer()).post(`/journal/${id}/reverse`)).send({ date });
    for (const id of accountIds) await auth(request(app.getHttpServer()).delete(`/accounts/${id}`));
    await app.close();
  });

  it('[SPEC 10.4] balances by construction and honors the period filter', async () => {
    const res = await auth(request(app.getHttpServer()).get('/reports/trial-balance?from=2026-05-01&to=2026-05-31')).expect(200);
    expect(res.body.balanced).toBe(true);
    // ② المبالغُ نصٌّ بخانتين (`ق-١٢٣٥`) — الإجماليان يتساويان حرفاً، والصفوفُ تُقارَن حرفاً.
    expect(res.body.totalDebit).toMatch(/^-?\d+\.\d{2}$/);
    expect(res.body.totalDebit).toBe(res.body.totalCredit);

    const cashRow = res.body.rows.find((r: { code: string }) => r.code === cashCode);
    expect(cashRow.debitTotal).toBe('750.00');
    expect(cashRow.balanceDebit).toBe('750.00');
    expect(cashRow.balanceCredit).toBe('0.00');

    const revRow = res.body.rows.find((r: { code: string }) => r.code === revenueCode);
    expect(revRow.creditTotal).toBe('750.00');
    expect(revRow.balanceCredit).toBe('750.00');
  }, 60000);

  it('[SPEC 10.4] honors the branch filter — the branchless entry disappears', async () => {
    const res = await auth(request(app.getHttpServer()).get(`/reports/trial-balance?branchId=${branchId}`)).expect(200);
    const cashRow = res.body.rows.find((r: { code: string }) => r.code === cashCode);
    // القيد خارج الفترة بلا فرع — فلا يظهر هنا رغم غياب مرشّح التاريخ.
    expect(cashRow.debitTotal).toBe('750.00');
    expect(res.body.balanced).toBe(true);
  }, 60000);

  it('exports CSV with a BOM and named Arabic columns', async () => {
    const res = await auth(request(app.getHttpServer()).get('/reports/trial-balance/export?from=2026-05-01&to=2026-05-31')).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('trial-balance-2026-05-01');
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM — عربية Excel سليمة.
    expect(text).toContain('رمز الحساب');
    expect(text).toContain(cashCode);
    expect(text).toContain('750');
  }, 60000);
});
