import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (10.7 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(35000);

/**
 * تقرير مصاريف التأسيس (gap-analysis §1).
 *
 * Grouped by line item and kept apart from the general expense report, because
 * setting a business up is a one-off investment — folding it into running costs
 * makes the first year's operating performance read far worse than it is.
 *
 * Assertions are **deltas** between two reads: the shared dev DB carries other
 * runs' establishment purchases, so absolute totals would be flaky.
 */
describe('Incorporation expenses report (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: string;
  let isolated: IsolatedCompany | undefined;
  const created: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ITEM = `رسوم ترخيص ${suffix}`;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  interface Report {
    total: number;
    invoiceCount: number;
    amortizedCount: number;
    items: { item: string; count: number; total: number; method: string }[];
  }

  const report = async (): Promise<Report> => (await auth(request(app.getHttpServer()).get('/purchases/incorporation-report')).expect(200)).body;

  async function buy(body: Record<string, unknown>) {
    const res = await auth(request(app.getHttpServer()).post('/purchases'))
      .send({ supplierId, date: '2025-05-01', ...body })
      .expect(201);
    created.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    const s = await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورد تأسيس ${suffix}` }).expect(201);
    supplierId = s.body.id;
  }, 60000);

  afterAll(async () => {
    for (const id of created) await auth(request(app.getHttpServer()).delete(`/purchases/${id}`));
    if (supplierId) await auth(request(app.getHttpServer()).delete(`/suppliers/${supplierId}`));
    await removeIsolatedCompany(app, isolated);
    await app.close();
  });

  it('فئةٌ بمسافةٍ لاحقة لا تسقط من التقرير — والقرار صار بالرمز لا بالنصّ', async () => {
    // العلّة التي أُغلقت: `resolveAmortization` كان يشذّب و`incorporationReport` لا
    // يشذّب. ففاتورةٌ فئتها 'مصروفات تأسيس ' **تمرّ من فحص الإطفاء وتغيب من التقرير**
    // — لا خطأ ولا صفر ظاهر، بل مبلغٌ ناقص في مجموعٍ يقرأه التاجر.
    const item = `بندٌ بمسافة ${Date.now()}`;
    const before = await report();
    await buy({ subtotal: 700, category: ' مصروفات تأسيس ', incorpItem: item, amortize: true, amortizeMonths: 12 });

    const after = await report();
    expect(after.invoiceCount).toBe(before.invoiceCount + 1);
    expect(after.items.find((i) => i.item === item)?.count).toBe(1);
  });

  it('[SPEC 5.5] counts only establishment purchases, grouped by line item', async () => {
    const before = await report();

    // Two on the same item, plus an unrelated category that must NOT appear.
    await buy({ subtotal: 1000, category: 'مصروفات تأسيس', incorpItem: ITEM });
    await buy({ subtotal: 500, category: 'مصروفات تأسيس', incorpItem: ITEM });
    await buy({ subtotal: 900, category: 'مواد خام' });

    const after = await report();
    expect(after.invoiceCount).toBe(before.invoiceCount + 2);

    const row = after.items.find((i) => i.item === ITEM);
    expect(row).toBeTruthy();
    expect(row!.count).toBe(2);
    // 1500 net in base currency; the recoverable 15% VAT is an asset in 1250, not a cost.
    expect(row!.total).toBeCloseTo(1500, 2);
    expect(row!.method).toBe('دفعة واحدة');
  }, 60000);

  it('[SPEC 5.5] labels an amortized item with its period, and counts it', async () => {
    const before = await report();
    const amortItem = `تجهيزات ${suffix}`;
    await buy({ subtotal: 2400, category: 'مصروفات تأسيس', incorpItem: amortItem, amortize: true, amortizeMonths: 24 });

    const after = await report();
    expect(after.amortizedCount).toBe(before.amortizedCount + 1);
    expect(after.items.find((i) => i.item === amortItem)!.method).toBe('استهلاك (24 شهر)');
  }, 60000);

  it('totals exclude recoverable VAT and agree with the formation expense account in the ledger', async () => {
    const iso = await registerIsolatedCompany(app, 'incorp-vat');
    isolated = iso;
    const isoAuth = (r: request.Test) => r.set('Authorization', `Bearer ${iso.token}`);
    const sup = await isoAuth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورد تأسيس ${suffix}` }).expect(201);
    const recoverableItem = `recoverable ${suffix}`;
    const excludedItem = `excluded ${suffix}`;
    const purchaseIds: string[] = [];
    for (const body of [
      { subtotal: 1000, category: 'مصروفات تأسيس', incorpItem: recoverableItem },
      { subtotal: 1000, category: 'مصروفات تأسيس', incorpItem: excludedItem, excludeFromVat: true },
    ]) {
      const res = await isoAuth(request(app.getHttpServer()).post('/purchases'))
        .send({ supplierId: sup.body.id, date: '2025-05-01', ...body })
        .expect(201);
      purchaseIds.push(res.body.id);
    }

    const isoReport: Report = (await isoAuth(request(app.getHttpServer()).get('/purchases/incorporation-report')).expect(200)).body;
    expect(isoReport.items.find((i) => i.item === recoverableItem)?.total).toBeCloseTo(1000, 2);
    expect(isoReport.items.find((i) => i.item === excludedItem)?.total).toBeCloseTo(1150, 2);
    expect(isoReport.total).toBeCloseTo(2150, 2);

    const ledger = await app.get(TenantPrismaService).runInTenantContext(iso.companyId, async (tx) => {
      const docs = await tx.purchase.findMany({
        where: { id: { in: purchaseIds } },
        select: { journalEntryId: true, nonDeductibleVatEvents: { select: { journalEntryId: true } } },
      });
      const entryIds = docs.flatMap((d) => [d.journalEntryId, ...d.nonDeductibleVatEvents.map((e) => e.journalEntryId)]).filter((x): x is string => !!x);
      const lines = await tx.journalLine.findMany({
        where: { journalEntryId: { in: entryIds }, account: { code: '5500' } },
        select: { debit: true, credit: true },
      });
      return lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    });
    expect(isoReport.total).toBeCloseTo(ledger, 2);
  }, 90000);

  it('still reports an establishment purchase that has no line item', async () => {
    const before = await report();
    await buy({ subtotal: 300, category: 'مصروفات تأسيس' });

    const after = await report();
    const unlabelled = after.items.find((i) => i.item === 'بدون بند محدَّد');
    expect(unlabelled).toBeTruthy();
    // Dropping unlabelled rows would make the report disagree with the ledger.
    expect(after.total).toBeCloseTo(before.total + 300, 2);
  }, 60000);
});
