import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(120000);

/**
 * المركز المالي يتوازن من المستندات (التحقق من ادعاء «لا يتوازن، والفجوة = صافي الربح»، my-decisions-v2 §٧).
 *
 * الادعاء في CLAUDE.md §9 ب وفي حال-المشروع-2026-09-30.md:20 قِيس على aa-test قبل ق-١٢٧٩ (9ffe91d8، #546)،
 * والخادم الذي قِيس عليه أُغلق؛ فيُقاس هنا على منشأةٍ معزولة. والحارس القائم balance-sheet-as-of يثبته
 * بقيدين يدويين، وهذا يثبته بمسارَي الترحيل الآليّين: فاتورة بيع وفاتورة شراء.
 *
 * الأرقام محسوبة يداً (ق-٧١٥):
 *   بيعٌ 1,000 بفئة S ⟵ مدين 1200 بـ1,150 · دائن 4100 بـ1,000 · دائن 2200 بـ150
 *   شراءٌ معفى 400 بلا فئة ⟵ مدين 5300 بـ400 · دائن 2100 بـ400
 *   الأصول 1,150 = الخصوم 550 + حقوق الملكية 600 (نتيجة الفترة: 1,000 ناقص 400)
 *
 * وضابطان موجبان (القاعدة الدائمة ٢٩): ③ حسابُ الفجوة يرى الفجوةَ القديمة حين يُسقَط سطرُ النتيجة،
 * و④ علَمُ balanced نفسُه يصير false على دفترٍ غير متوازن (قيد الكسور، البند 2 من المراجعة 3.3).
 */
interface Line {
  code: string;
  name: string;
  amount: string;
}
interface Sheet {
  asOf: string | null;
  assets: Line[];
  totalAssets: string;
  liabilities: Line[];
  equity: Line[];
  totalLiabilitiesAndEquity: string;
  balanced: boolean;
}

const PERIOD_RESULT = 'نتيجة الفترة';
/** هللاتٌ صحيحة من نصّ المبلغ، فالمساواة تامّة لا تقريبية. */
const halalas = (amount: string): number => Math.round(Number(amount) * 100);
const total = (lines: Line[]): number => lines.reduce((s, l) => s + halalas(l.amount), 0);
const amountOf = (lines: Line[], code: string): string | undefined => lines.find((l) => l.code === code)?.amount;

describe('المركز المالي يتوازن بعد فاتورة بيع وفاتورة شراء من المستندات (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let probe: IsolatedCompany | undefined;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const withToken = (c: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);
  const sheet = async (c: IsolatedCompany, to?: string): Promise<Sheet> =>
    (await withToken(c)(http().get('/reports/balance-sheet')).query(to ? { to } : {}).expect(200)).body as Sheet;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'bs-docs');
    const owner = withToken(company);
    const customerId = await createTenantCustomer(app, company.token, `عميل المركز ${suffix}`);
    const invoice = await owner(http().post('/invoices'))
      .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: `بيع المركز ${suffix}`, quantity: 1, unitPrice: 1000, taxCategory: 'S' }] })
      .expect(201);
    const supplierId = (await owner(http().post('/suppliers')).send({ name: `مورد المركز ${suffix}` }).expect(201)).body.id as string;
    const purchase = await owner(http().post('/purchases')).send({ supplierId, date: today, subtotal: 400, exempt: true }).expect(201);
    // المسبار يقرأ قيوداً وقعت فعلاً، لا مستنداتٍ بلا ترحيل (المعيار الحاسم في default-chart).
    expect({ invoicePosted: Boolean(invoice.body.journalEntryId), purchasePosted: Boolean(purchase.body.journalEntryId) }).toEqual({
      invoicePosted: true,
      purchasePosted: true,
    });
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, probe);
    await app.close();
  });

  it('① الأصول 1,150 = الخصوم 550 + حقوق الملكية 600، وbalanced صادق', async () => {
    const s = await sheet(company);
    expect({
      receivables: amountOf(s.assets, '1200'),
      totalAssets: s.totalAssets,
      outputVat: amountOf(s.liabilities, '2200'),
      payables: amountOf(s.liabilities, '2100'),
      periodResult: s.equity.find((e) => e.name.includes(PERIOD_RESULT))?.amount,
      totalLiabilitiesAndEquity: s.totalLiabilitiesAndEquity,
      balanced: s.balanced,
    }).toEqual({
      receivables: '1150.00',
      totalAssets: '1150.00',
      outputVat: '150.00',
      payables: '400.00',
      periodResult: '600.00',
      totalLiabilitiesAndEquity: '1150.00',
      balanced: true,
    });
    // المساواة من السطور نفسها، لا من مجاميع الخادم وحدها.
    expect(total(s.assets)).toBe(total(s.liabilities) + total(s.equity));
  });

  it('② بتاريخ اليوم كذلك، ونتيجة الفترة تساوي صافي ربح قائمة الدخل', async () => {
    const s = await sheet(company, today);
    const income = (await withToken(company)(http().get('/reports/income-statement')).expect(200)).body as { netProfit: string };
    expect({
      asOf: s.asOf,
      balanced: s.balanced,
      periodResult: s.equity.find((e) => e.name.includes(PERIOD_RESULT))?.amount,
      netProfit: income.netProfit,
    }).toEqual({ asOf: today, balanced: true, periodResult: '600.00', netProfit: '600.00' });
  });

  it('③ ضابطٌ موجب للحساب: بلا سطر النتيجة تعود الفجوة القديمة، وتساوي صافي الربح 600 حرفياً', async () => {
    const s = await sheet(company);
    const equityWithoutResult = s.equity.filter((e) => !e.name.includes(PERIOD_RESULT));
    expect(halalas(s.totalAssets) - (total(s.liabilities) + total(equityWithoutResult))).toBe(60000);
  });

  it('④ ضابطٌ موجب لعلَم balanced: قيدٌ يدويّ بكسورٍ يُقبل ويُخزَّن غير متوازن، فيقول المركز المالي false', async () => {
    probe = await registerIsolatedCompany(app, 'bs-probe');
    const accounts = (await withToken(probe)(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const idOf = (code: string) => accounts.find((a) => a.code === code)!.id;
    const posted = await withToken(probe)(http().post('/journal')).send({
      date: today,
      memo: `قيد كسور ${suffix}`,
      lines: [
        { accountId: idOf('1000'), debit: 0.005, credit: 0 },
        { accountId: idOf('4100'), debit: 0, credit: 0.0045 },
      ],
    });
    // 201 على main اليوم (البند 2 من المراجعة 3.3). إن صار 400 فقد أُصلح البند، ويُستبدل هذا الضابط بحقنٍ في القاعدة.
    expect(posted.status).toBe(201);
    const s = await sheet(probe);
    expect({ totalAssets: s.totalAssets, totalLiabilitiesAndEquity: s.totalLiabilitiesAndEquity, balanced: s.balanced }).toEqual({
      totalAssets: '0.01',
      totalLiabilitiesAndEquity: '0.00',
      balanced: false,
    });
  });
});