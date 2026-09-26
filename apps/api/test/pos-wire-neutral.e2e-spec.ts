import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — تُعلَن بعد أوّل تشغيل.
jest.setTimeout(240000);

/**
 * ⚖️ **حارسا الصدق ١ و٢ على سلك الكاشير** (`ق-١٤٤٨` · `ق-١٤٤٩`).
 *
 * ① بنصّ المالك: «**يُغيَّر الآن، بشرط أن تقيس أوّلاً ألّا مفتاحَ لنظامٍ خارجيٍّ صدر.**» — وقِيس: لا مفتاحَ صدر (التطوير `0`،
 * والمنشورُ بلا جدول المفاتيح أصلاً). فرمزُ الإيصال على السلك **اسمٌ محايد** (`receiptQr` · `stamped`) لا اسمُ الجهة.
 * ② «**المناوبةُ الحالية» بلا مناوبة تُعاد مغلَّفةً صراحةً `{ shift: null }`** — لا جسماً فارغاً يُقرأ `null` أو `""` بحسب القارئ.
 */
describe('سلكُ الكاشير: اسمٌ محايدٌ لرمز الإيصال، والمناوبةُ الحالية مغلَّفة (ق-١٤٤٨ · ق-١٤٤٩)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'pos-wire');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 27.1] ② المناوبةُ الحالية بلا مناوبة `{ shift: null }` — وبها `{ shift: { … } }`', async () => {
    const before = await asOwner(http().get('/pos/shifts/current')).expect(200);
    expect(before.body).toEqual({ shift: null });

    const opened = (await asOwner(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body as { id: string };
    const after = await asOwner(http().get('/pos/shifts/current')).expect(200);
    expect(Object.keys(after.body)).toEqual(['shift']);
    expect(after.body.shift.id).toBe(opened.id);
    await asOwner(http().post(`/pos/shifts/${opened.id}/close`)).send({ declaredClosing: 0 }).expect(201);
  });

  it('[SPEC 27.1] ① إيصالُ البيع يحمل رمزَه باسمٍ محايد — `receiptQr` و`stamped`، ولا اسمَ للجهة على السلك', async () => {
    const productId = (await asOwner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف السلك ${suffix}`, price: 10 }).expect(201)).body.id;
    const shift = (await asOwner(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body as { id: string };
    const sale = (await asOwner(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' }).expect(201)).body as Record<string, unknown>;

    expect({
      receiptQr: 'receiptQr' in sale,
      stamped: typeof sale.stamped,
      zatcaQr: 'zatcaQr' in sale,
      zatcaStamped: 'zatcaStamped' in sale,
    }).toEqual({ receiptQr: true, stamped: 'boolean', zatcaQr: false, zatcaStamped: false });
    await asOwner(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 10 }).expect(201);
  });
});
