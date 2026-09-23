import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (`ق-١٢٨٥`) — **ثلاثةُ أضعاف المقيس لا رقمٌ مختار**: الحزمةُ `21.6 s`
//    على القاعدة النظيفة، وجُلُّها في `beforeAll` (تركيبُ `AppModule` ثم منشأتان وعميل).
jest.setTimeout(60000);

/**
 * **الموافقةُ التسويقية قبل أوّل رسالة** (`ق-١٣٠٣` · ك/⑰A1).
 *
 * ① العميلُ يُولد **بلا موافقةٍ في أيّ قناة** — والصمتُ ليس موافقة (النظام م٢٥).
 * ② والموافقةُ تُجيز قناتَها وحدَها (اللائحة م٢٨/٢: لكلِّ قناةٍ خيارُها).
 * ③ 🔴 والرجوعُ يغلبها في أيّ وقت (النظام م٥/٢) — **وصفٌّ جديد لا تعديلٌ للأوّل**.
 * ④ والسجلُّ يبقى كاملاً بعد الرجوع — فالإثباتُ يُحفظ (م٢٨/٣).
 * ⑤ وواقعةٌ لا تغيّر شيئاً تُردّ مسمّاةً.
 * ⑥ وتاريخٌ من المستقبل يُردّ — فالواقعةُ تُسجَّل بعد وقوعها.
 * ⑦ وقناةٌ أو مصدرٌ خارج الكتالوج يُردّ.
 * ⑧ والعزلُ: موافقةُ منشأةٍ لا تُقرأ من أخرى.
 */
describe('الموافقةُ التسويقية (e2e)', () => {
  let app: INestApplication;
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  let customerId: string;

  const http = () => request(app.getHttpServer());
  const asA = (r: request.Test) => r.set('Authorization', `Bearer ${a.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    a = await registerIsolatedCompany(app, 'consent-a');
    b = await registerIsolatedCompany(app, 'consent-b');
    const created = await asA(http().post('/customers')).send({ name: `عميلُ الموافقة ${Date.now()}`, kind: 'NATURAL' }).expect(201);
    customerId = created.body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, b);
    await removeIsolatedCompany(app, a);
    await app.close();
  });

  const state = async () => (await asA(http().get(`/customers/${customerId}/marketing-consent`)).expect(200)).body;
  const record = (body: Record<string, unknown>) => asA(http().post(`/customers/${customerId}/marketing-consent`)).send(body);

  it('① يُولد بلا موافقةٍ في أيّ قناة — والصمتُ ليس موافقة', async () => {
    const body = await state();
    expect(body.events).toEqual([]);
    for (const channel of ['SMS', 'EMAIL', 'WHATSAPP']) {
      expect(body.channels[channel]).toEqual({ allowed: false, reason: 'NEVER_GRANTED' });
    }
  });

  it('⭐ ② والموافقةُ تُجيز قناتَها وحدَها', async () => {
    await record({ channel: 'SMS', granted: true, source: 'IN_PERSON' }).expect(201);
    const body = await state();
    expect(body.channels.SMS.allowed).toBe(true);
    expect(body.channels.EMAIL.allowed).toBe(false);
    // ومن سجّلها مختومٌ معها — فالإثباتُ بلا مسجِّلٍ دعوى.
    expect(body.events[0].actorType).toBe('COMPANY');
    expect(body.events[0].source).toBe('IN_PERSON');
  });

  it('🔴 ③ والرجوعُ يغلبها — في أيّ وقت', async () => {
    await record({ channel: 'SMS', granted: false, source: 'PHONE' }).expect(201);
    const body = await state();
    expect(body.channels.SMS.allowed).toBe(false);
    expect(body.channels.SMS.reason).toBe('WITHDRAWN');
  });

  it('🔴 ④ والسجلُّ يبقى كاملاً بعد الرجوع — فالإثباتُ يُحفظ', async () => {
    const body = await state();
    expect(body.events).toHaveLength(2);
    expect(body.events.map((e: { granted: boolean }) => e.granted).sort()).toEqual([false, true]);
  });

  it('⑤ وواقعةٌ لا تغيّر شيئاً تُردّ مسمّاةً', async () => {
    const res = await record({ channel: 'SMS', granted: false, source: 'PHONE' }).expect(409);
    expect(String(res.body.message)).toContain('نفسها');
    expect((await state()).events).toHaveLength(2);
  });

  it('🔴 ⑥ وتاريخٌ من المستقبل يُردّ — فالواقعةُ تُسجَّل بعد وقوعها', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await record({ channel: 'EMAIL', granted: true, source: 'WEB_FORM', at: tomorrow }).expect(400);
    expect(String(res.body.message)).toContain('المستقبل');
    expect((await state()).channels.EMAIL.allowed).toBe(false);
  });

  it('⑦ وقناةٌ أو مصدرٌ خارج الكتالوج يُردّ', async () => {
    await record({ channel: 'PIGEON', granted: true, source: 'IN_PERSON' }).expect(400);
    await record({ channel: 'EMAIL', granted: true, source: 'GUESSED' }).expect(400);
  });

  it('🔴 ⑧ والعزل: منشأةٌ أخرى لا تقرأ موافقةَ عميلِ الأولى', async () => {
    await http().get(`/customers/${customerId}/marketing-consent`).set('Authorization', `Bearer ${b.token}`).expect(404);
    await http().post(`/customers/${customerId}/marketing-consent`).set('Authorization', `Bearer ${b.token}`).send({ channel: 'SMS', granted: true, source: 'IN_PERSON' }).expect(404);
  });
});
