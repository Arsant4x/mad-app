import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * **عقدُ الواجهة البرمجية كما يراه مستهلكٌ خارجيّ** (`ق-١٢٩١` · ي/⑫A2).
 *
 * لا تُقارَن الوثيقةُ كلُّها — فهي تتغيّر بترتيب المفاتيح ووصفٍ يُحرَّر، فيصير الحارسُ
 * ضجيجاً يُعطَّل (`ق-٦٥`). **بل يُستخرج منها ما يكسر المستهلكَ إن تغيّر**:
 *
 * | ما يُلتقط | لماذا |
 * |---|---|
 * | `METHOD path` | حذفُ مسارٍ أو فعلٍ يكسر كلَّ من يناديه |
 * | وسائطُ المسار والاستعلام (`in:name`) وإلزامُها | حذفُ وسيطٍ يكسر، وجعلُه إلزامياً يكسر |
 * | رموزُ الردّ | مستهلكٌ يفرّع على `404` ينكسر إن زالت |
 * | الحقولُ **الإلزامية** في الجسم | إضافةُ إلزاميٍّ تكسر من يرسل ما كان يكفي |
 *
 * **والمقارنةُ باتجاهٍ واحد**: الحذفُ والتغييرُ يُسقطان، **والإضافةُ تمرّ** — فمسارٌ
 * جديد أو حقلٌ اختياريّ جديد لا يكسر أحداً.
 *
 * ⚠️ **وحدٌّ معلَنٌ بقياس**: لا `@ApiProperty` في المستودع (`0` ملفّاً) ولا مُلحَق
 * `@nestjs/swagger` في `nest-cli.json` — **فأشكالُ الأجسام غيرُ موصوفةٍ في الوثيقة**،
 * ويبقى `requiredBody` فارغاً حتى تُوصَف. **واللقطةُ تلتقط ما يوجد، لا ما نتمنّاه.**
 */
export interface OperationContract {
  parameters: string[];
  requiredBody: string[];
  responses: string[];
}

export type ApiContract = Record<string, OperationContract>;

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

/** الحقولُ الإلزامية في جسم الطلب — من المخطَّط المضمَّن أو المُشار إليه في `components`. */
function requiredBodyOf(operation: Record<string, unknown>, doc: OpenAPIObject): string[] {
  const body = operation.requestBody as { content?: Record<string, { schema?: Record<string, unknown> }> } | undefined;
  const schema = body?.content?.['application/json']?.schema;
  if (!schema) return [];
  let resolved = schema;
  const ref = schema.$ref as string | undefined;
  if (ref) {
    const name = ref.split('/').pop() as string;
    const found = (doc.components?.schemas ?? {})[name] as Record<string, unknown> | undefined;
    if (!found) return [];
    resolved = found;
  }
  const required = resolved.required as string[] | undefined;
  return [...(required ?? [])].sort();
}

/** ملخّصُ العقد من وثيقةٍ مولَّدة — **مفاتيحُه مرتَّبة** فلا يتغيّر الملفّ بترتيبٍ عابر. */
export function contractOf(doc: OpenAPIObject): ApiContract {
  const out: ApiContract = {};
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of METHODS) {
      const operation = (item as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
      if (!operation) continue;
      const params = (operation.parameters ?? []) as { in?: string; name?: string; required?: boolean }[];
      out[`${method.toUpperCase()} ${path}`] = {
        parameters: params.map((p) => `${p.in}:${p.name}${p.required ? ':required' : ''}`).sort(),
        requiredBody: requiredBodyOf(operation, doc),
        responses: Object.keys(operation.responses ?? {}).sort(),
      };
    }
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

const nameOf = (p: string) => p.split(':').slice(0, 2).join(':');
const isRequired = (p: string) => p.endsWith(':required');

/**
 * ما يكسر المستهلكَ بين لقطةٍ وحالٍ — **باتجاهٍ واحد**.
 * تُعاد قائمةٌ فارغة حين لا يكسر شيء، مهما أُضيف.
 */
export function contractBreaks(snapshot: ApiContract, current: ApiContract): string[] {
  const breaks: string[] = [];
  for (const [key, was] of Object.entries(snapshot)) {
    const now = current[key];
    if (!now) {
      breaks.push(`حُذف: ${key}`);
      continue;
    }
    const nowByName = new Map(now.parameters.map((p) => [nameOf(p), p]));
    for (const p of was.parameters) {
      const present = nowByName.get(nameOf(p));
      if (!present) breaks.push(`وسيطٌ حُذف: ${key} ⟵ ${nameOf(p)}`);
      else if (!isRequired(p) && isRequired(present)) breaks.push(`وسيطٌ صار إلزامياً: ${key} ⟵ ${nameOf(p)}`);
    }
    for (const code of was.responses) {
      if (!now.responses.includes(code)) breaks.push(`رمزُ ردٍّ حُذف: ${key} ⟵ ${code}`);
    }
    for (const field of now.requiredBody) {
      if (!was.requiredBody.includes(field)) breaks.push(`حقلٌ صار إلزامياً: ${key} ⟵ ${field}`);
    }
  }
  return breaks;
}
