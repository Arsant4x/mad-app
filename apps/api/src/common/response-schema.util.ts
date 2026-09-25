import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * ⚖️ **حارسُ صدق الردود — ما يُعلَن يُطابَق بما يُرسَل فعلاً** (`ق-١٤٣٨` · خطّةُ الأنواع ④ البند ٣ · الخيار «أ»).
 *
 * صنفُ الردّ المعلَن في الوثيقة **وثيقةٌ تتخلّف عن الشيفرة** إن لم يُطابَق بردٍّ حيّ (عائلةُ `§8.5`: «مكتوبة» ليست «تعمل»).
 * وكان هذا بعينه عيبَ `PosSaleResponse` في الواجهة: **خمسةُ حقولٍ إلزامية لا يعيدها** الخادم، ولم يشكُ شيء.
 * فالمخطَّطُ هنا يُقرأ من **الوثيقة المبنيّة** (`nest build` — المُلحَقُ يعمل تحته وحدَه) ويُطابَق بقيمةٍ أرسلها الخادمُ نفسُه.
 *
 * | ما يُفحص | الحكم |
 * |---|---|
 * | حقلٌ **إلزاميٌّ** معلَنٌ ولم يُرسَل | مخالفة — **وهو ما بُني الحارسُ لأجله** |
 * | نوعُ حقلٍ معلَن (نصّ · عدد · منطقيّ · مصفوفة · كائن) | مخالفةٌ إن اختلف |
 * | `null` في حقلٍ لم يُعلَن `nullable` | مخالفة — الواجهةُ تقول «لا فراغ» والخادمُ يرسل فراغاً |
 * | قيمةٌ خارج تعدادها · تاريخٌ لا يُقرأ (`date-time`) | مخالفة |
 * | `$ref` · `allOf` · `oneOf`/`anyOf` (قائمةٌ أو مغلَّفٌ مرقَّم) | تُتبَع |
 *
 * ⚠️ **وحدُّه معلَن**: **الحقلُ الزائد غيرُ المعلَن لا يُعدّ مخالفة** (`additionalProperties` مفتوحة كما في `OpenAPI`) — فالصنفُ يعلن
 * «ما لا يقلّ عنه» الردّ. وما تقرؤه الواجهةُ ولم يُعلَن **يُسقطه `tsc` الواجهة** حين تُستعار الأنواعُ المولَّدة، فلا يمرّ صامتاً.
 * والمالُ نصٌّ كما يُرسَل (`Decimal` ⟵ `"12.50"`) — **وصيغتُه لا يفحصها المخطَّط** (لا `pattern` من المُلحَق).
 */
export interface ResponseSchema {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: ResponseSchema;
  properties?: Record<string, ResponseSchema>;
  required?: string[];
  additionalProperties?: boolean | ResponseSchema;
  nullable?: boolean;
  allOf?: ResponseSchema[];
  oneOf?: ResponseSchema[];
  anyOf?: ResponseSchema[];
}

const REF_PREFIX = '#/components/schemas/';

/** سقفُ المخالفات المطبوعة لقيمةٍ واحدة — مصفوفةٌ بألف صفٍّ خاطئ لا تُغرق السجلّ (والعددُ الكامل يُذكر). */
export const MAX_VIOLATIONS = 40;

function resolve(schema: ResponseSchema, schemas: Record<string, ResponseSchema>): ResponseSchema | null {
  if (!schema.$ref) return schema;
  if (!schema.$ref.startsWith(REF_PREFIX)) return null;
  return schemas[schema.$ref.slice(REF_PREFIX.length)] ?? null;
}

const describe = (value: unknown): string => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

/**
 * مخالفاتُ قيمةٍ لمخطّطها — **قائمةٌ فارغة حين تطابق**. كلُّ مخالفةٍ تبدأ بمسارها (`$.lines[0].unitPrice`) فتُقرأ بلا تخمين.
 */
export function schemaViolations(value: unknown, schema: ResponseSchema | undefined, schemas: Record<string, ResponseSchema>, path = '$'): string[] {
  if (!schema) return [];
  // الفراغُ يُحكم عليه قبل تتبّع المرجع: المُلحَقُ يلفّ المرجعَ القابلَ للفراغ بـ`allOf` ويضع `nullable` على الغلاف.
  if (value === null) return schema.nullable ? [] : [`${path}: null والمخطَّطُ لا يعلنه nullable`];
  const resolved = resolve(schema, schemas);
  if (!resolved) return [`${path}: مرجعٌ لا يوجد في الوثيقة (${schema.$ref})`];
  if (resolved !== schema) return schemaViolations(value, resolved, schemas, path);

  if (schema.allOf?.length) return schema.allOf.flatMap((part) => schemaViolations(value, part, schemas, path));
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives?.length) {
    const tries = alternatives.map((alt) => schemaViolations(value, alt, schemas, path));
    if (tries.some((t) => t.length === 0)) return [];
    const nearest = tries.reduce((a, b) => (b.length < a.length ? b : a));
    return [`${path}: لا يطابق أيّاً من ${alternatives.length} بدائل — أقربُها: ${nearest.slice(0, 3).join(' · ')}`];
  }

  if (schema.enum?.length && !schema.enum.includes(value)) return [`${path}: ${JSON.stringify(value)} خارج التعداد [${schema.enum.join(', ')}]`];

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return [`${path}: متوقَّعٌ نصّ ووصل ${describe(value)}`];
      if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) return [`${path}: تاريخٌ لا يُقرأ «${value}»`];
      return [];
    case 'number':
    case 'integer':
      if (typeof value !== 'number') return [`${path}: متوقَّعٌ عدد ووصل ${describe(value)}`];
      if (schema.type === 'integer' && !Number.isInteger(value)) return [`${path}: متوقَّعٌ عددٌ صحيح ووصل ${value}`];
      return [];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path}: متوقَّعٌ منطقيّ ووصل ${describe(value)}`];
    case 'array': {
      if (!Array.isArray(value)) return [`${path}: متوقَّعةٌ مصفوفة ووصل ${describe(value)}`];
      return value.flatMap((item, i) => schemaViolations(item, schema.items, schemas, `${path}[${i}]`));
    }
    default:
      break;
  }

  if (schema.type === 'object' || schema.properties) {
    if (typeof value !== 'object' || Array.isArray(value)) return [`${path}: متوقَّعٌ كائن ووصل ${describe(value)}`];
    const record = value as Record<string, unknown>;
    const out: string[] = [];
    for (const key of schema.required ?? []) {
      if (!(key in record) || record[key] === undefined) out.push(`${path}.${key}: حقلٌ إلزاميٌّ معلَنٌ لم يُرسَل`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in record && record[key] !== undefined) out.push(...schemaViolations(record[key], sub, schemas, `${path}.${key}`));
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const [key, v] of Object.entries(record)) {
        if (!(key in (schema.properties ?? {}))) out.push(...schemaViolations(v, schema.additionalProperties, schemas, `${path}.${key}`));
      }
    }
    return out;
  }
  return [];
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface OperationLike {
  responses?: Record<string, { content?: Record<string, { schema?: ResponseSchema }> }>;
}

/** ردُّ النجاح لعملية: أدنى رمزٍ `2xx`، ومخطّطُه في `application/json` إن وُجد. `204` ردٌّ بلا جسمٍ أصلاً. */
export function successResponseOf(operation: OperationLike): { status: string; schema: ResponseSchema | null } | null {
  const codes = Object.keys(operation.responses ?? {})
    .filter((c) => /^2\d\d$/.test(c))
    .sort();
  if (codes.length === 0) return null;
  const status = codes[0];
  const schema = operation.responses?.[status]?.content?.['application/json']?.schema ?? null;
  return { status, schema };
}

/** مخطَّطٌ «يعلن شكلاً»: مرجعٌ إلى صنفٍ بخاصيّات · مصفوفةٌ عناصرُها معلَنة · كائنٌ بخاصيّات · نوعٌ أوّليّ · أو بدائلُ كلُّها معلَنة. */
export function declaresShape(schema: ResponseSchema | null | undefined, schemas: Record<string, ResponseSchema>, depth = 0): boolean {
  if (!schema || depth > 8) return false;
  if (schema.$ref) {
    const target = resolve(schema, schemas);
    return !!target && declaresShape(target, schemas, depth + 1);
  }
  const parts = schema.allOf ?? schema.oneOf ?? schema.anyOf;
  if (parts?.length) return parts.every((p) => declaresShape(p, schemas, depth + 1));
  if (schema.type === 'array') return declaresShape(schema.items, schemas, depth + 1);
  if (schema.type === 'string' || schema.type === 'number' || schema.type === 'integer' || schema.type === 'boolean') return true;
  return !!schema.properties && Object.keys(schema.properties).length > 0;
}

/**
 * ⚖️ **عملياتٌ بلا مخطَّطِ ردٍّ يعلن شكلاً** — مادّةُ المِسنَن `docs/openapi-untyped-responses.json` (خطّةُ الأنواع ④ البند ١).
 * **وردُّ `204` لا جسمَ له فلا يُعدّ** — لا شكلَ يُعلَن لما لا يُرسَل.
 */
export function untypedResponseOperations(doc: OpenAPIObject): string[] {
  const schemas = (doc.components?.schemas ?? {}) as Record<string, ResponseSchema>;
  const out: string[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of METHODS) {
      const operation = (item as Record<string, OperationLike | undefined>)[method];
      if (!operation) continue;
      const success = successResponseOf(operation);
      if (success?.status === '204') continue;
      if (!success || !declaresShape(success.schema, schemas)) out.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return out.sort();
}
