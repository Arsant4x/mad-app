import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
}

function loadDist(): DistExports {
  const entry = join(DIST, 'app.module.js');
  if (!existsSync(entry)) {
    // eslint-disable-next-line no-console
    console.error(`✖ لا بناءَ في ${DIST} — شغّل "nest build" أوّلاً (أو استعمل npm run openapi:check)`);
    process.exit(2);
  }
  /* eslint-disable @typescript-eslint/no-var-requires */
  const appModule = require(entry) as { AppModule: unknown };
  const versioning = require(join(DIST, 'common', 'versioning.js')) as { applyApiVersioning: (app: INestApplication) => void };
  const document = require(join(DIST, 'common', 'openapi-document.js')) as { buildOpenApiDocument: (app: INestApplication) => OpenAPIObject };
  const contract = require(join(DIST, 'common', 'openapi-contract.util.js')) as {
    contractOf: (doc: OpenAPIObject) => ApiContract;
    contractBreaks: (snapshot: ApiContract, current: ApiContract) => string[];
  };
  /* eslint-enable @typescript-eslint/no-var-requires */
  return { AppModule: appModule.AppModule, ...versioning, ...document, ...contract };
}

async function main(): Promise<void> {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  const dist = loadDist();
  // `@nestjs/testing` تطويريّةٌ ولا تدخل حزمةَ الإنتاج — ولذلك تُستدعى من سكربتٍ لا من `src`.
  const { Test } = await import('@nestjs/testing');
  const moduleRef = await Test.createTestingModule({ imports: [dist.AppModule as never] }).compile();
  const app = moduleRef.createNestApplication();
  dist.applyApiVersioning(app);
  const current = dist.contractOf(dist.buildOpenApiDocument(app));
  await app.close();

  const count = Object.keys(current).length;
  if (count < 200) {
    // eslint-disable-next-line no-console
    console.error(`✖ العقدُ صغيرٌ على غير المتوقَّع (${count} عملية) — يُوقَف بدل أن تُكتب لقطةٌ عمياء`);
    process.exit(1);
  }

  if (mode === 'write') {
    writeFileSync(SNAPSHOT, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`عملياتٌ في اللقطة: ${count} · كُتبت ${SNAPSHOT}`);
    return;
  }

  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as ApiContract;
  const breaks = dist.contractBreaks(snapshot, current);
  // eslint-disable-next-line no-console
  console.log(`عملياتٌ في العقد: ${count} · في اللقطة: ${Object.keys(snapshot).length} · كسور: ${breaks.length}`);
  if (breaks.length > 0) {
    // eslint-disable-next-line no-console
    console.error(['✖ كسرٌ في عقد الواجهة:', ...breaks.map((b) => `   ${b}`), '', 'وإن كان مقصوداً: npm run openapi:snapshot — فيظهر في فرق الطلب.'].join('\n'));
    process.exit(1);
  }
}

void main();
