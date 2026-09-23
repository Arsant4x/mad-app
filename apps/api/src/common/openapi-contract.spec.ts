import { ApiContract, contractBreaks, contractOf } from './openapi-contract.util';

/**
 * **قواعدُ العقد — نقيّةٌ على وثيقةٍ مصنوعة** (`ق-١٢٩٩` · التوجيه ٢٥٤).
 *
 * ## لماذا لم تعد تبني الوحدة
 *
 * كان هذا الحارسُ يبني `AppModule` تحت `ts-jest` ويقارن الوثيقةَ باللقطة. **ومُلحَقُ
 * `@nestjs/swagger` يعمل عبر `nest build` وحدَه** — فالوثيقةُ هنا **أرقُّ من المنشورة**:
 * بلا حقول الأجسام. **وحارسٌ يقارن أقلَّ مما يُنشَر يشهد بما لم يفحص.**
 *
 * ⇒ فانتقلت المقارنةُ إلى **مسار البناء** (`scripts/openapi-snapshot.ts` ⟵
 * `npm run openapi:check`، خطوةٌ في وظيفة `api-unit`)، **وبقي هنا ما هو منطقٌ نقيّ**:
 * استخراجُ العقد من وثيقة، والحكمُ باتجاهٍ واحد. **وهما ما يُخطئ فيهما الإنسان**،
 * والوثيقةُ المصنوعة تُثبتهما بلا بناءٍ ولا قاعدة.
 */
describe('قواعدُ عقد الواجهة — باتجاهٍ واحد (ق-١٢٩١ · ق-١٢٩٩)', () => {
  const doc = {
    openapi: '3.0.0',
    paths: {
      '/v1/things/{id}': {
        get: {
          parameters: [{ in: 'path', name: 'id', required: true }, { in: 'query', name: 'page' }],
          responses: { '200': {}, '404': {} },
        },
        delete: { responses: { '204': {} } },
      },
      '/v1/things': {
        post: {
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateThingDto' } } } },
          responses: { '201': {} },
        },
      },
    },
    components: { schemas: { CreateThingDto: { required: ['name'], properties: { name: {}, note: {} } } } },
  } as never;

  it('⭐ الاستخراجُ يقرأ الوسائطَ بإلزامها ورموزَ الردّ والحقولَ الإلزامية — ومرتَّباً', () => {
    const contract = contractOf(doc);
    expect(Object.keys(contract)).toEqual(['DELETE /v1/things/{id}', 'GET /v1/things/{id}', 'POST /v1/things']);
    expect(contract['GET /v1/things/{id}']).toEqual({
      parameters: ['path:id:required', 'query:page'],
      requiredBody: [],
      responses: ['200', '404'],
    });
    // **الحقلُ الإلزاميّ يُقرأ عبر `$ref`** — وهو ما يصفه المُلحَقُ في البناء.
    expect(contract['POST /v1/things'].requiredBody).toEqual(['name']);
  });

  it('⭐ الحذفُ والتغييرُ يُسقطان، والإضافةُ تمرّ', () => {
    const base = contractOf(doc);
    expect(contractBreaks(base, base)).toEqual([]);

    // إضافةُ مسارٍ جديد وحقلٍ اختياريّ: لا كسر.
    const grown: ApiContract = { ...base, 'GET /v1/new': { parameters: [], requiredBody: [], responses: ['200'] } };
    expect(contractBreaks(base, grown)).toEqual([]);

    // حذفُ مسار · وسيطٍ · رمزِ ردّ · وجعلُ حقلٍ إلزامياً.
    const without = { ...base };
    delete without['DELETE /v1/things/{id}'];
    expect(contractBreaks(base, without)).toEqual(['حُذف: DELETE /v1/things/{id}']);
    expect(contractBreaks(base, { ...base, 'GET /v1/things/{id}': { ...base['GET /v1/things/{id}'], parameters: ['path:id:required'] } })).toEqual([
      'وسيطٌ حُذف: GET /v1/things/{id} ⟵ query:page',
    ]);
    expect(contractBreaks(base, { ...base, 'GET /v1/things/{id}': { ...base['GET /v1/things/{id}'], responses: ['200'] } })).toEqual([
      'رمزُ ردٍّ حُذف: GET /v1/things/{id} ⟵ 404',
    ]);
    expect(contractBreaks(base, { ...base, 'POST /v1/things': { ...base['POST /v1/things'], requiredBody: ['name', 'note'] } })).toEqual([
      'حقلٌ صار إلزامياً: POST /v1/things ⟵ note',
    ]);
    // ووسيطٌ اختياريٌّ صار إلزامياً يكسر كذلك.
    expect(contractBreaks(base, { ...base, 'GET /v1/things/{id}': { ...base['GET /v1/things/{id}'], parameters: ['path:id:required', 'query:page:required'] } })).toEqual([
      'وسيطٌ صار إلزامياً: GET /v1/things/{id} ⟵ query:page',
    ]);
  });
});
