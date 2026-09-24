import { ApiContract, arrayShapeProblems, contractBreaks, contractOf, documentProblems } from './openapi-contract.util';
import { arrayEnumsInItems, versionedDocument } from './openapi-document';

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

describe('⚖️ شكلُ الوثيقة — بابٌ واحد ومعرّفاتٌ فريدة (ق-١٣٨٢ · خطّةُ الأنواع ①)', () => {
  /** وثيقةٌ كما يُنتجها `createDocument` تحت `defaultVersion: ['1', VERSION_NEUTRAL]`: كلُّ مسارٍ بابان بمعرّفٍ واحد. */
  const twoDoors = {
    openapi: '3.0.0',
    info: { title: 't', version: '0' },
    paths: {
      '/v1/things': { get: { operationId: 'ThingsController_list', responses: { '200': {} } } },
      '/things': { get: { operationId: 'ThingsController_list', responses: { '200': {} } } },
      '/v1/things/{id}': { delete: { operationId: 'ThingsController_remove', responses: { '204': {} } } },
      '/things/{id}': { delete: { operationId: 'ThingsController_remove', responses: { '204': {} } } },
    },
  } as never;

  it('⭐ الوثيقةُ ببابين تُعلَن معطوبةً — المسارُ المحايد والمعرّفُ المكرَّر كلٌّ باسمه', () => {
    expect(documentProblems(twoDoors, 'v1')).toEqual([
      'مسارٌ خارج الإصدار: /things',
      'مسارٌ خارج الإصدار: /things/{id}',
      'معرّفُ عمليةٍ مكرَّر: ThingsController_list ⟵ GET /v1/things · GET /things',
      'معرّفُ عمليةٍ مكرَّر: ThingsController_remove ⟵ DELETE /v1/things/{id} · DELETE /things/{id}',
    ]);
  });

  it('⭐ وبابُ الإصدار وحدَه يصلح — والمحايدُ يُسقَط من `paths` لا غير', () => {
    const one = versionedDocument(twoDoors, 'v1') as unknown as { paths: Record<string, unknown>; info: unknown };
    expect(Object.keys(one.paths)).toEqual(['/v1/things', '/v1/things/{id}']);
    expect(one.info).toEqual({ title: 't', version: '0' });
    expect(documentProblems(one as never, 'v1')).toEqual([]);
  });

  it('وعمليةٌ بلا معرّفٍ تُعلَن — فالمولِّدُ لا يسمّيها', () => {
    const doc = { paths: { '/v1/x': { post: { responses: { '201': {} } } } } } as never;
    expect(documentProblems(doc, 'v1')).toEqual(['عمليةٌ بلا معرّف: POST /v1/x']);
  });

  it('⭐ ومخطَّطُ طلبٍ بلا خاصيّة يُعلَن باسمه (ق-١٣٨٣ · ②) — والمُشارُ إليه والمضمَّنُ سواء', () => {
    const body = (schema: Record<string, unknown>) => ({ content: { 'application/json': { schema } } });
    const doc = {
      paths: {
        '/v1/a': { post: { operationId: 'A_create', requestBody: body({ $ref: '#/components/schemas/EmptyDto' }), responses: {} } },
        '/v1/b': { post: { operationId: 'B_create', requestBody: body({ $ref: '#/components/schemas/FullDto' }), responses: {} } },
        '/v1/c': { post: { operationId: 'C_create', requestBody: body({ type: 'object' }), responses: {} } },
        '/v1/d': { post: { operationId: 'D_create', requestBody: body({ type: 'array', items: { $ref: '#/components/schemas/FullDto' } }), responses: {} } },
      },
      components: { schemas: { EmptyDto: { type: 'object', properties: {} }, FullDto: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } } } },
    } as never;
    expect(documentProblems(doc, 'v1')).toEqual(['مخطَّطُ طلبٍ بلا خاصيّة: POST /v1/a ⟵ EmptyDto', 'مخطَّطُ طلبٍ بلا خاصيّة: POST /v1/c ⟵ مضمَّن']);
  });
});

describe('⚖️ حقلُ المصفوفة في المصدر يُوصف مصفوفةً في الوثيقة (ق-١٤٠٤ · ③)', () => {
  /**
   * مصدرٌ مصنوعٌ بدالّةٍ لا حرفياً (`§4` — عيّناتُ الحرّاس): صنفان لهما مخطَّط، وصنفٌ بلا مخطَّط، وسطرُ تعليقٍ
   * يشبه خاصّيةً — والحالتان المعلومتان: `BadDto.tags` **يجب** أن يُمسَك، و`GoodDto.lines` **يجب** ألّا يُمسَك.
   */
  const lines = (eol: string) =>
    [
      'export class GoodDto {',
      '  lines!: LineDto[];',
      '  ids?: string[] | null;',
      '  note?: string | null;',
      '  /**',
      '   * fake?: string[];',
      '   */',
      '  missing?: Array<string>;',
      '  /*',
      '  ghost?: string[];',
      '  */',
      '}',
      'class HelperDto {',
      '  items: string[];',
      '}',
      'export class BadDto {',
      '  tags?: string[];',
      '  screens?: string[];',
      '}',
    ].join(eol);
  const doc = {
    paths: {},
    components: {
      schemas: {
        GoodDto: {
          properties: {
            lines: { type: 'array', items: { $ref: '#/components/schemas/LineDto' } },
            ids: { type: 'array', items: { type: 'string' } },
            note: { type: 'string' },
          },
        },
        BadDto: {
          properties: {
            tags: { type: 'string', enum: ['a', 'b'] },
            // ما خرج فعلاً بعد `@ApiProperty({ enum, isArray })` والمُلحَقُ يدمج تعدادَ `@IsIn` فوقه:
            screens: { type: 'array', enum: ['a', 'b'], items: { type: 'string', enum: ['a', 'b'] } },
          },
        },
      },
    },
  } as never;

  it('⭐ المصفوفةُ الموصوفةُ نصّاً تُمسَك، والموصوفةُ مصفوفةً تمرّ — والغائبةُ والمعدودةُ على مستواها تُمسَكان', () => {
    const { problems, arrays } = arrayShapeProblems(doc, [lines('\n')]);
    expect(problems).toEqual([
      'حقلُ مصفوفةٍ موصوفٌ غيرَ مصفوفة: GoodDto.missing (Array<string>) ⟵ null',
      'حقلُ مصفوفةٍ موصوفٌ غيرَ مصفوفة: BadDto.tags (string[]) ⟵ {"type":"string","enum":["a","b"]}',
      'مصفوفةٌ تحمل تعداداً على مستواها لا على عناصرها: BadDto.screens',
    ]);
    // خمسٌ مقروءة: lines · ids (`| null` يُنزَع) · missing · tags · screens — لا `note` ولا سطرا التعليق (بنجمةٍ وبلا نجمة) ولا صنفٌ بلا مخطَّط.
    expect(arrays).toBe(5);
  });

  it('⭐ والبابُ ينقل تعدادَ المصفوفة إلى عناصرها — فيمرّ ما كان يُمسَك، ولا يمسّ تعدادَ نصٍّ واحد', () => {
    const fixed = arrayEnumsInItems(doc) as unknown as { components: { schemas: Record<string, { properties: Record<string, unknown> }> } };
    // عناصرُها تحمل تعدادَها ⟵ يُسقَط الذي على المستوى.
    expect(fixed.components.schemas.BadDto.properties.screens).toEqual({ type: 'array', items: { type: 'string', enum: ['a', 'b'] } });
    // النصُّ الواحد بتعداده لا يُمسّ — ليس مصفوفة (وفحصُ المصدر هو ما يمسكه).
    expect(fixed.components.schemas.BadDto.properties.tags).toEqual({ type: 'string', enum: ['a', 'b'] });
    const moved = arrayEnumsInItems({ components: { schemas: { X: { properties: { xs: { type: 'array', enum: ['p'], items: { type: 'string' } } } } } } } as never);
    // عناصرُ بلا تعداد ⟵ يُنقل إليها.
    expect((moved as unknown as { components: { schemas: { X: { properties: { xs: unknown } } } } }).components.schemas.X.properties.xs).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['p'] },
    });
    expect(arrayShapeProblems(fixed as never, [lines('\n')]).problems).toEqual([
      'حقلُ مصفوفةٍ موصوفٌ غيرَ مصفوفة: GoodDto.missing (Array<string>) ⟵ null',
      'حقلُ مصفوفةٍ موصوفٌ غيرَ مصفوفة: BadDto.tags (string[]) ⟵ {"type":"string","enum":["a","b"]}',
    ]);
  });

  it('ونهاياتُ الأسطر لا تغيّر الحكم (`§8.7` الوجه الخامس عشر)', () => {
    expect(arrayShapeProblems(doc, [lines('\r\n')])).toEqual(arrayShapeProblems(doc, [lines('\n')]));
  });

  it('ومصدرٌ بلا صنفٍ له مخطَّط يعيد صفراً مقروءاً — والسكربتُ يُسقط الصفرَ بدل أن يشهد به', () => {
    expect(arrayShapeProblems(doc, [['export class Other {', '  xs?: string[];', '}'].join('\n')])).toEqual({ problems: [], arrays: 0 });
  });
});
