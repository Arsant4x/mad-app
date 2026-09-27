import type { OpenAPIObject } from '@nestjs/swagger';
import { declaresShape, ResponseSchema, schemaViolations, successResponseOf, untypedResponseOperations } from './response-schema.util';

/**
 * المسبارُ يُصادَق بحالتين لكلِّ قاعدة (`§8.7` الوجه الحادي عشر · [[feedback-validate-the-probe]]): حالةٌ **يجب أن تمرّ** وأخرى
 * **يجب أن تُسقط** — وإلا فصفرُ المخالفات في الحارس الحيّ عمى لا صدق.
 */
const SCHEMAS: Record<string, ResponseSchema> = {
  Line: { type: 'object', properties: { description: { type: 'string' }, quantity: { type: 'string' } }, required: ['description', 'quantity'] },
  Sale: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: ['DUE', 'PAID'] },
      total: { type: 'string' },
      customerId: { type: 'string', nullable: true },
      lines: { type: 'array', items: { $ref: '#/components/schemas/Line' } },
      customer: { allOf: [{ $ref: '#/components/schemas/Customer' }], nullable: true },
      issuedAt: { type: 'string', format: 'date-time' },
      count: { type: 'integer' },
      voided: { type: 'boolean' },
    },
    required: ['id', 'status', 'total', 'customerId', 'lines', 'issuedAt', 'count', 'voided'],
  },
  Customer: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  PagedSale: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Sale' } }, total: { type: 'number' } }, required: ['items', 'total'] },
};
const SALE: ResponseSchema = { $ref: '#/components/schemas/Sale' };
const good = () => ({
  id: 's1',
  status: 'PAID',
  total: '12.50',
  customerId: null,
  lines: [{ description: 'قهوة', quantity: '1.000' }],
  customer: null,
  issuedAt: '2026-09-25T01:00:00.000Z',
  count: 2,
  voided: false,
  extra: 'غيرُ معلَنٍ ولا يُعدّ',
});

describe('حارسُ صدق الردود — المطابقةُ نفسُها مُصادَقةٌ بالحالتين (ق-١٤٣٨)', () => {
  it('ردٌّ يطابق مخطّطه — صفرُ مخالفات، والحقلُ الزائد لا يُعدّ (حدٌّ معلَن)', () => {
    expect(schemaViolations(good(), SALE, SCHEMAS)).toEqual([]);
  });

  it('⭐ حقلٌ إلزاميٌّ معلَنٌ لم يُرسَل — يُسمّى بمساره (عيبُ «خمسة الحقول» بعينه)', () => {
    const { total: _omit, ...sale } = good();
    expect(schemaViolations(sale, SALE, SCHEMAS)).toEqual(['$.total: حقلٌ إلزاميٌّ معلَنٌ لم يُرسَل']);
  });

  it('نوعٌ مخالف — عددٌ حيث المالُ نصّ', () => {
    expect(schemaViolations({ ...good(), total: 12.5 }, SALE, SCHEMAS)).toEqual(['$.total: متوقَّعٌ نصّ ووصل number']);
  });

  it('null في حقلٍ لا يعلنه nullable يُسقط — وفي المعلَن يمرّ، ومنه المرجعُ الملفوف بـallOf', () => {
    expect(schemaViolations({ ...good(), status: null }, SALE, SCHEMAS)).toEqual(['$.status: null والمخطَّطُ لا يعلنه nullable']);
    expect(schemaViolations({ ...good(), customerId: null, customer: null }, SALE, SCHEMAS)).toEqual([]);
  });

  it('المرجعُ يُتبَع — وحقلٌ غائبٌ في عنصر مصفوفةٍ يُسمّى بموضعه', () => {
    expect(schemaViolations({ ...good(), customer: { name: 'زبون' } }, SALE, SCHEMAS)).toEqual([]);
    expect(schemaViolations({ ...good(), customer: {} }, SALE, SCHEMAS)).toEqual(['$.customer.name: حقلٌ إلزاميٌّ معلَنٌ لم يُرسَل']);
    expect(schemaViolations({ ...good(), lines: [{ description: 'قهوة' }] }, SALE, SCHEMAS)).toEqual(['$.lines[0].quantity: حقلٌ إلزاميٌّ معلَنٌ لم يُرسَل']);
  });

  it('التعدادُ والتاريخُ والصحيحُ والمنطقيّ — كلٌّ بسببه', () => {
    expect(schemaViolations({ ...good(), status: 'OPEN' }, SALE, SCHEMAS)).toEqual(['$.status: "OPEN" خارج التعداد [DUE, PAID]']);
    expect(schemaViolations({ ...good(), issuedAt: 'أمس' }, SALE, SCHEMAS)).toEqual(['$.issuedAt: تاريخٌ لا يُقرأ «أمس»']);
    expect(schemaViolations({ ...good(), count: 1.5 }, SALE, SCHEMAS)).toEqual(['$.count: متوقَّعٌ عددٌ صحيح ووصل 1.5']);
    expect(schemaViolations({ ...good(), voided: 'no' }, SALE, SCHEMAS)).toEqual(['$.voided: متوقَّعٌ منطقيّ ووصل string']);
  });

  it('القائمةُ أو المغلَّفُ المرقَّم (oneOf) — كلاهما يمرّ، وما لا يطابق أيّاً يُسقط', () => {
    const list: ResponseSchema = { oneOf: [{ type: 'array', items: SALE }, { $ref: '#/components/schemas/PagedSale' }] };
    expect(schemaViolations([good()], list, SCHEMAS)).toEqual([]);
    expect(schemaViolations({ items: [good()], total: 1 }, list, SCHEMAS)).toEqual([]);
    const bad = schemaViolations({ items: [good()] }, list, SCHEMAS);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('لا يطابق أيّاً من 2 بدائل');
  });

  it('مرجعٌ لا يوجد في الوثيقة يُسمّى — لا يمرّ صامتاً', () => {
    expect(schemaViolations({}, { $ref: '#/components/schemas/Ghost' }, SCHEMAS)).toEqual(['$: مرجعٌ لا يوجد في الوثيقة (#/components/schemas/Ghost)']);
  });
});

describe('مِسنَنُ الردود — ما «يعلن شكلاً» وما لا يعلنه (خطّةُ الأنواع ④ البند ١)', () => {
  const doc = {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: {
      '/v1/sales': {
        get: { responses: { '200': { description: '', content: { 'application/json': { schema: { type: 'array', items: SALE } } } } } },
        post: { responses: { '201': { description: '' } } },
      },
      '/v1/sales/{id}': {
        get: { responses: { '200': { description: '', content: { 'application/json': { schema: { type: 'object' } } } } } },
        delete: { responses: { '204': { description: '' } } },
      },
      '/v1/ping': { get: { responses: { '200': { description: '', content: { 'application/json': { schema: { type: 'string' } } } } } } },
    },
    components: { schemas: SCHEMAS },
  } as unknown as OpenAPIObject;

  it('⭐ بلا محتوى أو بكائنٍ بلا خاصيّات ⟵ غيرُ معلَن · المصفوفةُ المعلَنةُ والنوعُ الأوّليّ معلَنان · و204 لا يُعدّ', () => {
    expect(untypedResponseOperations(doc)).toEqual(['GET /v1/sales/{id}', 'POST /v1/sales']);
  });

  it('ق-١٥٠٦ ردُّ الملف بنوعٍ واحدٍ غيرِ JSON يُقرأ مخطّطُه منه — وبلا مخطّطٍ أو بنوعين بلا JSON يبقى غيرَ معلَن', () => {
    const xmlString = { responses: { '200': { content: { 'application/xml': { schema: { type: 'string' } } } } } };
    expect(successResponseOf(xmlString)?.schema).toEqual({ type: 'string' });
    expect(declaresShape(successResponseOf(xmlString)?.schema, SCHEMAS)).toBe(true);
    expect(successResponseOf({ responses: { '200': { content: { 'application/xml': {} } } } })?.schema).toBeNull();
    const twoTypes = { responses: { '200': { content: { 'application/xml': { schema: { type: 'string' } }, 'text/csv': { schema: { type: 'string' } } } } } };
    expect(successResponseOf(twoTypes)?.schema).toBeNull();
    // و`application/json` يسبق غيرَه حين يوجد معه.
    const both = { responses: { '200': { content: { 'text/csv': { schema: { type: 'string' } }, 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } } } };
    expect(successResponseOf(both)?.schema).toEqual({ $ref: '#/components/schemas/Customer' });
  });

  it('ردُّ النجاح أدنى رمزٍ 2xx — والمرجعُ إلى صنفٍ بلا خاصيّات لا يعلن شكلاً', () => {
    expect(successResponseOf({ responses: { '404': {}, '201': {}, '200': {} } })?.status).toBe('200');
    expect(successResponseOf({ responses: { '404': {} } })).toBeNull();
    expect(declaresShape({ $ref: '#/components/schemas/Empty' }, { Empty: { type: 'object', properties: {} } })).toBe(false);
    expect(declaresShape({ $ref: '#/components/schemas/Customer' }, SCHEMAS)).toBe(true);
  });
});
