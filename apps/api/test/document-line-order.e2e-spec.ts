import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(90000);

/**
 * ⚖️ **رقمُ السطر من ترتيب الإدخال في كلِّ مسار كتابة** (`ق-١٤١٢` · مكسورُ اليوم ب في التوجيه ٢٦٣).
 *
 * كلُّ مستندٍ هنا بثلاثة سطورٍ **أسماؤها بغير ترتيب الأبجدية** (ج · أ · ب) — فترتيبٌ مصادَفٌ بالاسم أو بالمعرّف
 * لا يطابقها صدفةً. والمساراتُ الأربعة التي تكتب سطوراً من سطور: **الإنشاء** · **التعديل** (إعادةُ كتابة السطور
 * بترتيبٍ جديد) · **الإشعارُ الدائن الكامل** (يقرأ سطورَ أصله) · **تحويلُ العرض** (يقرأ سطورَ العرض). **وهما الموضعان
 * اللذان تذبذب فيهما `line-discount ③`**: التحويلُ والإشعار.
 */
describe('رقمُ السطر من ترتيب الإدخال — الفاتورةُ والعرضُ والإشعار (ق-١٤١٢)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let customerId: string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const three = () => [
    { description: 'ج — الأول', quantity: 1, unitPrice: 30, taxRate: 15 },
    { description: 'أ — الثاني', quantity: 1, unitPrice: 10, taxRate: 15 },
    { description: 'ب — الثالث', quantity: 1, unitPrice: 20, taxRate: 15 },
  ];
  type Line = { description: string; lineNo: number };
  const shape = (lines: Line[]) => lines.map((l) => `${l.lineNo}:${l.description}`);
  const entered = ['1:ج — الأول', '2:أ — الثاني', '3:ب — الثالث'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'lineorder');
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل الترتيب' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('الإنشاءُ يرقّم بترتيب الإدخال — والقراءةُ تعيده كما أُدخل، والتعديلُ يعيد الترقيم بالترتيب الجديد', async () => {
    const created = await auth(http().post('/invoices')).send({ customerId, issueDate: day(0), dueDate: day(0), lines: three() }).expect(201);
    expect(shape(created.body.lines)).toEqual(entered);
    const read = await auth(http().get(`/invoices/${created.body.id}`)).expect(200);
    expect(shape(read.body.lines)).toEqual(entered);

    const [c, a, b] = three();
    const edited = await auth(http().patch(`/invoices/${created.body.id}`)).send({ lines: [b, c, a] }).expect(200);
    expect(shape(edited.body.lines)).toEqual(['1:ب — الثالث', '2:ج — الأول', '3:أ — الثاني']);
  });

  it('الإشعارُ الدائن الكامل يرث ترتيبَ أصله — لا ترتيبَ القرص', async () => {
    const invoice = await auth(http().post('/invoices')).send({ customerId, issueDate: day(0), dueDate: day(0), lines: three() }).expect(201);
    const note = await auth(http().post(`/invoices/${invoice.body.id}/credit-note`)).send({ reason: 'ترتيب' }).expect(201);
    expect(shape(note.body.lines)).toEqual(entered);
  });

  it('العرضُ يرقّم بترتيبه، وتحويلُه يكتب الفاتورةَ بالترتيب نفسِه', async () => {
    const quote = await auth(http().post('/quotes')).send({ customerId, issueDate: day(0), validUntil: day(14), lines: three() }).expect(201);
    expect(shape(quote.body.lines)).toEqual(entered);
    const converted = await auth(http().post(`/quotes/${quote.body.id}/convert`)).expect(201);
    expect(shape(converted.body.invoice.lines)).toEqual(entered);
  });
});
