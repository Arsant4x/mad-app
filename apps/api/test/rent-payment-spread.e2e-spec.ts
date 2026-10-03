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
 * ⚖️ **دفعةٌ واحدة عن عدّة أقساط يُوزَّع زائدُها على الأقساط التالية بترتيب استحقاقها** (توجيه ٢٧٥ · `ق-١٥٨٢`، بحكم صاحب
 * المشروع — يحسم ج-3 من مراجعة 3.3).
 *
 * ج-3 كما ثبت: دفعةٌ على قسطٍ تزيد عليه، فيصير الزائدُ صفَّ استحقاقٍ «بلا قسطٍ مرتبط» بتاريخه (ضريبتُه مرّة)، ثم يحلّ كلُّ قسطٍ
 * تالٍ كاملاً عند موعده (ضريبتُه مرّةً ثانية)، **وتظهر ذمّةٌ على مستأجرٍ دفع**.
 *
 * الحالةُ هنا: عقدٌ تجاريٌّ غيرُ شاملٍ للضريبة بألفٍ شهرياً (1,150 بالضريبة)، بدأ قبل شهرين فحلّت أقساطُه الثلاثة الأولى
 * واستُحقّت (ضريبتُها 450). يدفع المستأجرُ 3,450 على القسط الأوّل. **والصوابُ**: يُسدَّد الثلاثةُ كلٌّ بـ1,150، فلا ضريبةَ تزيد،
 * ولا ذمّةَ تبقى، ولا صفَّ «بلا قسط».
 */
describe('دفعةٌ عن عدّة أقساط تُوزَّع بترتيب الاستحقاق (e2e)', () => {
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
  let customerId: string;
  let propertyId: string;

  const balance = async (code: string) => Number(((await auth(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[]).find((a) => a.code === code)?.balance ?? 0);
  const contract = async () => (await auth(http().get(`/contracts/${contractId}`)).expect(200)).body as { installments: Installment[]; payments: Payment[] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'rent-spread');
    const property = (await auth(http().post('/properties')).send({ name: `عقار التوزيع ${suffix}`, ownership: 'owned' }).expect(201)).body;
    propertyId = property.id;
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `SP-${suffix}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body;
    customerId = await createTenantCustomer(app, company.token, `مستأجر التوزيع ${suffix}`);
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

  it('[SPEC 16.3] 🔴 3,450 على القسط الأوّل تُسدّد الأقساطَ الثلاثة الحالّة: كلٌّ مسدَّد، ولا ضريبةَ تزيد، ولا ذمّةَ تبقى', async () => {
    const before = await contract();
    const due = before.installments.filter((i) => i.dueDate.slice(0, 10) <= today);
    expect(due.length).toBe(3);
    const vatBefore = await balance('2200');
    const receivableBefore = await balance('1200');

    await auth(http().post(`/contracts/${contractId}/payments`)).send({ date: today, amount: 3450, method: 'CASH', installmentId: due[0].id }).expect(201);

    const after = await contract();
    const statusOf = (id: string) => after.installments.find((i) => i.id === id)?.status;
    const paidTo = (id: string) => after.payments.filter((p) => p.installmentId === id).reduce((s, p) => s + Number(p.amount), 0);
    expect({
      statuses: due.map((i) => statusOf(i.id)),
      paidTo: due.map((i) => paidTo(i.id)),
      unlinked: after.payments.filter((p) => p.installmentId === null).length,
      vatDelta: Math.round(((await balance('2200')) - vatBefore) * 100) / 100,
      receivableDelta: Math.round(((await balance('1200')) - receivableBefore) * 100) / 100,
    }).toEqual({
      statuses: ['PAID', 'PAID', 'PAID'],
      paidTo: [1150, 1150, 1150],
      unlinked: 0,
      vatDelta: 0,
      // الذمّةُ قبل الدفع = الأقساطُ الثلاثة الحالّة (3,450)، فتنقص بها كاملة. (وكانت تنقص 1,150 فقط: 3,450 قبضاً − 2,300 استحقاقاً «بلا قسط».)
      receivableDelta: -3450,
    });
  });

  it('[SPEC 16.3] ⚖️ زائدُ دفعةٍ على قسطٍ حديثٍ يذهب إلى أقدم قسطٍ مفتوح في العقد نفسِه، لا إلى ما يليه (ق-١٦٠٢/④)', async () => {
    // عقدٌ ثانٍ بالشكل نفسِه: ثلاثةُ أقساطٍ حلّت (1,150 لكلٍّ بالضريبة)، ولا دفعَ قبلُ.
    const unit2 = (await auth(http().post('/units')).send({ propertyId, unitNo: `SP2-${suffix}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body;
    const second = (
      await auth(http().post('/contracts'))
        .send({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', unitId: unit2.id, customerId, value: 12000, cycle: 'monthly', start: iso(start), end: iso(end) })
        .expect(201)
    ).body.id as string;
    const read = async () => (await auth(http().get(`/contracts/${second}`)).expect(200)).body as { installments: Installment[]; payments: Payment[] };
    const ordered = [...(await read()).installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const due = ordered.filter((i) => i.dueDate.slice(0, 10) <= today);
    expect(due.length).toBe(3);
    const next = ordered.find((i) => i.dueDate.slice(0, 10) > today)!;

    // 2,300 على القسط الثالث (أحدثِ الحالّ): يُسدَّد هو، والزائدُ 1,150 إلى الأوّل (أقدمِ المفتوح) لا إلى الرابع الذي لم يحلّ.
    await auth(http().post(`/contracts/${second}/payments`)).send({ date: today, amount: 2300, method: 'CASH', installmentId: due[2].id }).expect(201);

    const after = await read();
    const paidTo = (id: string) => after.payments.filter((p) => p.installmentId === id).reduce((s, p) => s + Number(p.amount), 0);
    const statusOf = (id: string) => after.installments.find((i) => i.id === id)?.status;
    expect({
      paidTo: [...due.map((i) => paidTo(i.id)), paidTo(next.id)],
      statuses: [statusOf(due[0].id), statusOf(due[2].id)],
      unlinked: after.payments.filter((p) => p.installmentId === null).length,
    }).toEqual({
      paidTo: [1150, 0, 1150, 0],
      statuses: ['PAID', 'PAID'],
      unlinked: 0,
    });
  });
});
