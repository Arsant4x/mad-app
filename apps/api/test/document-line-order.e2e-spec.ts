import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (11.7 ث دافئاً على قاعدة الفحص) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(40000);

/**
 * ⚖️ **رقمُ السطر من ترتيب الإدخال في كلِّ مسار كتابة** (`ق-١٤١٢` · مكسورُ اليوم ب في التوجيه ٢٦٣).
 *
 * كلُّ مستندٍ هنا بثلاثة سطورٍ **أسماؤها بغير ترتيب الأبجدية** (ج · أ · ب) — فترتيبٌ مصادَفٌ بالاسم أو بالمعرّف
 * لا يطابقها صدفةً. والمساراتُ التي تكتب سطوراً: **إنشاءُ الفاتورة** · **الإشعارُ الدائن الكامل** (يقرأ سطورَ أصله) ·
 * **إنشاءُ العرض وتعديلُه** (إعادةُ كتابة السطور بترتيبٍ جديد) · **تحويلُ العرض** (يقرأ سطورَه). **والإشعارُ والتحويلُ
 * هما الموضعان اللذان تذبذب فيهما `line-discount ③`.** (تعديلُ سطور الفاتورة الصادرة مرفوضٌ أصلاً — `ق-٩٤٣`.)
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

  it('إنشاءُ الفاتورة يرقّم بترتيب الإدخال — والقائمةُ تعيده كما أُدخل', async () => {
    const created = await auth(http().post('/invoices')).send({ customerId, issueDate: day(0), dueDate: day(0), lines: three() }).expect(201);
    expect(shape(created.body.lines)).toEqual(entered);
    const list = (await auth(http().get('/invoices')).expect(200)).body as { id: string; lines: Line[] }[];
    const read = list.find((i) => i.id === created.body.id);
    expect(read).toBeDefined();
    expect(shape(read!.lines)).toEqual(entered);
  });

  it('الإشعارُ الدائن الكامل يرث ترتيبَ أصله — لا ترتيبَ القرص', async () => {
    const invoice = await auth(http().post('/invoices')).send({ customerId, issueDate: day(0), dueDate: day(0), lines: three() }).expect(201);
    const note = await auth(http().post(`/invoices/${invoice.body.id}/credit-note`)).send({ reason: 'ترتيب' }).expect(201);
    expect(shape(note.body.lines)).toEqual(entered);
  });

  it('العرضُ يرقّم بترتيبه، وتعديلُه يعيد الترقيم بالترتيب الجديد، وتحويلُه يكتب الفاتورةَ بالترتيب نفسِه', async () => {
    const quote = await auth(http().post('/quotes')).send({ customerId, issueDate: day(0), validUntil: day(14), lines: three() }).expect(201);
    expect(shape(quote.body.lines)).toEqual(entered);

    const [c, a, b] = three();
    const reordered = ['1:ب — الثالث', '2:ج — الأول', '3:أ — الثاني'];
    const edited = await auth(http().patch(`/quotes/${quote.body.id}`)).send({ lines: [b, c, a] }).expect(200);
    expect(shape(edited.body.lines)).toEqual(reordered);
    const read = await auth(http().get(`/quotes/${quote.body.id}`)).expect(200);
    expect(shape(read.body.lines)).toEqual(reordered);

    const converted = await auth(http().post(`/quotes/${quote.body.id}/convert`)).expect(201);
    expect(shape(converted.body.invoice.lines)).toEqual(reordered);
  });
});
