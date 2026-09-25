import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { ApiContract } from '../src/common/openapi-contract.util';

/**
 * **عقدُ الواجهة — يُقرأ من البناء لا من المصدر** (`ق-١٢٩٩` · التوجيه ٢٥٤).
 *
 * ## لماذا من `dist`
 *
 * مُلحَقُ `@nestjs/swagger` **يعمل عبر `nest build` وحدَه**: هو تحويلٌ على المصدر يصف
 * حقولَ الأجسام من أنواع `TypeScript`. فحارسٌ يعمل تحت `ts-jest` يرى الوحدةَ **بلا
 * ذلك التحويل** — أي **عقداً أرقَّ من المنشور**، **وحارسٌ يقارن أقلَّ مما يُنشَر يشهد بما
 * لم يفحص** (حكمُ المالك: «وذاك حارسٌ يحرس نصفَه، وقد نقدناه في أنفسنا»).
 *
 * ⇒ فالسكربتُ يُبنى أوّلاً (`nest build`) ثم **يُركّب الوحدةَ المبنيّة** من `dist`.
 *
 * ## ولا قاعدةَ ولا إقلاع
 *
 * `Test.createTestingModule(...).compile()` يُنشئ المزوّدين **ولا يستدعي `onModuleInit`**،
 * و`createNestApplication()` بلا `init()` لا يفتح اتصالاً — و`SwaggerScanner` يقرأ
 * **الوسومَ لا المسارات المسجَّلة**. فالفحصُ يعمل في وظيفة الوحدات بلا قاعدة.
 *
 * ⚠️ **ومفتاحُ التوقيع يُعلَن هنا**: `AppModule` يطلبه عند الإنشاء (`getOrThrow` —
 * وهو الوحيدُ في المستودع، مقيس)، و`??=` تُبقي ما ضبطته البيئة. **ولا يُوقَّع به شيء.**
 *
 * الاستعمال (من `apps/api`):
 *   npm run openapi:check      ⟵ يبني ويقارن، ويسقط على كسرٍ في العقد
 *   npm run openapi:snapshot   ⟵ يبني ويكتب اللقطة عمداً حين يُقصَد التغيير
 */
process.env.JWT_ACCESS_SECRET ??= 'openapi-contract-check-signs-nothing';

const DIST = join(__dirname, '..', 'dist', 'src');
const SNAPSHOT = join(__dirname, '..', '..', '..', 'docs', 'openapi.snapshot.json');

interface DistExports {
  AppModule: unknown;
  applyApiVersioning: (app: INestApplication) => void;
  buildOpenApiDocument: (app: INestApplication) => OpenAPIObject;
  contractOf: (doc: OpenAPIObject) => ApiContract;
  contractBreaks: (snapshot: ApiContract, current: ApiContract) => string[];
  documentProblems: (doc: OpenAPIObject, prefix: string) => string[];
  arrayShapeProblems: (doc: OpenAPIObject, sources: readonly string[]) => { problems: string[]; arrays: number };
  API_VERSION_PREFIX: string;
  renderSharedRequests: (doc: OpenAPIObject) => { general: string; unit: string; bodies: number; queries: number; unitNames: string[]; names: string[] };
  renderSharedResponses: (doc: OpenAPIObject, requestNames: ReadonlySet<string>, requestUnitNames: ReadonlySet<string>) => { general: string; unit: string; count: number; unitNames: string[] };
  SAUDI_UNIT_PATH_MARK: string;
  untypedResponseOperations: (doc: OpenAPIObject) => string[];
}

/**
 * ⚖️ **مِسنَنُ الردود — ينقص ولا يزيد** (`ق-١٤٣٨` · خطّةُ الأنواع ④ البند ١ · سابقةُ `docs/spec-untested.json`).
 *
 * العملياتُ بلا مخطَّطِ ردٍّ يعلن شكلاً مسرودةٌ في الملفّ يومَ البدء. **عمليةٌ جديدة بلا مخطَّط ⟵ يُسقط** (لا يزيد)،
 * **ومسرودةٌ صار لها مخطَّط أو زالت ⟵ يُسقط الفحصُ حتى تُحذف** (ينقص) — و`openapi:snapshot` يحذفها وحدَه ولا يضيف أبداً.
 */
const UNTYPED = join(__dirname, '..', '..', '..', 'docs', 'openapi-untyped-responses.json');

interface UntypedFile {
  note: string;
  operations: string[];
}

function syncUntyped(dist: DistExports, doc: OpenAPIObject, mode: 'write' | 'check'): boolean {
  const current = dist.untypedResponseOperations(doc);
  const listed = (JSON.parse(readFileSync(UNTYPED, 'utf8')) as UntypedFile).operations;
  const added = current.filter((k) => !listed.includes(k));
  const gone = listed.filter((k) => !current.includes(k));
  // eslint-disable-next-line no-console
  console.log(`ردودٌ بلا مخطَّط: ${current.length} · في المِسنَن: ${listed.length} · جديدةٌ بلا مخطَّط: ${added.length} · صار لها مخطَّط: ${gone.length}`);
  if (added.length > 0) {
    // eslint-disable-next-line no-console
    console.error(['✖ عمليةٌ جديدة بلا مخطَّطِ ردّ — المِسنَنُ لا يزيد (ق-١٤٣٨):', ...added.map((k) => `   ${k}`), '', 'أعلن ردَّها: صنفٌ في dto/*-response.dto.ts و@ApiOkResponse/@ApiCreatedResponse.'].join('\n'));
    return false;
  }
  if (gone.length === 0) return true;
  if (mode === 'write') {
    const file = JSON.parse(readFileSync(UNTYPED, 'utf8')) as UntypedFile;
    writeFileSync(UNTYPED, `${JSON.stringify({ ...file, operations: listed.filter((k) => current.includes(k)) }, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`المِسنَن: حُذف ${gone.length} — ${gone.join(' · ')}`);
    return true;
  }
  // eslint-disable-next-line no-console
  console.error(['✖ مسرودةٌ في مِسنَن الردود صار لها مخطَّط — تُحذف منه (ينقص):', ...gone.map((k) => `   ${k}`), '', 'npm run openapi:snapshot يحذفها.'].join('\n'));
  return false;
}

/**
 * مسارا الملفّين **من موضع هذا السكربت** لا من الوحدة المبنيّة: `dist/src/common` أعمقُ درجةً من `src/common`، فجذرٌ يُحسب هناك
 * يقع في `apps/` (وقع في أوّل تشغيل: `ENOENT … apps\packages\shared`).
 */
const SHARED_API_DIR = join(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'api');

/** مصدرُ أصناف الطلب — ملفّاتُ `.dto.ts` وحدَها، وهي اللاحقةُ التي يقرؤها المُلحَق (`ق-١٣٨٣`). */
const SRC = join(__dirname, '..', 'src');
function dtoSources(dir: string = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) dtoSources(path, out);
    else if (name.endsWith('.dto.ts')) out.push(readFileSync(path, 'utf8'));
  }
  return out;
}

/** أدنى ما يُقرأ من حقول المصفوفة — قِيس `34` (2026-09-24)؛ ودونه فالفحصُ لم يقرأ ما يدّعي (`§8.7`). */
const MIN_ARRAY_FIELDS = 20;

function loadDist(): DistExports {
  const entry = join(DIST, 'app.module.js');
  if (!existsSync(entry)) {
    // eslint-disable-next-line no-console
    console.error(`✖ لا بناءَ في ${DIST} — شغّل "nest build" أوّلاً (أو استعمل npm run openapi:check)`);
    process.exit(2);
  }
  /* eslint-disable @typescript-eslint/no-var-requires */
  const appModule = require(entry) as { AppModule: unknown };
  const versioning = require(join(DIST, 'common', 'versioning.js')) as { applyApiVersioning: (app: INestApplication) => void; API_VERSION_PREFIX: string };
  const document = require(join(DIST, 'common', 'openapi-document.js')) as { buildOpenApiDocument: (app: INestApplication) => OpenAPIObject };
  const contract = require(join(DIST, 'common', 'openapi-contract.util.js')) as {
    contractOf: (doc: OpenAPIObject) => ApiContract;
    contractBreaks: (snapshot: ApiContract, current: ApiContract) => string[];
    documentProblems: (doc: OpenAPIObject, prefix: string) => string[];
    arrayShapeProblems: DistExports['arrayShapeProblems'];
  };
  // ③ (`ق-١٤٠٤`): أنواعُ الطلب المولَّدة تُرسَم من الوثيقة نفسِها — في الخطوة نفسِها.
  const requests = require(join(DIST, 'common', 'shared-requests.util.js')) as Pick<DistExports, 'renderSharedRequests' | 'renderSharedResponses'>;
  const country = require(join(DIST, 'common', 'country-literals.util.js')) as Pick<DistExports, 'SAUDI_UNIT_PATH_MARK'>;
  // ④ (`ق-١٤٣٨`): مِسنَنُ الردود يُقرأ من الوثيقة نفسِها.
  const responses = require(join(DIST, 'common', 'response-schema.util.js')) as Pick<DistExports, 'untypedResponseOperations'>;
  /* eslint-enable @typescript-eslint/no-var-requires */
  return { AppModule: appModule.AppModule, ...versioning, ...document, ...contract, ...requests, SAUDI_UNIT_PATH_MARK: country.SAUDI_UNIT_PATH_MARK, ...responses };
}

/**
 * ⚖️ **③ — الأنواعُ المولَّدة تطابق الوثيقةَ حرفاً** (`ق-١٤٠٤`): تُكتب مع اللقطة (`--write`)، وتُقارَن في الفحص فيُسقط اختلافُها — فصنفٌ تغيّر
 * في الخادم بلا إعادة توليدٍ لا يمرّ، وملفٌّ حُرّر بيدٍ لا يمرّ. ونهاياتُ الأسطر توحَّد قبل المقارنة (`§8.7` الوجه الخامس عشر).
 */
function syncSharedRequests(dist: DistExports, doc: OpenAPIObject, mode: 'write' | 'check'): boolean {
  const rendered = dist.renderSharedRequests(doc);
  // ④ (`ق-١٤٣٨`): الردودُ المعلنة بالأداة نفسِها — تستورد من ملفّي الطلب ما رُسم هناك ولا تعيد تعريفه.
  const responses = dist.renderSharedResponses(doc, new Set(rendered.names), new Set(rendered.unitNames));
  const files: [string, string][] = [
    [join(SHARED_API_DIR, 'requests.ts'), rendered.general],
    [join(SHARED_API_DIR, `${dist.SAUDI_UNIT_PATH_MARK}-requests.ts`), rendered.unit],
    [join(SHARED_API_DIR, 'responses.ts'), responses.general],
    [join(SHARED_API_DIR, `${dist.SAUDI_UNIT_PATH_MARK}-responses.ts`), responses.unit],
  ];
  if (mode === 'write') {
    for (const [path, text] of files) writeFileSync(path, text, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`أنواعُ الطلب المولَّدة: ${rendered.bodies} جسماً · ${rendered.queries} استعلاماً · في ملفّ الوحدة: ${rendered.unitNames.length} — كُتبت`);
    // eslint-disable-next-line no-console
    console.log(`أنواعُ الردّ المولَّدة: ${responses.count} · في ملفّ الوحدة: ${responses.unitNames.length} — كُتبت`);
    return true;
  }
  const stale = files.filter(([path, text]) => !existsSync(path) || readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== text).map(([path]) => path);
  // eslint-disable-next-line no-console
  console.log(`أنواعُ الطلب المولَّدة: ${rendered.bodies} جسماً · ${rendered.queries} استعلاماً · أنواعُ الردّ: ${responses.count} · متقادمة: ${stale.length}`);
  if (stale.length > 0) {
    // eslint-disable-next-line no-console
    console.error(['✖ أنواعُ الطلب المولَّدة لا تطابق الوثيقة (ق-١٤٠٤):', ...stale.map((p) => `   ${p}`), '', 'أعد توليدَها: npm run openapi:snapshot — ولا تُحرَّر بيد.'].join('\n'));
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  const dist = loadDist();
  // `@nestjs/testing` تطويريّةٌ ولا تدخل حزمةَ الإنتاج — ولذلك تُستدعى من سكربتٍ لا من `src`.
  const { Test } = await import('@nestjs/testing');
  const moduleRef = await Test.createTestingModule({ imports: [dist.AppModule as never] }).compile();
  const app = moduleRef.createNestApplication();
  dist.applyApiVersioning(app);
  const doc = dist.buildOpenApiDocument(app);
  const current = dist.contractOf(doc);
  await app.close();

  // ⚖️ ق-١٣٨٢ — **شكلُ الوثيقة قبل عقدها**: بابٌ واحد ومعرّفاتٌ فريدة، وإلا فلا فحصَ ولا كتابة.
  const problems = dist.documentProblems(doc, dist.API_VERSION_PREFIX);
  // ③ (`ق-١٤٠٤`): وحقلُ المصفوفة في المصدر يُوصف مصفوفة — والمقروءُ يُطبع ويُسقط إن قلّ عن حدّه.
  const shape = dist.arrayShapeProblems(doc, dtoSources());
  // eslint-disable-next-line no-console
  console.log(`حقولُ مصفوفةٍ مقروءة من المصدر: ${shape.arrays} · موصوفةٌ خطأً: ${shape.problems.length}`);
  if (shape.arrays < MIN_ARRAY_FIELDS) problems.push(`فحصُ المصفوفات قرأ ${shape.arrays} حقلاً — دون ${MIN_ARRAY_FIELDS}، فلم يقرأ ما يدّعي`);
  problems.push(...shape.problems);
  if (problems.length > 0) {
    // eslint-disable-next-line no-console
    console.error([`✖ الوثيقةُ لا تصلح لمولِّد (${problems.length}):`, ...problems.slice(0, 20).map((p) => `   ${p}`)].join('\n'));
    process.exit(1);
  }

  const count = Object.keys(current).length;
  if (count < 200) {
    // eslint-disable-next-line no-console
    console.error(`✖ العقدُ صغيرٌ على غير المتوقَّع (${count} عملية) — يُوقَف بدل أن تُكتب لقطةٌ عمياء`);
    process.exit(1);
  }

  // ④ (`ق-١٤٣٨`): بذرةُ المِسنَن تُكتب مرّةً واحدة — ولا تُكتب فوق ملفٍّ قائم، فالمِسنَنُ لا يُعاد ملؤه.
  if (process.argv.includes('--seed-untyped')) {
    if (existsSync(UNTYPED)) {
      // eslint-disable-next-line no-console
      console.error(`✖ ${UNTYPED} قائم — البذرةُ مرّةً واحدة، والمِسنَنُ ينقص بـ openapi:snapshot ولا يُعاد ملؤه`);
      process.exit(1);
    }
    const operations = dist.untypedResponseOperations(doc);
    const note = 'مِسنَنُ الردود (ق-١٤٣٨ · خطّةُ الأنواع ④): عملياتٌ بلا مخطَّطِ ردٍّ يعلن شكلاً — ينقص ولا يزيد. لا يُحرَّر بيدٍ للزيادة.';
    writeFileSync(UNTYPED, `${JSON.stringify({ note, operations }, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`بذرةُ المِسنَن: ${operations.length} عمليةً من ${count} — كُتبت ${UNTYPED}`);
    return;
  }

  if (mode === 'write') {
    writeFileSync(SNAPSHOT, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`عملياتٌ في اللقطة: ${count} · كُتبت ${SNAPSHOT}`);
    syncSharedRequests(dist, doc, 'write');
    if (!syncUntyped(dist, doc, 'write')) process.exit(1);
    return;
  }
  const requestsFresh = syncSharedRequests(dist, doc, 'check');
  const untypedFresh = syncUntyped(dist, doc, 'check');

  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as ApiContract;
  const breaks = dist.contractBreaks(snapshot, current);
  // eslint-disable-next-line no-console
  console.log(`عملياتٌ في العقد: ${count} · في اللقطة: ${Object.keys(snapshot).length} · كسور: ${breaks.length}`);
  if (breaks.length > 0) {
    // eslint-disable-next-line no-console
    console.error(['✖ كسرٌ في عقد الواجهة:', ...breaks.map((b) => `   ${b}`), '', 'وإن كان مقصوداً: npm run openapi:snapshot — فيظهر في فرق الطلب.'].join('\n'));
    process.exit(1);
  }
  if (!requestsFresh || !untypedFresh) process.exit(1);
}

void main();
