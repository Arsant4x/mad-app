import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (10.9 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(35000);

/**
 * تقريرُ الفرق (`ق-٢٨٥/٣`) — «الرصيدُ الدفتريّ مقابل ما كان يُعرض».
 *
 * ⚠️ **والانحرافُ يُزرع في العمود مباشرةً عمداً**: السطرُ اليدويُّ **لم يعد
 * يحرّك شيئاً** (`ق-٢٨١`)، فلا سبيلَ لإنتاج الفرق عبر الواجهة بعد اليوم.
 * والحالةُ التي بُني لها التقرير **تاريخيةٌ بطبيعتها** — عمودٌ حرّكته أسطرٌ
 * قديمة — فتُزرع كما كانت لا كما يسهل إنشاؤها.
 */
describe('تقريرُ الفرق البنكيّ (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  // منشأةٌ معزولة (ق-٧٢٢): البنكُ يُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  let bankId: string;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const suffix = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'bank-diff');
    token = company.token;
    companyId = company.companyId;

    const bank = (
      await auth(http().post('/banks'))
        .send({ name: `بنكُ الفرق ${suffix}`, openingBalance: 1000, openingDate: '2026-01-01' })
        .expect(201)
    ).body as { id: string };
    bankId = bank.id;
  }, 30000);

  afterAll(async () => {
    await auth(http().delete(`/banks/${bankId}`));
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  interface Row {
    bankId: string;
    bankName: string;
    accountCode: string | null;
    /** ② نصٌّ بخانتين (`ق-١٢٣٥`) — يُقارَن حرفاً. */
    ledgerBalance: string;
    shownBalance: string;
    difference: string;
    unpostedCount: number;
    unpostedSum: string;
  }
  interface Body {
    rows: Row[];
    totals: { ledgerBalance: string; shownBalance: string; difference: string; unpostedCount: number };
    bankCashSeparatedOn: string | null;
  }

  const report = async (): Promise<Body> => (await auth(http().get('/reports/bank-difference')).expect(200)).body as Body;
  const rowOfBank = (body: Body): Row => {
    const row = body.rows.find((r) => r.bankId === bankId);
    if (!row) throw new Error('بنكُ المجموعة غائبٌ عن التقرير — وهو أنشئ في التهيئة');
    return row;
  };

  it('بنكٌ متّسق: الدفتريُّ والمعروضُ سواء، والفرقُ صفر', async () => {
    const row = rowOfBank(await report());
    expect(row.ledgerBalance).toBe('1000.00');
    expect(row.shownBalance).toBe('1000.00');
    expect(row.difference).toBe('0.00');
  }, 20000);

  it('🔴 وانحرافٌ تاريخيّ في العمود يظهر فرقاً — ويُفسَّر بأسطرٍ لا يعرفها الأستاذ', async () => {
    // ما كانت تفعله الشاشةُ قبل ق-٢٨١: سطرٌ يدويّ يزيح العمود ولا يُرحَّل.
    await auth(http().post('/transactions'))
      .send({ bankId, date: '2026-06-05', description: `مطابقةٌ يدوية ${suffix}`, amount: 500 })
      .expect(201);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.bank.update({ where: { id: bankId }, data: { balance: 1500 } }));

    const row = rowOfBank(await report());
    expect(row.ledgerBalance).toBe('1000.00');
    expect(row.shownBalance).toBe('1500.00');
    expect(row.difference).toBe('500.00');
    // والتفسير: سطرٌ واحد بلا رقم قيد، مجموعه ٥٠٠ — **فالفرقُ مسمّى لا مجهول**.
    expect(row.unpostedCount).toBe(1);
    expect(row.unpostedSum).toBe('500.00');
  }, 20000);

  it('🔴 وإعلانُ ق-٢٨٣ مشتقٌّ من أول قيدٍ على حسابِ بنك — لا مكتوبٌ بيد', async () => {
    const body = await report();
    // المجموعةُ تسأل بالرابط لا بنطاق الرموز: «حسابُ بنك» تعريفُه أن بنكاً
    // يشير إليه — ورمزٌ في النطاق قد يكون حساباً يدوياً لا بنكاً.
    const first = await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const ids = (await tx.bank.findMany({ select: { accountId: true } })).map((b) => b.accountId).filter(Boolean) as string[];
      return tx.journalEntry.findFirst({
        where: { lines: { some: { accountId: { in: ids } } } },
        orderBy: { date: 'asc' },
        select: { date: true },
      });
    });
    if (!first) throw new Error('لا قيدَ على حسابِ بنك — والمجموعة أنشأت بنكاً برصيدٍ افتتاحيّ');
    expect(body.bankCashSeparatedOn).toBe(first.date.toISOString().slice(0, 10));
  }, 20000);

  it('ولا يعدّ سطراً رحّله الأستاذ ضمن ما لا يعرفه — والتصنيفُ بغياب رقم القيد لا بقيمة `source`', async () => {
    const before = rowOfBank(await report());
    // `source` حقلٌ يكتبه المستخدم: من كتب فيه اسمَ مصدرٍ مولَّد يبقى سطرُه
    // يدوياً، **لأن الأستاذ لم يرحّله** — فلا رقمَ قيدٍ له.
    await auth(http().post('/transactions'))
      .send({ bankId, date: '2026-06-06', description: `مطابقةٌ متنكّرة ${suffix}`, amount: 70, source: 'customer-payment' })
      .expect(201);

    const after = rowOfBank(await report());
    expect(after.unpostedCount).toBe(before.unpostedCount + 1);
    expect(after.unpostedSum).toBe('570.00');
  }, 20000);
});
