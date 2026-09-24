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
 * ⚠️ **وحدٌّ معلَنٌ بقياس** (صُحّح `ق-١٣٦٩` — كان يقول «ولا مُلحَق» والمُلحَقُ مضبوط): لا `@ApiProperty`
 * في الشيفرة، **لكنّ مُلحَق `@nestjs/swagger` مضبوطٌ في `nest-cli.json`** (`classValidatorShim` · اللاحقة
 * `.dto.ts`) **ويعمل تحت `nest build` وحدَه** — فأجسامُ `DTO`ات تلك اللاحقة موصوفةٌ ومنها `requiredBody`
 * (اللقطة: `200` عمليةٍ بـ`448` حقلاً إلزامياً من `716`). **وما لا يُوصف**: الردود (لا عمليةَ بمخطّطِ ردٍّ
 * بحقول) و`DTO`اتٌ معرَّفةٌ خارج اللاحقة (ستّةُ مخطّطات طلبٍ فارغة — المسح `26` ج).
 * **واللقطةُ تلتقط ما يوجد، لا ما نتمنّاه.**
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

/**
 * اسمُ مخطَّطِ جسمٍ **بلا خاصيّة** — أو `null` إن حمل خاصيّةً أو لا جسمَ أصلاً. يتبع `$ref` إلى `components`،
 * ومخطَّطٌ مضمَّنٌ بلا خاصيّة يُسمّى «مضمَّن».
 */
function emptyRequestSchema(operation: Record<string, unknown>, doc: OpenAPIObject): string | null {
  const body = operation.requestBody as { content?: Record<string, { schema?: Record<string, unknown> }> } | undefined;
  const schema = body?.content?.['application/json']?.schema;
  if (!schema) return null;
  const ref = schema.$ref as string | undefined;
  const name = ref ? (ref.split('/').pop() as string) : 'مضمَّن';
  const resolved = ref ? ((doc.components?.schemas ?? {})[name] as Record<string, unknown> | undefined) : schema;
  if (!resolved) return name;
  if (resolved.allOf || resolved.oneOf || resolved.anyOf || resolved.items) return null;
  const properties = resolved.properties as Record<string, unknown> | undefined;
  return properties && Object.keys(properties).length > 0 ? null : name;
}

/**
 * ⚖️ **شكلُ الوثيقة نفسِها — لا عقدُها** (`ق-١٣٨٢` · خطّةُ الأنواع ①): ما يجعل الوثيقةَ صالحةً لمولِّد.
 *
 * | ما يُفحص | لماذا |
 * |---|---|
 * | كلُّ مسارٍ يبدأ بـ`/<الإصدار>/` | البابُ المحايد مخدومٌ لا موثَّق — ودخولُه الوثيقةَ يعيد كلَّ نوعٍ مرّتين |
 * | كلُّ `operationId` فريد | مولِّدٌ مفهرسٌ بالمعرّف **يتصادم أو يطمس** — والمواصفةُ تشترط الفرادة |
 * | كلُّ مخطَّطِ طلبٍ يحمل خاصيّة (`ق-١٣٨٣` · ②) | صنفٌ خارج لاحقة `.dto.ts` يُولَّد **جسماً `{}`** — فتضيع حقولُه الإلزامية من الوثيقة والمولَّد |
 *
 * تُعاد قائمةٌ فارغة حين تصلح. **والسكربتُ يرفض الكتابةَ والفحصَ معاً** إن لم تكن فارغة — فلقطةٌ من وثيقةٍ
 * معطوبة لا تُكتب.
 */
export function documentProblems(doc: OpenAPIObject, prefix: string): string[] {
  const problems: string[] = [];
  const head = `/${prefix}/`;
  const seen = new Map<string, string[]>();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!path.startsWith(head)) problems.push(`مسارٌ خارج الإصدار: ${path}`);
    for (const method of METHODS) {
      const operation = (item as Record<string, unknown>)[method] as { operationId?: string } | undefined;
      if (!operation) continue;
      const key = `${method.toUpperCase()} ${path}`;
      const empty = emptyRequestSchema(operation as Record<string, unknown>, doc);
      if (empty) problems.push(`مخطَّطُ طلبٍ بلا خاصيّة: ${key} ⟵ ${empty}`);
      if (!operation.operationId) {
        problems.push(`عمليةٌ بلا معرّف: ${key}`);
        continue;
      }
      seen.set(operation.operationId, [...(seen.get(operation.operationId) ?? []), key]);
    }
  }
  for (const [id, keys] of seen) {
    if (keys.length > 1) problems.push(`معرّفُ عمليةٍ مكرَّر: ${id} ⟵ ${keys.join(' · ')}`);
  }
  return problems;
}
