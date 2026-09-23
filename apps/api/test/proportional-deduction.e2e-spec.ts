import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): تُنشئ منشأةً معزولة وعقاراً وعقدين وأربعَ مشتريات.
jest.setTimeout(180000);

/**
 * ⑥A1 (`ق-١٣٢٥`) — **الخصمُ النسبيّ لضريبة المدخلات** (اللائحةُ التنفيذية م٥١).
 *
 * **المنشأةُ مختلطةٌ بالبناء**: بيعٌ خاضعٌ بـ`1,000` ومعفىً بـ`1,000` في الفترة نفسِها،
 * فالنسبةُ **نصفٌ بالضبط** — ورقمٌ يُحسب يداً هو الحَكَم لا مطابقةُ شكلَين (`ق-٧١٥`).
 *
 * والمشترياتُ أربع: منسوبةٌ للخاضع `150` · للمعفى `150` · مشتركةٌ `300` · ومشتركةٌ ثانية `100`.
 * ⇒ القابلُ للخصم = `150 + (400 × 0.5)` = **`350`** · وغيرُ القابل = `150 + 200` = **`350`**.
 * **والخطأُ الشائع** `(150+150+400) × 0.5 = 350` **يتصادف مع الصواب**، فاختيرت الأرقامُ
 * بحيث يفترقان: انظر المرحلة ④.
 */
describe('⑥A1 — الخصمُ النسبيّ (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  const Q = { year: 2026, quarter: 2 };
  let supplierId = '';

  /** فاتورةُ شراءٍ بضريبةٍ بإسنادٍ مُعلَن — `subtotal` صافياً و`taxAmount` يُشتقّ بـ15%. */
  const buy = (subtotal: number, inputVatUse?: string) =>
    auth(http().post('/purchases'))
      .send({ supplierId, date: '2026-05-05', subtotal, ...(inputVatUse ? { inputVatUse } : {}) })
      .expect(201);

  const declaration = async () => (await auth(http().get('/obligations/vat-declaration')).query(Q).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'prop-vat');

    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل' }).expect(201)).body.id;
    supplierId = (await auth(http().post('/suppliers')).send({ name: 'مورّد' }).expect(201)).body.id;

    // توريدٌ خاضع 1,000 — والضريبةُ عليه 150.
    await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-05-10', dueDate: '2026-06-10', lines: [{ description: 'خاضع', quantity: 1, unitPrice: 1000, taxRate: 15 }] })
      .expect(201);
    // توريدٌ معفى 1,000 — بفئةٍ معفاة (إيجارُ سكنيّ: VATEX-SA-29).
    await auth(http().post('/invoices'))
      .send({
        customerId,
        issueDate: '2026-05-10',
        dueDate: '2026-06-10',
        lines: [{ description: 'معفى', quantity: 1, unitPrice: 1000, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
      })
      .expect(201);
  }, 240000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('① النسبةُ تُعلَن ولا تُخترع — وبلا إعلانٍ لا يُخصم المشترَك، بحدٍّ حاجبٍ يقول ما يُفعَل', async () => {
    await buy(1000, 'MIXED'); // ضريبتُها 150
    const d = await declaration();
    expect(d.proportional.applies).toBe(true);
    expect(d.proportional.ratio).toBeNull();
    // ⚠️ **ولا خصمَ كاملاً بلا نسبة**: المشتركُ كلُّه خارج الخصم حتى تُعلَن.
    expect(d.proportional.apportionedBase).toBe('150.00');
    expect(d.proportional.deductibleInputVat).toBe('0.00');
    const blocking = d.limits.find((l: { code: string }) => l.code === 'PROPORTIONAL_RATIO_NOT_DECLARED');
    expect(blocking?.severity).toBe('blocking');
    expect(blocking?.message).toContain('م٥١');
  });

  it('② المقترَحُ يحمل تحفّظَه: لا سنةَ ماضيةَ في النظام ⟵ تقديرٌ لا حساب (م٥١/٦)', async () => {
    const r = (await auth(http().get('/obligations/vat-ratio')).query({ year: 2026 }).expect(200)).body;
    expect(r.declared).toBeNull();
    // لا فواتيرَ في 2025 أصلاً — فالمقترَحُ `null` **ولا يُخترع صفرٌ يمنع كلَّ خصم**.
    expect(r.suggestion.ratio).toBeNull();
    expect(r.suggestion.basedOnYear).toBe(2025);
    expect(r.suggestion.coversPreviousYear).toBe(false);
    expect(r.suggestion.note).toContain('تُقدَّر');
  });

  it('③ النسبةُ المعلَنة تُطبَّق — ونصفٌ بالضبط لأن الخاضعَ والمعفى متساويان', async () => {
    await auth(http().post('/obligations/vat-ratio')).send({ year: 2026, ratio: 0.5, basis: 'ESTIMATED' }).expect(201);
    const d = await declaration();
    expect(d.proportional.ratio).toBe(0.5);
    expect(d.proportional.basis).toBe('ESTIMATED');
    expect(d.proportional.apportionedDeductible).toBe('75.00'); // 150 × 0.5
    expect(d.proportional.deductibleInputVat).toBe('75.00');
    expect(d.proportional.nonDeductibleInputVat).toBe('75.00');
    expect(d.limits.map((l: { code: string }) => l.code)).not.toContain('PROPORTIONAL_RATIO_NOT_DECLARED');
    // والصافي: ضريبةُ المخرجات 150 − المخصوم 75 = 75.
    expect(d.netVat).toBe('75.00');
  });

  it('④ ⚠️ النسبةُ في المشترك وحدَه — وجوابٌ محسوبٌ يداً يفرّق الصوابَ عن الخطأ الشائع', async () => {
    await buy(1000, 'TAXABLE_ONLY'); // +150 كاملاً
    await buy(400, 'EXEMPT_ONLY'); //  +60  لا شيء
    const d = await declaration();
    // الأكياس: خاضعٌ حصراً 150 · معفى حصراً 60 · مشتركٌ 150.
    expect(d.proportional.buckets.taxableOnly).toBe('150.00');
    expect(d.proportional.buckets.exemptOnly).toBe('60.00');
    expect(d.proportional.apportionedBase).toBe('150.00');
    // **الصواب**: 150 + (150 × 0.5) = 225.
    expect(d.proportional.deductibleInputVat).toBe('225.00');
    // **والخطأ الشائع** (ضربُ النسبة في المدخلات كلِّها): (150+60+150) × 0.5 = 180 — مختلفٌ فيُمسَك.
    expect(d.proportional.deductibleInputVat).not.toBe('180.00');
    expect(d.proportional.nonDeductibleInputVat).toBe('135.00'); // 60 + 75
    // والشقّان يستويان بمجموع ضريبة المشتريات كلِّها.
    expect(Number(d.proportional.deductibleInputVat) + Number(d.proportional.nonDeductibleInputVat)).toBeCloseTo(Number(d.purchasesStandardVat), 2);
  });

  it('⑤ غيابُ الإسناد ليس خصماً كاملاً: الافتراضُ مشتركٌ بحكم م٥١/٣', async () => {
    const before = await declaration();
    await buy(200); // بلا `inputVatUse` — ضريبتُها 30
    const after = await declaration();
    // دخلت المشتركَ لا الخاضعَ حصراً: الوعاءُ زاد 30 والخاضعُ حصراً لم يتغيّر.
    expect(Number(after.proportional.apportionedBase) - Number(before.proportional.apportionedBase)).toBeCloseTo(30, 2);
    expect(after.proportional.buckets.taxableOnly).toBe(before.proportional.buckets.taxableOnly);
    // ⇒ فالخصمُ زاد بنصفها لا بكلِّها.
    expect(Number(after.proportional.deductibleInputVat) - Number(before.proportional.deductibleInputVat)).toBeCloseTo(15, 2);
  });

  it('⑥ التصنيفُ يُصحَّح بالتعديل، و`LEGACY_UNASSIGNED` مرفوضةٌ لصفٍّ جديد', async () => {
    const purchaseId = (await buy(100, 'MIXED')).body.id;
    await auth(http().patch(`/purchases/${purchaseId}`)).send({ inputVatUse: 'TAXABLE_ONLY' }).expect(200);
    const d = await declaration();
    expect(Number(d.proportional.buckets.taxableOnly)).toBeCloseTo(165, 2); // 150 + 15
    // ⛔ ولا رجوعَ إلى «لا أعرف» بعد المعرفة — ولا قبولَها في الإنشاء.
    await auth(http().patch(`/purchases/${purchaseId}`)).send({ inputVatUse: 'LEGACY_UNASSIGNED' }).expect(400);
    await auth(http().post('/purchases')).send({ supplierId, date: '2026-05-05', subtotal: 50, inputVatUse: 'LEGACY_UNASSIGNED' }).expect(400);
  });

  it('⑦ منشأةٌ خاضعةٌ وحدَها لا يجب عليها شيءٌ من م٥١ — ولا يُنقص خصمُها', async () => {
    // الربعُ الأول: لا معفى فيه (المستنداتُ كلُّها في مايو).
    const d = (await auth(http().get('/obligations/vat-declaration')).query({ year: 2026, quarter: 1 }).expect(200)).body;
    expect(d.proportional.applies).toBe(false);
    expect(d.proportional.ratio).toBe(1);
    expect(d.limits.map((l: { code: string }) => l.code)).not.toContain('PROPORTIONAL_RATIO_NOT_DECLARED');
  });

  it('⑧ التسويةُ السنوية في آخر فترةٍ وحدَها (م٥١/٧) — وتُقرّ فتُختم', async () => {
    // الربعُ الثاني ليس الأخير — فلا تسوية.
    expect((await declaration()).proportional.settlement).toBeNull();

    const q4 = (await auth(http().get('/obligations/vat-declaration')).query({ year: 2026, quarter: 4 }).expect(200)).body;
    // ⚠️ الربعُ الرابعُ بلا توريداتٍ فيه، **والتسويةُ تقرأ السنةَ كلَّها** — فتظهر.
    expect(q4.proportional.applies).toBe(false); // لا معفى في الربع الرابع نفسِه
    // فتُقرأ التسويةُ من مسارها: نسبةُ السنة الفعلية نصفٌ (1000 خاضع · 1000 معفى).
    const settled = (await auth(http().post('/obligations/vat-ratio/settle')).send({ year: 2026 }).expect(201)).body;
    expect(settled.actualRatio).toBe(0.5);
    expect(settled.appliedRatio).toBe(0.5);
    expect(settled.difference).toBe(0); // طُبِّقت النسبةُ الصحيحة فلا فرق
    expect(settled.settledAt).not.toBeNull();

    // وتغييرُ المطبَّقة يُنتج فرقاً محسوباً يداً: الوعاءُ السنويّ 180 (150+30)، و(0.5−0.25)×180 = 45.
    await auth(http().post('/obligations/vat-ratio')).send({ year: 2026, ratio: 0.25, basis: 'ESTIMATED' }).expect(201);
    const again = (await auth(http().post('/obligations/vat-ratio/settle')).send({ year: 2026 }).expect(201)).body;
    expect(Number(again.yearApportionedBase)).toBeCloseTo(180, 2);
    expect(again.difference).toBeCloseTo(45, 2);
  });
});
