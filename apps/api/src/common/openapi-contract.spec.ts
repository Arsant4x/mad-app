import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { ApiContract, contractBreaks, contractOf } from './openapi-contract.util';
import { buildOpenApiDocument } from './openapi-document';
import { applyApiVersioning } from './versioning';

/**
 * **حارسُ عقد الواجهة البرمجية** (`ق-١٢٩١` · ي/⑫A2) — **لقطةٌ تُقارَن باتجاهٍ واحد**.
 *
 * ## لماذا
 *
 * `ق-١٢٨٦` أعطى المسارَ إصداراً، **والإصدارُ وعدٌ لا يُحرس بنفسه**: من يَعِد بـ`/v1`
 * ثم يحذف مساراً منه يكسر مستهلكَه بلا أن يشتكي شيء. **فاللقطةُ هي ما يجعل الوعدَ
 * مقروءاً**: تُولَّد من `SwaggerModule.createDocument` نفسِه الذي يُنشَر، وتُقارَن
 * **باتجاهٍ واحد** — الحذفُ والتغييرُ يُسقطان، **والإضافةُ تمرّ**.
 *
 * ## ولماذا بلا قاعدة
 *
 * `SwaggerScanner.scanApplication` يقرأ **`app.container` و`app.config`** — أي الوسوم
 * لا المسارات المسجَّلة، **ولا يستدعي `app.init()`** (مقروءٌ من
 * `node_modules/@nestjs/swagger/dist/swagger-scanner.js:19-26`). فلا اتصالَ بقاعدة،
 * والحارسُ في `api-unit` حيث يُشغَّل على كلِّ دفع.
 *
 * ## تحديثُ اللقطة
 *
 * حين يُقصَد حذفٌ أو تغيير: `npx ts-node scripts/openapi-snapshot.ts` من `apps/api`،
 * **فيظهر الكسرُ في فرق الطلب بدل أن يمرّ صامتاً** — وهو الغرض.
 */

const SNAPSHOT = join(__dirname, '..', '..', '..', '..', 'docs', 'openapi.snapshot.json');

describe('عقدُ الواجهة البرمجية: لقطةٌ تُقارَن باتجاهٍ واحد (ق-١٢٩١ · ⑫A2)', () => {
  let current: ApiContract;
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as ApiContract;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    // **كما في الإقلاع بالضبط** — الإصدارُ قبل الوثيقة، وإلا جاءت المساراتُ بلا `/v1`.
    applyApiVersioning(app);
    current = contractOf(buildOpenApiDocument(app));
    await app.close();
  });

  it('السطحُ غير فارغ — وإلا فالحارسُ يقارن العدم', () => {
    expect(Object.keys(snapshot).length).toBeGreaterThanOrEqual(200);
    expect(Object.keys(current).length).toBeGreaterThanOrEqual(200);
  });

  it('⭐ لا يكسر شيءٌ ما في اللقطة — والإضافةُ تمرّ', () => {
    expect(contractBreaks(snapshot, current)).toEqual([]);
  });

  it('مُصادَقٌ بأربعٍ: حذفٌ · وسيطٌ زال · رمزُ ردٍّ زال · حقلٌ صار إلزامياً — والإضافةُ تمرّ', () => {
    const base: ApiContract = {
      'GET /v1/x': { parameters: ['path:id:required'], requiredBody: [], responses: ['200', '404'] },
      'POST /v1/y': { parameters: [], requiredBody: ['a'], responses: ['201'] },
    };
    expect(contractBreaks(base, base)).toEqual([]);
    expect(contractBreaks(base, { 'POST /v1/y': base['POST /v1/y'] })).toEqual(['حُذف: GET /v1/x']);
    expect(
      contractBreaks(base, { ...base, 'GET /v1/x': { ...base['GET /v1/x'], parameters: [] } }),
    ).toEqual(['وسيطٌ حُذف: GET /v1/x ⟵ path:id']);
    expect(
      contractBreaks(base, { ...base, 'GET /v1/x': { ...base['GET /v1/x'], responses: ['200'] } }),
    ).toEqual(['رمزُ ردٍّ حُذف: GET /v1/x ⟵ 404']);
    expect(
      contractBreaks(base, { ...base, 'POST /v1/y': { ...base['POST /v1/y'], requiredBody: ['a', 'b'] } }),
    ).toEqual(['حقلٌ صار إلزامياً: POST /v1/y ⟵ b']);
    // إضافةُ مسارٍ جديد وحقلٍ اختياريّ: لا كسر.
    expect(contractBreaks(base, { ...base, 'GET /v1/z': { parameters: [], requiredBody: [], responses: ['200'] } })).toEqual([]);
  });
});
