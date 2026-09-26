import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication, PipeTransform } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { ResponseSchema } from '../src/common/response-schema.util';
import { hardDeleteCompanyForTest } from '../test/hard-delete-company';

/**
 * ⚖️ **حارسُ صدق الردود — على التطبيق المبنيّ وبقاعدةٍ حيّة** (`ق-١٤٣٨` · خطّةُ الأنواع ④ البند ٣ · الخيار «أ»).
 *
 * بنصّ المالك: «**يمسك ما يُرسل فعلاً، و(ب) يشهد لما كُتب، وقد نقدنا الحارسَ الذي يشهد لما كُتب.**»
 *
 * ## لماذا من `dist` وبقاعدة
 *
 * مخطّطاتُ الردّ يصفها مُلحَقُ `@nestjs/swagger` **تحت `nest build` وحدَه** — فتحت `ts-jest` لا مخطّطَ يُطابَق به (`ق-١٢٩٩`).
 * فالسكربتُ يُركّب **الوحدةَ المبنيّة** كما يفعل عقدُ الواجهة (`openapi-snapshot.ts`)، **ثم يقلعها بقاعدةٍ حقيقية** ويطلب مساراتِ
 * الوحدة بطلباتٍ حقيقية، ويطابق كلَّ ردٍّ بمخطّطه في الوثيقة نفسِها. **والطلبُ على `/v1/…`** — المسارُ الموثَّق حرفاً.
 *
 * ## ما يُسقطه
 *
 * - **مخالفةُ ردٍّ لمخطّطه** (`schemaViolations`): حقلٌ إلزاميٌّ معلَنٌ لم يُرسَل · نوعٌ مخالف · `null` بلا `nullable` · تعداد.
 * - **رمزُ ردٍّ غيرُ المعلَن** لنجاح العملية.
 * - **عمليةٌ في الوحدة بلا مخطَّطٍ يعلن شكلاً** — فلا يمرّ صامتاً ما لم يُعلَن.
 * - **عمليةٌ في الوحدة لم تُطابَق مرّةً على الأقل** — فالتغطيةُ تُقاس من الوثيقة لا من قائمةٍ مكتوبة (`§8.7`).
 * - **مسبارٌ أعمى**: ردٌّ حقيقيٌّ يُنزع منه حقلٌ إلزاميّ فيجب أن يُسقط — وإلا فصفرُ المخالفات عمى لا صدق (`§8.7` الحادي عشر).
 *   **ومسبارٌ لكلِّ وحدة** على ردٍّ من ردودها — فوحدةٌ بلا مخطَّطٍ يُعمى مسبارُها ولا يشهد لها مسبارُ غيرها.
 *
 * ⚠️ **وحدودُه معلَنة**: الحقلُ الزائد غيرُ المعلَن لا يُعدّ (`response-schema.util.ts`) · **والجسمُ الفارغ يُقرأ `null`** حيث يعلن
 * المخطَّطُ `nullable` — لأن `Nest` لا يرسل `null` بل جسماً فارغاً (`ExpressAdapter.reply`: `isNil(body) ⟸ response.send()`)،
 * **ويُطبع حيث وقع** فلا يخفى. **وردُّ `204` لا شكلَ له** (كالمِسنَن — `untypedResponseOperations`): يُطابَق رمزُه وأنّ جسمَه فارغٌ
 * حقّاً، لا مخطَّط. **ومحوّلُ الدفع التجريبيّ** (`MOCK`) يُستعمل لبلوغ مسارات المحاولة، **وشحنُه يُرمى مرّةً عمداً**
 * ليبلغ «معلّقٌ» مسارَي الحسم — ويُعاد كما كان.
 *
 * **والوحداتُ اثنتان** (`ق-١٤٥٠`: «الوحدةُ التالية البنوكُ ثم الموافقات»): الكاشير ثم البنوك — وبياناتُ البنوك تُصنع **بالواجهة نفسِها**
 * (درجٌ ممَوَّلٌ بقيدٍ يدويّ · سنداتُ قبضٍ بالشبكة · سطورُ كشفٍ بـ`/v1/transactions`) لا ببذرة.
 *
 * **ولقياس ما يُرسَل قبل إعلانه** (`RESPONSE_TRUTH_DUMP=<مسار>`): تُكتب الردودُ الحيّة كما وصلت (العمليةُ والوصفُ والرمزُ والجسم)
 * إلى الملفّ — فيُقاس بها نوعُ الواجهة المكتوبُ بيدٍ قبل أن يُستبدل بالمولَّد (قاعدةُ المالك: «قِس، ثم أصلح»).
 *
 * الاستعمال (من `apps/api`، بقاعدةٍ حيّة في `DATABASE_URL`):
 *   npm run response:truth        ⟵ يبني ويقلع ويطابق — والخروجُ غيرُ الصفريّ يُسقط الخطوة
 */

const DIST = join(__dirname, '..', 'dist', 'src');

/**
 * الوحداتُ المطابَقة — كلُّ عمليةٍ تحت أحد هذه الأبواب في الوثيقة تُطابَق. الأولى الكاشير (`ق-١٤٣٨`)، والثانيةُ البنوك (`ق-١٤٥٠`).
 * **والبابُ يشمل جذرَه بلا شرطةٍ أخيرة** (`GET /v1/banks` · `POST /v1/banks`) — وإلا سقطت القائمةُ والإنشاءُ من الوحدة صامتَين.
 * ⚠️ لا بابَ يبدأ ببابٍ آخر، فالعمليةُ في وحدةٍ واحدة.
 */
const UNIT_PREFIXES = ['/v1/pos/', '/v1/banks/'] as const;
const inUnit = (prefix: string, path: string) => path.startsWith(prefix) || path === prefix.slice(0, -1);

interface Dist {
  AppModule: unknown;
  applyApiVersioning: (app: INestApplication) => void;
  buildOpenApiDocument: (app: INestApplication) => OpenAPIObject;
  schemaViolations: (value: unknown, schema: ResponseSchema | undefined, schemas: Record<string, ResponseSchema>, path?: string) => string[];
  successResponseOf: (op: object) => { status: string; schema: ResponseSchema | null } | null;
  declaresShape: (schema: ResponseSchema | null | undefined, schemas: Record<string, ResponseSchema>) => boolean;
  HttpExceptionFilter: new () => unknown;
  validationPipe: () => PipeTransform;
  PrismaService: new (...args: never[]) => unknown;
  mockAdapter: { charge: (...args: unknown[]) => Promise<unknown> };
}

function loadDist(): Dist {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const req = (p: string) => require(join(DIST, p));
  const { ValidationPipe } = require('@nestjs/common') as typeof import('@nestjs/common');
  const { validationExceptionFactory } = req('common/i18n/validation.util.js');
  const adapters = req('integrations/payment-terminal.adapter.js');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return {
    AppModule: req('app.module.js').AppModule,
    applyApiVersioning: req('common/versioning.js').applyApiVersioning,
    buildOpenApiDocument: req('common/openapi-document.js').buildOpenApiDocument,
    ...req('common/response-schema.util.js'),
    HttpExceptionFilter: req('common/i18n/http-exception.filter.js').HttpExceptionFilter,
    // الأنبوبُ كما في `main.ts` حرفاً — فالردودُ ردودُ الإنتاج لا ردودُ إعدادٍ أرخى.
    validationPipe: () => new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory }),
    PrismaService: req('prisma/prisma.service.js').PrismaService,
    mockAdapter: adapters.TERMINAL_ADAPTERS.MOCK,
  };
}

interface Verdict {
  op: string;
  label: string;
  status: number;
  violations: string[];
  emptyAsNull: boolean;
  /** الجسمُ كما وصل — يُكتب إلى ملفّ القياس وحدَه (`RESPONSE_TRUTH_DUMP`). */
  body: unknown;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error('✖ لا DATABASE_URL — حارسُ الصدق يعمل على قاعدةٍ حيّة (خطوةُ db-integration)');
    process.exit(2);
  }
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error('✖ لا يعمل في الإنتاج — ينشئ منشأةً ويستعمل محوّلَ الدفع التجريبيّ');
    process.exit(2);
  }
  const dist = loadDist();
  const { Test } = await import('@nestjs/testing');
  const moduleRef = await Test.createTestingModule({ imports: [dist.AppModule as never] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(dist.validationPipe());
  app.useGlobalFilters(new dist.HttpExceptionFilter() as never);
  dist.applyApiVersioning(app);
  await app.init();

  const doc = dist.buildOpenApiDocument(app);
  const schemas = (doc.components?.schemas ?? {}) as Record<string, ResponseSchema>;
  const http = () => request(app.getHttpServer());
  const verdicts: Verdict[] = [];

  /** يطابق ردّاً بعمليته في الوثيقة — والمفتاحُ `METHOD /v1/…/{param}` كما تكتبه الوثيقة. */
  const check = (label: string, method: string, template: string, res: request.Response): Record<string, unknown> => {
    const op = (doc.paths?.[template] as Record<string, object> | undefined)?.[method.toLowerCase()];
    const key = `${method} ${template}`;
    const violations: string[] = [];
    // `204` لا جسمَ له أصلاً — فلا يُقرأ فراغُه `null` ولا يُطبع كذلك.
    const noContent = res.status === 204;
    const emptyAsNull = res.text === '' && res.status < 300 && !noContent;
    const body: unknown = emptyAsNull || noContent ? null : res.body;
    if (!op) violations.push('عمليةٌ لا توجد في الوثيقة');
    else {
      const success = dist.successResponseOf(op);
      if (!success) violations.push('لا ردَّ نجاحٍ معلَناً');
      else {
        if (String(res.status) !== success.status) violations.push(`رمزُ الردّ ${res.status} والمعلَنُ ${success.status} — ${String(res.text).slice(0, 160)}`);
        // ردُّ «بلا محتوى» المعلَن: شكلُه أنه فارغ — فجسمٌ فيه مخالفة، ولا مخطَّطَ يُطلب له (كالمِسنَن).
        else if (success.status === '204') {
          if (res.text !== '') violations.push(`ردُّ 204 المعلَن حمل جسماً — ${String(res.text).slice(0, 160)}`);
        } else if (!dist.declaresShape(success.schema, schemas)) violations.push('ردُّ النجاح بلا مخطَّطٍ يعلن شكلاً');
        else violations.push(...dist.schemaViolations(body, success.schema ?? undefined, schemas));
      }
    }
    verdicts.push({ op: key, label, status: res.status, violations, emptyAsNull, body });
    return (body ?? {}) as Record<string, unknown>;
  };

  /**
   * طلبُ إعدادٍ خارج الوحدات (درجٌ · قيدٌ · سطرُ كشف · سند) — لا يُطابَق، **ويُسقط السكربتَ برمزه** إن لم يكن المتوقَّع:
   * فبياناتٌ لم تُصنع تجعل عملياتِ الوحدة تُطابَق على ردودٍ غيرِ التي قُصدت.
   */
  const setup = async (label: string, expected: number, r: request.Test): Promise<Record<string, unknown>> => {
    const res = await r;
    if (res.status !== expected) throw new Error(`${label} ردّ ${res.status}: ${res.text.slice(0, 200)}`);
    return res.body as Record<string, unknown>;
  };

  /** المسبارُ يُصادَق على ردٍّ حقيقيّ (`§8.7` الحادي عشر): نزعُ أوّلِ حقلٍ إلزاميّ من مخطّط العملية يجب أن يُسقط. */
  const probe = (what: string, method: string, template: string, body: Record<string, unknown>): boolean => {
    const op = (doc.paths?.[template] as Record<string, object> | undefined)?.[method.toLowerCase()];
    const schema = op ? dist.successResponseOf(op)?.schema ?? undefined : undefined;
    const resolved = schema?.$ref ? schemas[schema.$ref.split('/').pop() as string] : schema;
    const firstRequired = resolved?.required?.[0];
    const caught = !!firstRequired && dist.schemaViolations(Object.fromEntries(Object.entries(body).filter(([k]) => k !== firstRequired)), schema, schemas).length > 0;
    // eslint-disable-next-line no-console
    console.log(`المسبار: نزعُ «${firstRequired ?? '—'}» من ${what} ⟸ ${caught ? 'أُمسك ✔' : 'لم يُمسك ✖'}`);
    return caught;
  };

  // ── المنشأةُ بالمسار الحقيقيّ (كـ`registerIsolatedCompany`) — لا منشأة العرض. ──
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const prisma = app.get(dist.PrismaService as never) as { $queryRaw: (s: TemplateStringsArray) => Promise<unknown>; company: { count: (a: object) => Promise<number> } };
  await prisma.$queryRaw`SELECT 1`;
  const reg = await http().post('/v1/auth/register').send({ orgName: `حارس الصدق ${stamp}`, username: `truth-${stamp}`, password: 'TruthPass123!' });
  if (reg.status !== 201) throw new Error(`التسجيلُ ردّ ${reg.status}: ${reg.text.slice(0, 200)}`);
  const companyId = reg.body.user?.companyId as string;
  const token = reg.body.accessToken as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const originalCharge = dist.mockAdapter.charge;
  try {
    // ── الكاشير (`/v1/pos/…`) ──
    check('قبل المناوبة — لا مناوبة', 'GET', '/v1/pos/shifts/current', await as(http().get('/v1/pos/shifts/current')));
    check('وضعُ الدفع بلا ربط', 'GET', '/v1/pos/payment-mode', await as(http().get('/v1/pos/payment-mode')));
    const product = await as(http().post('/v1/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف الصدق ${stamp}`, price: 100 });
    if (product.status !== 201) throw new Error(`الصنفُ ردّ ${product.status}: ${product.text.slice(0, 200)}`);
    const lines = [{ productId: product.body.id as string, quantity: 1 }];

    const shift = check('فتحُ المناوبة', 'POST', '/v1/pos/shifts', await as(http().post('/v1/pos/shifts')).send({ openingFloat: 50 }));
    check('المناوبةُ الحالية', 'GET', '/v1/pos/shifts/current', await as(http().get('/v1/pos/shifts/current')));
    check('قائمةُ المناوبات', 'GET', '/v1/pos/shifts', await as(http().get('/v1/pos/shifts')));
    check('قائمةُ المناوبات مرقَّمة', 'GET', '/v1/pos/shifts', await as(http().get('/v1/pos/shifts?page=1')));

    const sale = await as(http().post('/v1/pos/sales')).send({ lines, paymentMethod: 'CASH' });
    const saleBody = check('بيعٌ نقديّ', 'POST', '/v1/pos/sales', sale);
    // جزءُ البطاقة بلا ربطٍ يحمل رقمَ مرجع الجهاز من إيصاله إلزاماً (`directCardProof` · `ق-١٣٩٧`) — وإلا `400` لا بيع.
    check(
      'بيعٌ مقسَّم',
      'POST',
      '/v1/pos/sales',
      await as(http().post('/v1/pos/sales')).send({ lines, paymentMethod: 'SPLIT', payments: [{ method: 'CASH', amount: 50 }, { method: 'CARD', amount: 65 }], cardDeviceReference: `D-${stamp}` }),
    );

    const clientSaleId = `truth-${stamp}`;
    const ringAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    check('مزامنةٌ أولى', 'POST', '/v1/pos/sales/sync', await as(http().post('/v1/pos/sales/sync')).send({ clientSaleId, ringAt, lines, paymentMethod: 'CASH' }));
    check('مزامنةٌ مكرَّرة (إعادة)', 'POST', '/v1/pos/sales/sync', await as(http().post('/v1/pos/sales/sync')).send({ clientSaleId, ringAt, lines, paymentMethod: 'CASH' }));
    check('وقائعُ الانقطاع', 'GET', '/v1/pos/incidents', await as(http().get('/v1/pos/incidents')));

    const gateway = await as(http().post('/v1/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: `truth-${stamp}` } });
    if (gateway.status !== 201) throw new Error(`ربطُ البوابة ردّ ${gateway.status}: ${gateway.text.slice(0, 200)}`);
    check('وضعُ الدفع بربط', 'GET', '/v1/pos/payment-mode', await as(http().get('/v1/pos/payment-mode')));

    const attempt = (n: number) => as(http().post('/v1/pos/payment-attempts')).send({ clientSaleId: `truth-${stamp}-a${n}`, lines, paymentMethod: 'CARD' });
    const a1 = check('محاولةٌ تُنشأ', 'POST', '/v1/pos/payment-attempts', await attempt(1));
    check('محاولةٌ تُقرأ', 'GET', '/v1/pos/payment-attempts/{id}', await as(http().get(`/v1/pos/payment-attempts/${String(a1.id)}`)));
    check('محاولةٌ تُشحن فتكتمل ببيعها', 'POST', '/v1/pos/payment-attempts/{id}/charge', await as(http().post(`/v1/pos/payment-attempts/${String(a1.id)}/charge`)));

    const a2 = check('محاولةٌ ثانية', 'POST', '/v1/pos/payment-attempts', await attempt(2));
    check('محاولةٌ تُلغى قبل الإرسال', 'POST', '/v1/pos/payment-attempts/{id}/cancel', await as(http().post(`/v1/pos/payment-attempts/${String(a2.id)}/cancel`)));

    // «معلّقٌ»: الجهازُ لا يُجيب بعد الإرسال ⟸ `UNKNOWN` — والشحنُ يُعاد كما كان فوراً.
    const a3 = check('محاولةٌ ثالثة', 'POST', '/v1/pos/payment-attempts', await attempt(3));
    dist.mockAdapter.charge = async () => {
      throw new Error('انقطاعٌ مقصود في حارس الصدق');
    };
    check('محاولةٌ تُشحن فتعلق', 'POST', '/v1/pos/payment-attempts/{id}/charge', await as(http().post(`/v1/pos/payment-attempts/${String(a3.id)}/charge`)));
    dist.mockAdapter.charge = originalCharge;
    check('المحاولاتُ المفتوحة', 'GET', '/v1/pos/payment-attempts', await as(http().get('/v1/pos/payment-attempts')));
    check('حسمٌ بجواب المزوّد (لا أثرَ بعد)', 'POST', '/v1/pos/payment-attempts/{id}/resolve', await as(http().post(`/v1/pos/payment-attempts/${String(a3.id)}/resolve`)));
    check(
      'حسمٌ يدويٌّ بدليل',
      'POST',
      '/v1/pos/payment-attempts/{id}/resolve-with-evidence',
      await as(http().post(`/v1/pos/payment-attempts/${String(a3.id)}/resolve-with-evidence`)).send({ deviceReference: `R-${stamp}`, approvalCode: 'T12345' }),
    );
    check('دفعاتُ البطاقة للمطابقة', 'GET', '/v1/pos/card-verifications', await as(http().get('/v1/pos/card-verifications')));
    check('دفعاتُ البطاقة كلُّها', 'GET', '/v1/pos/card-verifications', await as(http().get('/v1/pos/card-verifications?state=all')));

    check('إقفالُ المناوبة', 'POST', '/v1/pos/shifts/{id}/close', await as(http().post(`/v1/pos/shifts/${String(shift.id)}/close`)).send({ declaredClosing: 100, closedOffsetMin: 180 }));

    const probes: boolean[] = [probe('ردّ البيع', 'POST', '/v1/pos/sales', saleBody)];

    // ── البنوك (`/v1/banks/…` — `ق-١٤٥٠`) ──
    // التواريخُ في يونيو كحزم التكامل (`cash-deposits` · `network-settlements`): بعد افتتاح السنة وقبل أيِّ إقفال.
    check('نطاقُ رموز البنوك', 'GET', '/v1/banks/code-band', await as(http().get('/v1/banks/code-band')));
    const bank = check(
      'إنشاءُ حسابٍ بنكيّ بآيبان',
      'POST',
      '/v1/banks',
      await as(http().post('/v1/banks')).send({ name: `بنك الصدق ${stamp}`, kind: 'BANK_ACCOUNT', iban: `IBAN-${stamp}`, openingBalance: 0, openingDate: '2026-01-01' }),
    );
    const bankId = String(bank.id);
    const box = check(
      'إنشاءُ صندوقٍ نقديّ برصيدٍ افتتاحيّ',
      'POST',
      '/v1/banks',
      await as(http().post('/v1/banks')).send({ name: `صندوق الصدق ${stamp}`, kind: 'CASH_BOX', openingBalance: 100, openingDate: '2026-01-01' }),
    );
    const moving = check('إنشاءُ حسابٍ بنكيّ للنقل', 'POST', '/v1/banks', await as(http().post('/v1/banks')).send({ name: `بنك النقل ${stamp}`, kind: 'BANK_ACCOUNT', openingDate: '2026-01-01' }));
    const spare = check('إنشاءُ حسابٍ للأرشفة والحذف', 'POST', '/v1/banks', await as(http().post('/v1/banks')).send({ name: `بنك الحذف ${stamp}`, kind: 'BANK_ACCOUNT', openingDate: '2026-01-01' }));
    check('قائمةُ البنوك', 'GET', '/v1/banks', await as(http().get('/v1/banks')));
    check('قائمةُ البنوك مرقَّمة', 'GET', '/v1/banks', await as(http().get('/v1/banks?page=1')));
    check('تعديلُ الاسم', 'PATCH', '/v1/banks/{id}', await as(http().patch(`/v1/banks/${bankId}`)).send({ name: `بنك الصدق المعدَّل ${stamp}` }));
    check('أرشفة', 'PATCH', '/v1/banks/{id}/archive', await as(http().patch(`/v1/banks/${String(spare.id)}/archive`)).send({ archived: true }));
    check('القائمةُ بالمؤرشف', 'GET', '/v1/banks', await as(http().get('/v1/banks?includeArchived=true')));
    check('إلغاءُ الأرشفة', 'PATCH', '/v1/banks/{id}/archive', await as(http().patch(`/v1/banks/${String(spare.id)}/archive`)).send({ archived: false }));
    check('حذفٌ إلى السلّة', 'DELETE', '/v1/banks/{id}', await as(http().delete(`/v1/banks/${String(spare.id)}`)));

    // النقلُ بين الفروع بنوعَيه (`ق-١٤٣١`): الحسابُ البنكيّ للقادم، والصندوقُ إغلاقٌ وفتحٌ بعدّ نقده.
    const branch = await setup('الفرعُ الهدف', 201, as(http().post('/v1/branches')).send({ name: `فرع الصدق ${stamp}`, type: 'فرع' }));
    check('نقلُ حسابٍ بنكيّ', 'POST', '/v1/banks/{id}/transfer', await as(http().post(`/v1/banks/${String(moving.id)}/transfer`)).send({ toBranchId: branch.id }));
    check(
      'نقلُ صندوقٍ نقديّ بعدّه',
      'POST',
      '/v1/banks/{id}/transfer',
      await as(http().post(`/v1/banks/${String(box.id)}/transfer`)).send({ toBranchId: branch.id, countedAmount: 100, date: '2026-06-15' }),
    );

    // إيداعُ الدرج (⑦A3): درجٌ ممَوَّلٌ بقيدٍ يدويّ ثم إيداعان — يُؤكَّد الأوّلُ من الكشف ويُلغى الثاني.
    const accounts = (await setup('الدليل', 200, as(http().get('/v1/accounts')))) as unknown as { id: string; code: string }[];
    const revenueId = accounts.find((a) => a.code === '4100')?.id;
    if (!revenueId) throw new Error('الدليلُ بلا 4100 — لا طرفَ لتمويل الدرج');
    const drawer = await setup('الدرج', 201, as(http().post('/v1/cash-drawers')).send({ name: `درج الصدق ${stamp}` }));
    const drawerAccountId = String((drawer.account as { id?: string } | undefined)?.id ?? drawer.accountId);
    await setup(
      'تمويلُ الدرج',
      201,
      as(http().post('/v1/journal')).send({ date: '2026-06-01', memo: 'تمويل درج الصدق', lines: [{ accountId: drawerAccountId, debit: 500, credit: 0 }, { accountId: revenueId, debit: 0, credit: 500 }] }),
    );
    check('الإيداعاتُ قبل أيِّ إيداع', 'GET', '/v1/banks/cash-deposits', await as(http().get('/v1/banks/cash-deposits')));
    const deposit = check('إيداعُ درجٍ في البنك', 'POST', '/v1/banks/cash-deposits', await as(http().post('/v1/banks/cash-deposits')).send({ drawerId: drawer.id, bankId, amount: 300, date: '2026-06-05' }));
    const second = check('إيداعٌ ثانٍ', 'POST', '/v1/banks/cash-deposits', await as(http().post('/v1/banks/cash-deposits')).send({ drawerId: drawer.id, bankId, amount: 150, date: '2026-06-08' }));
    check('إلغاءُ الإيداع الثاني', 'POST', '/v1/banks/cash-deposits/{depositId}/void', await as(http().post(`/v1/banks/cash-deposits/${String(second.id)}/void`)).send({ reason: 'لم يُودَع' }));
    const depositRow = await setup('سطرُ كشف الإيداع', 201, as(http().post('/v1/transactions')).send({ bankId, date: '2026-06-07', description: 'إيداع نقدي', amount: 300 }));
    check(
      'تأكيدُ الإيداع من الكشف',
      'POST',
      '/v1/banks/{id}/reconciliation/post',
      await as(http().post(`/v1/banks/${bankId}/reconciliation/post`)).send({ transactionId: depositRow.id, depositId: deposit.id }),
    );
    check('الإيداعاتُ بعد التأكيد والإلغاء', 'GET', '/v1/banks/cash-deposits', await as(http().get(`/v1/banks/cash-deposits?bankId=${bankId}`)));

    // تسويةُ الشبكة (⑦A2): سندا قبضٍ بالشبكة في يونيو — ثم تسويةٌ تُطابَق من الكشف وتُفكّ وتُلغى.
    check('تسوياتُ الشبكة قبل أيِّ سند', 'GET', '/v1/banks/network-settlements', await as(http().get('/v1/banks/network-settlements')));
    const customer = await setup('عميلُ الشبكة', 201, as(http().post('/v1/customers')).send({ kind: 'NATURAL', name: `عميل الصدق ${stamp}` }));
    const cardReceipt = (amount: number, date: string) =>
      setup('سندُ قبضٍ بالشبكة', 201, as(http().post('/v1/payments')).send({ customerId: customer.id, date, amount, method: 'CARD', unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } }));
    await cardReceipt(1000, '2026-06-03');
    await cardReceipt(500, '2026-06-10');
    check('المفتوحُ على الشبكة لمدًى', 'GET', '/v1/banks/network-settlements/open', await as(http().get('/v1/banks/network-settlements/open?from=2026-06-01&to=2026-06-30')));
    check('المفتوحُ على الشبكة كلُّه', 'GET', '/v1/banks/network-settlements/open', await as(http().get('/v1/banks/network-settlements/open')));
    const settlement = check(
      'تسويةُ شبكة',
      'POST',
      '/v1/banks/network-settlements',
      await as(http().post('/v1/banks/network-settlements')).send({ bankId, date: '2026-07-02', periodFrom: '2026-06-01', periodTo: '2026-06-30', feeAmount: 30, feeVatAmount: 4.5 }),
    );
    check('تسوياتُ الشبكة', 'GET', '/v1/banks/network-settlements', await as(http().get(`/v1/banks/network-settlements?bankId=${bankId}`)));

    // التسويةُ البنكية (ق-١٢٦١ ج): سطرُ كشفٍ بصافي التسوية يُطابَق بسطر دفترها ثم يُفكّ؛ وسطرٌ بلا دفترٍ يُرحَّل بطرف.
    const settlementRow = await setup('سطرُ كشف التسوية', 201, as(http().post('/v1/transactions')).send({ bankId, date: '2026-07-02', description: 'تحويل المستحوذ', amount: 1465.5 }));
    const overview = check('التسويةُ البنكية', 'GET', '/v1/banks/{id}/reconciliation', await as(http().get(`/v1/banks/${bankId}/reconciliation`)));
    const ledgerRows = ((overview.ledger as { rows?: { lineId: string; entryNo: string }[] } | undefined)?.rows ?? []) as { lineId: string; entryNo: string }[];
    const settlementLine = ledgerRows.find((r) => r.entryNo === settlement.entryNo);
    if (!settlementLine) throw new Error(`لا سطرَ دفترٍ لقيد التسوية ${String(settlement.entryNo)} — المطابقةُ لا تُبلَغ`);
    check(
      'مطابقةُ سطر كشف',
      'POST',
      '/v1/banks/{id}/reconciliation/match',
      await as(http().post(`/v1/banks/${bankId}/reconciliation/match`)).send({ transactionId: settlementRow.id, lineId: settlementLine.lineId }),
    );
    check('فكُّ المطابقة', 'POST', '/v1/banks/{id}/reconciliation/unmatch', await as(http().post(`/v1/banks/${bankId}/reconciliation/unmatch`)).send({ transactionId: settlementRow.id }));
    check('إلغاءُ تسوية الشبكة', 'POST', '/v1/banks/network-settlements/{settlementId}/void', await as(http().post(`/v1/banks/network-settlements/${String(settlement.id)}/void`)).send({ reason: 'إشعار خاطئ' }));
    const interestRow = await setup('سطرُ كشفٍ بلا دفتر', 201, as(http().post('/v1/transactions')).send({ bankId, date: '2026-07-03', description: 'فائدة', amount: 25 }));
    check(
      'ترحيلُ سطر كشفٍ بطرف',
      'POST',
      '/v1/banks/{id}/reconciliation/post',
      await as(http().post(`/v1/banks/${bankId}/reconciliation/post`)).send({ transactionId: interestRow.id, counterpartyAccountId: revenueId }),
    );
    check('التسويةُ البنكية لمدًى', 'GET', '/v1/banks/{id}/reconciliation', await as(http().get(`/v1/banks/${bankId}/reconciliation?from=2026-06-01&to=2026-07-31`)));
    // الإقفالُ قبل كلِّ سطرٍ معلَّق — فيُقبل؛ ثم يُعاد فتحُه فلا يبقى قيدٌ محجوباً.
    check('إقفالُ التسوية', 'POST', '/v1/banks/{id}/reconciliation/close', await as(http().post(`/v1/banks/${bankId}/reconciliation/close`)).send({ until: '2026-05-31' }));
    check('إعادةُ فتح التسوية', 'POST', '/v1/banks/{id}/reconciliation/reopen', await as(http().post(`/v1/banks/${bankId}/reconciliation/reopen`)));

    probes.push(probe('ردّ إيداع الدرج', 'POST', '/v1/banks/cash-deposits', deposit));

    for (const v of verdicts) {
      // eslint-disable-next-line no-console
      console.log(`${v.violations.length ? '✖' : '✔'} ${v.op} (${v.status}) — ${v.label}${v.emptyAsNull ? ' · جسمٌ فارغٌ قُرئ null' : ''}${v.violations.length ? `\n   ${v.violations.slice(0, 12).join('\n   ')}` : ''}`);
    }
    if (process.env.RESPONSE_TRUTH_DUMP) {
      writeFileSync(process.env.RESPONSE_TRUTH_DUMP, `${JSON.stringify(verdicts.map(({ op, label, status, body }) => ({ op, label, status, body })), null, 2)}\n`, 'utf8');
      // eslint-disable-next-line no-console
      console.log(`\nالقياس: كُتبت ${verdicts.length} ردّاً إلى ${process.env.RESPONSE_TRUTH_DUMP}`);
    }

    // ── التغطيةُ من الوثيقة لا من قائمة — لكلِّ وحدة. ──
    const covered = new Set(verdicts.map((v) => v.op));
    let failed = probes.some((ok) => !ok);
    // eslint-disable-next-line no-console
    console.log('');
    for (const prefix of UNIT_PREFIXES) {
      const unitOps = Object.entries(doc.paths ?? {})
        .filter(([p]) => inUnit(prefix, p))
        .flatMap(([p, item]) => ['get', 'post', 'put', 'patch', 'delete'].filter((m) => (item as Record<string, unknown>)[m]).map((m) => `${m.toUpperCase()} ${p}`))
        .sort();
      const uncovered = unitOps.filter((k) => !covered.has(k));
      const mine = verdicts.filter((v) => inUnit(prefix, v.op.slice(v.op.indexOf(' ') + 1)));
      const bad = mine.filter((v) => v.violations.length > 0);
      // eslint-disable-next-line no-console
      console.log(`الوحدة ${prefix}: عملياتٌ في الوثيقة ${unitOps.length} · طُوبقت ${unitOps.length - uncovered.length} · طلبات ${mine.length} · بمخالفة ${bad.length}`);
      if (uncovered.length) {
        // eslint-disable-next-line no-console
        console.error([`✖ عملياتٌ في الوحدة ${prefix} لم تُطابَق:`, ...uncovered.map((k) => `   ${k}`)].join('\n'));
      }
      if (bad.length || uncovered.length || unitOps.length === 0) failed = true;
    }
    if (failed) process.exitCode = 1;
  } finally {
    dist.mockAdapter.charge = originalCharge;
    await hardDeleteCompanyForTest(prisma as never, companyId).catch(() => undefined);
    const left = await prisma.company.count({ where: { id: companyId } });
    // eslint-disable-next-line no-console
    if (left !== 0) console.warn(`⚠️ منشأةُ الحارس ${companyId} لم تُزَل (قيدُ Restrict) — تبقى في قاعدة الوظيفة وحدَها`);
    await app.close();
  }
}

// خروجٌ صريحٌ بالرمز المحسوب: التطبيقُ المُقلَع يترك مؤقّتاتٍ ومجمّعاتٍ قد تُبقي العمليةَ حيّةً بعد `close` — فتتعلّق الخطوةُ بدل أن تُحكم.
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e: Error) => {
    // eslint-disable-next-line no-console
    console.error(`✖ ${e.stack ?? e.message}`);
    process.exit(1);
  });
