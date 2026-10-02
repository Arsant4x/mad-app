import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(180000);

/**
 * ⚖️ **إلغاءُ العقد يُصحّح الضريبةَ بإشعارٍ دائن** (توجيه ٢٧٥ · `ق-١٥٨٢`، بحكم صاحب المشروع — يحسم ج-4 من مراجعة 3.3).
 *
 * ج-4 كما ثبت: قسطٌ تجاريٌّ قُبض مقدَّماً ثم أُلغي العقدُ قبل مدّته وردّ المقبوضَ للمستأجر — **فيُردّ الصافي وحدَه**، وتبقى
 * ضريبتُه على `2200` وفي الإقرار لتوريدٍ لم يقع؛ لأن العكسَ مقصورٌ على الأقساط غيرِ المقبوضة.
 *
 * الحالةُ هنا: عقدٌ تجاريٌّ غيرُ شاملٍ للضريبة بألفٍ شهرياً (1,150 بالضريبة) بدأ أوّلَ الشهر الماضي. يقبض المالكُ قسطَ الشهر
 * القادم مقدَّماً (1,150، ضريبتُه 150 عند القبض)، ثم يُلغى العقدُ اليوم بردّ المقبوض. **والصوابُ**: إشعارٌ دائنٌ يعكس صافيَ
 * القسط وضريبتَه، ويُردّ للمستأجر ما دفعه كاملاً — فلا ضريبةَ تبقى ولا نقدَ يبقى عندنا من هذا القسط.
 */
describe('إلغاءُ العقد يُصحّح ضريبةَ المقبوض مقدَّماً بإشعارٍ دائن (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const today = iso(now);
  const quarter = { year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), 0));
  const nextMonth = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));

  let contractId: string;

  const balance = async (code: string) => Number(((await auth(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[]).find((a) => a.code === code)?.balance ?? 0);
  const rentVat = async () => Number(((await auth(http().get('/obligations/vat-declaration')).query(quarter).expect(200)).body as { rent: { standardVat: string } }).rent.standardVat);
  const snapshot = async () => ({ cash: await balance('1000'), outputVat: await balance('2200'), receivable: await balance('1200'), returnVat: await rentVat() });
  const round = (n: number) => Math.round(n * 100) / 100;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'cancel-credit');
    const property = (await auth(http().post('/properties')).send({ name: `عقار الإلغاء ${suffix}`, ownership: 'owned' }).expect(201)).body;
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `CN-${suffix}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body;
    const customerId = await createTenantCustomer(app, company.token, `مستأجر الإلغاء ${suffix}`);
    contractId = (
      await auth(http().post('/contracts'))
        .send({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId, value: 12000, cycle: 'monthly', start: iso(start), end: iso(end) })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 16.5] 🔴 قسطُ الشهر القادم المقبوضُ مقدَّماً يُعكس بضريبته عند الإلغاء ويُردّ كاملاً: يخرج النقدُ كلُّه وتنقص ضريبتُه كلُّها في الدفتر والإقرار', async () => {
    const contract = (await auth(http().get(`/contracts/${contractId}`)).expect(200)).body as { installments: { id: string; dueDate: string }[] };
    const future = contract.installments.find((i) => i.dueDate.slice(0, 10) === nextMonth);
    expect(future).toBeDefined();

    const before = await snapshot();
    await auth(http().post(`/contracts/${contractId}/payments`)).send({ date: today, amount: 1150, method: 'CASH', installmentId: future!.id }).expect(201);
    const paid = await snapshot();
    // `keep`: الأقساطُ غيرُ المقبوضة تبقى كما هي — فلا يُعكس قسطُ هذا الشهر حين يقع الاختبارُ أوّلَ الشهر (استحقاقُه = يومُ الإلغاء)،
    // والمقيسُ وحدَه هو المقبوضُ مقدَّماً.
    await auth(http().post(`/contracts/${contractId}/cancel`))
      .send({ cancelDate: today, cancelReason: `إلغاءٌ بردّ المقدَّم ${suffix}`, installmentDisposition: 'keep', unearnedDisposition: 'refund' })
      .expect(201);
    const after = await snapshot();

    /**
     * ⚠️ **والإلغاءُ اليوم يمسّ قسطَ هذا الشهر أيضاً** (أمسكه أوّلُ سقوط): ما بعد يوم الإلغاء منه مستحقٌّ لم يُقبض، فيُعكس بالمسار
     * القائم (`settleUnpaidUnearnedWithinTx`) — يُنقص الذمّةَ بإجماليّه وضريبتَه بـ15/115 منه، وقدرُه يتبع يومَ التشغيل في الشهر.
     * فيُفصل بالحساب: ما نقص من الذمّة عند الإلغاء هو إجماليُّ ذلك الجزء وحدَه (ردُّ المقدَّم يُنقصها ثم يردّها)، وضريبتُه 15/115
     * منه؛ **وما زاد عليها من نقص الضريبة هو ضريبةُ القسط المقدَّم**، والنقدُ الخارج كلُّه ردُّه.
     */
    const cancelReceivable = round(after.receivable - paid.receivable);
    const currentMonthTax = round((-cancelReceivable * 15) / 115);
    expect({
      // الضابطُ: القبضُ وقع بضريبته — فالمسبارُ يرى ما يُعكس.
      paid: { cash: round(paid.cash - before.cash), outputVat: round(paid.outputVat - before.outputVat), returnVat: round(paid.returnVat - before.returnVat) },
      // والحكم: عند الإلغاء يخرج للمستأجر ما دفعه كاملاً، وتنقص ضريبتُه كلُّها فوق ضريبة جزء هذا الشهر، في الدفتر والإقرار.
      atCancel: {
        cash: round(after.cash - paid.cash),
        prepaidTaxOnBooks: Math.abs(round(after.outputVat - paid.outputVat + currentMonthTax) + 150) <= 0.02,
        prepaidTaxInReturn: Math.abs(round(after.returnVat - paid.returnVat + currentMonthTax) + 150) <= 0.02,
      },
    }).toEqual({
      paid: { cash: 1150, outputVat: 150, returnVat: 150 },
      atCancel: { cash: -1150, prepaidTaxOnBooks: true, prepaidTaxInReturn: true },
    });
  });
});
