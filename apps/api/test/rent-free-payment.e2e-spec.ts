import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): منشأةٌ وعقدٌ وقبضٌ واحد؛ لم تُقَس بعد، فالسقفُ مئةٌ وعشرون ثانية معلنةً هنا.
jest.setTimeout(120000);

/**
 * ⚖️ **دفعةُ الإيجار الحرّة** (توجيه ٢٧٦ · ٢و · `ق-١٦٠٩`/و، بنصّ التوجيه: «و«دفعةُ الإيجار الحرّة» إن ثبت أنها تُظهر المستأجرَ متأخّراً وهو دفع.
 * قِس ثم أصلح بالقاعدة ٣٧»).
 *
 * مسحُ الدفعات (`docs/domain-scan/34`، م٦) وجد أن «الدفعةَ الحرّة بلا قسط» إحدى أربعٍ تُظهر المسدِّدَ متأخّراً. **يُقاس هنا**: عقدٌ تجاريٌّ غيرُ
 * شاملٍ للضريبة بألفٍ شهرياً (1,150 بالضريبة) حلّت أقساطُه الثلاثة الأولى واستُحقّت (ضريبتُها 450)، ثم يدفع المستأجرُ 1,150 **بلا تسمية قسط**.
 * **والصوابُ** محسوبٌ يداً: المالُ لأقدم قسطٍ مفتوح (`ق-١٦٠٢`/④ «الأقدمُ استحقاقاً داخل العقد نفسِه»)، فالأوّلُ مسدَّد، **ولا ضريبةَ تزيد**
 * (الأقساطُ استُحقّت ضريبتُها، والدفعةُ تسدّد ذمّتَها لا توريداً جديداً)، والذمّةُ تنقص 1,150، ولا صفَّ «بلا قسط».
 */
describe('دفعةُ الإيجار الحرّة لا تُظهر المستأجرَ متأخّراً وهو دفع (ق-١٦٠٩/و)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const today = iso(now);
  // أوّلُ الشهر قبل شهرين — فالأقساطُ الثلاثة الأولى حلّت (أوّلَ كلِّ شهر) حتى اليوم.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), 0));

  type Installment = { id: string; dueDate: string; status: string };
  type Payment = { id: string; installmentId: string | null; amount: string };
  let contractId: string;

  const balance = async (code: string) => Number(((await auth(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[]).find((a) => a.code === code)?.balance ?? 0);
  const contract = async () => (await auth(http().get(`/contracts/${contractId}`)).expect(200)).body as { installments: Installment[]; payments: Payment[] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'rent-free');
    const property = (await auth(http().post('/properties')).send({ name: `عقار الدفعة الحرّة ${suffix}`, ownership: 'owned' }).expect(201)).body;
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `FR-${suffix}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body;
    const customerId = await createTenantCustomer(app, company.token, `مستأجر الدفعة الحرّة ${suffix}`);
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

  it('🔴 1,150 بلا تسمية قسط تسدّد أقدمَ قسطٍ حالّ: مسدَّد، ولا ضريبةَ تزيد، والذمّةُ تنقص بها، ولا صفَّ بلا قسط', async () => {
    const before = await contract();
    const due = [...before.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).filter((i) => i.dueDate.slice(0, 10) <= today);
    expect(due.length).toBe(3);
    const vatBefore = await balance('2200');
    const receivableBefore = await balance('1200');

    await auth(http().post(`/contracts/${contractId}/payments`)).send({ date: today, amount: 1150, method: 'CASH' }).expect(201);

    const after = await contract();
    const statusOf = (id: string) => after.installments.find((i) => i.id === id)?.status;
    expect({
      oldest: statusOf(due[0].id),
      unlinked: after.payments.filter((p) => p.installmentId === null).length,
      vatDelta: Math.round(((await balance('2200')) - vatBefore) * 100) / 100,
      receivableDelta: Math.round(((await balance('1200')) - receivableBefore) * 100) / 100,
    }).toEqual({ oldest: 'PAID', unlinked: 0, vatDelta: 0, receivableDelta: -1150 });
  });

  /**
   * ⚖️ **ما زاد على الحالّ يذهب إلى القسط القادم** (توجيه ٢٧٧ · ٢ب · `ق-١٦١٤`، بحكم صاحب المشروع: «فيُوزَّع إيرادُه على شهره»). كان الزائدُ
   * دفعةً مقدَّمة بلا قسط تُعترف فوراً (`ق-٤٧٣`). **والجوابُ محسوبٌ يداً**: بقي قسطان حالّان (2,300 بالضريبة) بعد الحالة الأولى، فـ2,875 تسدّدهما
   * و575 للقسط القادم: صافيه 500 يُؤجَّل في `2400` حتى يحلّ شهرُه، وضريبتُه 75 تُستحقّ يومَ القبض (م٢٠)، ولا يُعترف بشيءٍ في `4200` اليوم،
   * والذمّةُ تنقص 2,300 (ما استُحقّ) ولا صفَّ بلا قسط.
   */
  it('⚖️ وما زاد على الحالّ يذهب إلى القسط القادم فيُؤجَّل إيرادُه إلى شهره، ولا صفَّ بلا قسط (ق-١٦١٤)', async () => {
    const before = await contract();
    const sorted = [...before.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const due = sorted.filter((i) => i.dueDate.slice(0, 10) <= today);
    const next = sorted.find((i) => i.dueDate.slice(0, 10) > today)!;
    const [rentBefore, deferredBefore, vatBefore, receivableBefore] = [await balance('4200'), await balance('2400'), await balance('2200'), await balance('1200')];

    await auth(http().post(`/contracts/${contractId}/payments`)).send({ date: today, amount: 2875, method: 'CASH' }).expect(201);

    const after = await contract();
    const statusOf = (id: string) => after.installments.find((i) => i.id === id)?.status;
    const delta = async (code: string, was: number) => Math.round(((await balance(code)) - was) * 100) / 100;
    expect({
      due: due.map((i) => statusOf(i.id)),
      next: after.payments.filter((p) => p.installmentId === next.id).reduce((s, p) => s + Number(p.amount), 0),
      unlinked: after.payments.filter((p) => p.installmentId === null).length,
      rentDelta: await delta('4200', rentBefore),
      deferredDelta: await delta('2400', deferredBefore),
      vatDelta: await delta('2200', vatBefore),
      receivableDelta: await delta('1200', receivableBefore),
    }).toEqual({ due: ['PAID', 'PAID', 'PAID'], next: 575, unlinked: 0, rentDelta: 0, deferredDelta: 500, vatDelta: 75, receivableDelta: -2300 });
  });

  /**
   * ⚖️ **وما زاد على الأقساط كلِّها رصيدٌ للمستأجر لا إيراد** (توجيه ٢٧٧ · `ق-١٦٢٤`، بحكم صاحب المشروع: «ليس إيراداً، بل رصيدٌ للمستأجر
   * يُخصم من القادم أو يُردّ إليه، كما في `ق-١٢٦٤`»). **والجوابُ محسوبٌ يداً**: بقي من الأقساط 9,775 بالضريبة (575 من الرابع وثمانيةٌ بـ1,150)،
   * فـ10,005 تسدّدها كلَّها و230 تزيد: أصلُها 200 في `2450` وضريبتُها 30 يومَ القبض كمقدَّم سند القبض (`ق-١٢٦٤`/②، العقدُ تجاريٌّ خاضع)،
   * وما للأقساط القادمة مؤجَّلٌ صافيه 8,500 في `2400` وضريبتُه 1,275 يومَ القبض، **ولا يتحرّك الإيراد**.
   */
  it('⚖️ وما زاد على الأقساط كلِّها رصيدٌ للمستأجر في 2450 بضريبته يومَ القبض، لا إيراد (ق-١٦٢٤)', async () => {
    const [rentBefore, deferredBefore, vatBefore, creditBefore] = [await balance('4200'), await balance('2400'), await balance('2200'), await balance('2450')];

    await auth(http().post(`/contracts/${contractId}/payments`)).send({ date: today, amount: 10005, method: 'CASH' }).expect(201);

    const after = await contract();
    const delta = async (code: string, was: number) => Math.round(((await balance(code)) - was) * 100) / 100;
    expect({
      open: after.installments.filter((i) => i.status !== 'PAID').length,
      unlinked: after.payments.filter((p) => p.installmentId === null).reduce((s, p) => s + Number(p.amount), 0),
      rentDelta: await delta('4200', rentBefore),
      deferredDelta: await delta('2400', deferredBefore),
      vatDelta: await delta('2200', vatBefore),
      creditDelta: await delta('2450', creditBefore),
    }).toEqual({ open: 0, unlinked: 230, rentDelta: 0, deferredDelta: 8500, vatDelta: 1305, creditDelta: 200 });
  });

  it('⚖️ ولا خصمَ على رصيد: دفعةٌ بخصمٍ لا يقع جزؤها الأوّلُ على قسطٍ تُردّ برسالتها (ق-١٦٢٤)', async () => {
    const res = await auth(http().post(`/contracts/${contractId}/payments`)).send({ date: today, amount: 100, discount: 10, method: 'CASH' }).expect(400);
    expect(String(res.body.message)).toContain('رصيدٌ للمستأجر');
  });
});
