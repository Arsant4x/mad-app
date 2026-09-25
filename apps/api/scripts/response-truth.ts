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
 *
 * ⚠️ **وحدودُه معلَنة**: الحقلُ الزائد غيرُ المعلَن لا يُعدّ (`response-schema.util.ts`) · **والجسمُ الفارغ يُقرأ `null`** حيث يعلن
 * المخطَّطُ `nullable` — لأن `Nest` لا يرسل `null` بل جسماً فارغاً (`ExpressAdapter.reply`: `isNil(body) ⟸ response.send()`)،
 * **ويُطبع حيث وقع** فلا يخفى. **ومحوّلُ الدفع التجريبيّ** (`MOCK`) يُستعمل لبلوغ مسارات المحاولة، **وشحنُه يُرمى مرّةً عمداً**
 * ليبلغ «معلّقٌ» مسارَي الحسم — ويُعاد كما كان.
 *
 * الاستعمال (من `apps/api`، بقاعدةٍ حيّة في `DATABASE_URL`):
 *   npm run response:truth        ⟵ يبني ويقلع ويطابق — والخروجُ غيرُ الصفريّ يُسقط الخطوة
 */

const DIST = join(__dirname, '..', 'dist', 'src');

/** الوحدةُ الأولى (`ق-١٤٣٨`): الكاشير — كلُّ عمليةٍ تحت هذا الباب في الوثيقة تُطابَق. */
const UNIT_PREFIX = '/v1/pos/';

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
    const emptyAsNull = res.text === '' && res.status < 300;
    const body: unknown = emptyAsNull ? null : res.body;
    if (!op) violations.push('عمليةٌ لا توجد في الوثيقة');
    else {
      const success = dist.successResponseOf(op);
      if (!success) violations.push('لا ردَّ نجاحٍ معلَناً');
      else {
        if (String(res.status) !== success.status) violations.push(`رمزُ الردّ ${res.status} والمعلَنُ ${success.status} — ${String(res.text).slice(0, 160)}`);
        else if (!dist.declaresShape(success.schema, schemas)) violations.push('ردُّ النجاح بلا مخطَّطٍ يعلن شكلاً');
        else violations.push(...dist.schemaViolations(body, success.schema ?? undefined, schemas));
      }
    }
    verdicts.push({ op: key, label, status: res.status, violations, emptyAsNull });
    return (body ?? {}) as Record<string, unknown>;
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

    // ── المسبارُ يُصادَق على ردٍّ حقيقيّ (`§8.7` الحادي عشر): نزعُ حقلٍ إلزاميّ يجب أن يُسقط. ──
    const saleOp = (doc.paths?.['/v1/pos/sales'] as Record<string, object> | undefined)?.post;
    const saleSchema = saleOp ? dist.successResponseOf(saleOp)?.schema ?? undefined : undefined;
    const resolved = saleSchema?.$ref ? schemas[saleSchema.$ref.split('/').pop() as string] : saleSchema;
    const firstRequired = resolved?.required?.[0];
    const probeOk = !!firstRequired && dist.schemaViolations(Object.fromEntries(Object.entries(saleBody).filter(([k]) => k !== firstRequired)), saleSchema, schemas).length > 0;
    // eslint-disable-next-line no-console
    console.log(`المسبار: نزعُ «${firstRequired ?? '—'}» من ردّ البيع ⟸ ${probeOk ? 'أُمسك ✔' : 'لم يُمسك ✖'}`);

    // ── التغطيةُ من الوثيقة لا من قائمة. ──
    const unitOps = Object.entries(doc.paths ?? {})
      .filter(([p]) => p.startsWith(UNIT_PREFIX))
      .flatMap(([p, item]) => ['get', 'post', 'put', 'patch', 'delete'].filter((m) => (item as Record<string, unknown>)[m]).map((m) => `${m.toUpperCase()} ${p}`))
      .sort();
    const covered = new Set(verdicts.map((v) => v.op));
    const uncovered = unitOps.filter((k) => !covered.has(k));

    for (const v of verdicts) {
      // eslint-disable-next-line no-console
      console.log(`${v.violations.length ? '✖' : '✔'} ${v.op} (${v.status}) — ${v.label}${v.emptyAsNull ? ' · جسمٌ فارغٌ قُرئ null' : ''}${v.violations.length ? `\n   ${v.violations.slice(0, 12).join('\n   ')}` : ''}`);
    }
    const bad = verdicts.filter((v) => v.violations.length > 0);
    // eslint-disable-next-line no-console
    console.log(`\nالوحدة ${UNIT_PREFIX}: عملياتٌ في الوثيقة ${unitOps.length} · طُوبقت ${unitOps.length - uncovered.length} · طلبات ${verdicts.length} · بمخالفة ${bad.length}`);
    if (uncovered.length) {
      // eslint-disable-next-line no-console
      console.error(['✖ عملياتٌ في الوحدة لم تُطابَق:', ...uncovered.map((k) => `   ${k}`)].join('\n'));
    }
    if (bad.length || uncovered.length || !probeOk || unitOps.length === 0) process.exitCode = 1;
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
