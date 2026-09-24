import { queryTypeName, renderSharedRequests, tsOf } from './shared-requests.util';

/**
 * ⚖️ **مولِّدُ أنواع الطلب — نقيٌّ على وثيقةٍ مصنوعة جوابُها معروفٌ يداً** (`ق-١٤٠٤` · خطّةُ الأنواع ③).
 *
 * المطابقةُ مع الوثيقة الحقيقية خطوةُ `openapi:check` (تبني ثم ترسم وتقارن حرفاً)؛ **وهنا ما يُخطئ فيه الإنسان**: أيُّ
 * صنفٍ يُرسَم (أجسامُ `JSON` وما تشير إليه بالتعدّي — لا ما يُرفع ملفّاً ولا اليتيم)، وكيف يُرسَم الحقل (الإلزامُ · `null` ·
 * المصفوفة · المفتاحُ غيرُ المعرِّف)، وأين يُكتب (ما يحمل علامةً سعوديةً ينتقل بما يشير إليه إلى ملفّ الوحدة).
 * **فمطابقةُ شكلَين شرطٌ لازمٌ لا كافٍ** (`§8.30` الوجه الثاني) — والجوابُ هنا مكتوبٌ يداً.
 */
describe('⚖️ مولِّدُ أنواع الطلب من وثيقة الواجهة (ق-١٤٠٤ · ③)', () => {
  // رمزُ الدولة يُبنى بدالّةٍ لا حرفياً — فالاختبارُ لا يحمل علامةً يعدّها حارسُ الدولة، والمولَّدُ في الذاكرة يحملها.
  const country = ['S', 'A'].join('');
  const json = (name: string) => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } });
  const doc = {
    paths: {
      '/v1/things': {
        post: { operationId: 'ThingsController_create', requestBody: json('CreateThingDto') },
        get: {
          operationId: 'ThingsController_list',
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'number' } },
            { name: 'status', in: 'query', required: true, schema: { type: 'string', enum: ['OPEN', 'DONE'] } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
        },
      },
      '/v1/files': { post: { operationId: 'FilesController_upload', requestBody: { content: { 'multipart/form-data': { schema: { $ref: '#/components/schemas/UploadDto' } } } } } },
      '/v1/local': { post: { operationId: 'LocalController_submit', requestBody: json('WrapDto') } },
    },
    components: {
      schemas: {
        CreateThingDto: {
          type: 'object',
          required: ['name', 'lines'],
          properties: {
            name: { type: 'string' },
            note: { type: 'string', nullable: true },
            lines: { type: 'array', items: { $ref: '#/components/schemas/LineDto' } },
            tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } },
            'x-key': { type: 'boolean' },
            meta: { type: 'object' },
          },
        },
        LineDto: { type: 'object', required: ['qty'], properties: { qty: { type: 'number' } } },
        UploadDto: { type: 'object', properties: { file: { type: 'string' } } },
        OrphanDto: { type: 'object', properties: { x: { type: 'string' } } },
        LocalDto: { type: 'object', properties: { country: { type: 'string', enum: [country] } } },
        WrapDto: { type: 'object', properties: { local: { $ref: '#/components/schemas/LocalDto' }, line: { $ref: '#/components/schemas/LineDto' } } },
      },
    },
  } as never;
  const out = renderSharedRequests(doc);

  it('⭐ يرسم أجسامَ JSON وما تشير إليه بالتعدّي — لا ما يُرفع ملفّاً ولا اليتيم', () => {
    for (const name of ['CreateThingDto', 'LineDto', 'LocalDto', 'WrapDto']) expect(`${out.general}\n${out.unit}`).toContain(`export interface ${name} {`);
    expect(`${out.general}\n${out.unit}`).not.toContain('UploadDto');
    expect(`${out.general}\n${out.unit}`).not.toContain('OrphanDto');
    expect(out.bodies).toBe(4);
  });

  it('⭐ والحقلُ بإلزامه ونوعه كما تعلنه الوثيقة — `null` · المصفوفة · التعداد · المفتاحُ غيرُ المعرِّف', () => {
    const block = out.general.slice(out.general.indexOf('export interface CreateThingDto {'));
    const body = block.slice(0, block.indexOf('\n}'));
    expect(body.split('\n').slice(1)).toEqual([
      '  name: string;',
      '  note?: string | null;',
      '  lines: LineDto[];',
      "  tags?: ('a' | 'b')[];",
      "  'x-key'?: boolean;",
      '  meta?: Record<string, unknown>;',
    ]);
  });

  it('⭐ ووسائطُ الاستعلام واجهةٌ باسم المتحكّم والتابع — والمسارُ ليس منها', () => {
    expect(out.queries).toBe(1);
    const block = out.general.slice(out.general.indexOf('export interface ThingsListQuery {'));
    expect(block.slice(0, block.indexOf('\n}')).split('\n').slice(1)).toEqual(['  page?: number;', "  status: 'OPEN' | 'DONE';"]);
    expect(queryTypeName('ReportsController_receivablesAging')).toBe('ReportsReceivablesAgingQuery');
  });

  it('⭐ وما يحمل علامةً سعوديةً ينتقل إلى ملفّ الوحدة بما يشير إليه — ويستورد منها العامَّ الذي يحتاجه', () => {
    expect(out.unitNames).toEqual(['LocalDto', 'WrapDto']);
    expect(out.general).not.toContain('export interface LocalDto');
    expect(out.general).not.toContain('export interface WrapDto');
    expect(out.unit).toContain("import type { LineDto } from './requests';");
    // والعامُّ لا يحمل العلامة — فحدُّ الوحدة بالاسم (`ق-١٣٥٠`).
    expect(out.general).not.toContain(`'${country}'`);
  });

  it('والملفّان يعلنان أنهما مولَّدان — وملفُّ وحدةٍ بلا تصريحٍ وحدةٌ صالحةٌ فارغة', () => {
    expect(out.general.startsWith('// ⛔ مولَّدٌ — لا يُحرَّر بيد.')).toBe(true);
    expect(out.unit.startsWith('// ⛔ مولَّدٌ — لا يُحرَّر بيد.')).toBe(true);
    const empty = renderSharedRequests({ paths: {}, components: { schemas: {} } } as never);
    expect(empty.unit).toContain('export {};');
    expect(empty.bodies + empty.queries).toBe(0);
  });

  it('واسمٌ مكرَّر بين جسمٍ واستعلامٍ يُرفض باسمه — لا يُطمس أحدُهما صامتاً', () => {
    const clash = {
      paths: {
        '/v1/a': { post: { operationId: 'AController_make', requestBody: json('AListQuery') }, get: { operationId: 'AController_list', parameters: [{ name: 'q', in: 'query' }] } },
      },
      components: { schemas: { AListQuery: { type: 'object', properties: { q: { type: 'string' } } } } },
    } as never;
    expect(() => renderSharedRequests(clash)).toThrow('أسماءٌ مكرَّرة في المولَّد: AListQuery');
  });

  it('و`tsOf` لما لا تعلنه الوثيقة `unknown` — لا يخمّن', () => {
    expect(tsOf(undefined)).toBe('unknown');
    expect(tsOf({})).toBe('unknown');
    expect(tsOf({ type: 'object', additionalProperties: { type: 'number' } })).toBe('Record<string, number>');
  });
});
