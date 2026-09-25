import type { OpenAPIObject } from '@nestjs/swagger';
import { COUNTRY_MARKERS } from './country-literals.util';

/**
 * ⚖️ **خطّةُ الأنواع ③ — أجسامُ الطلب ووسائطُ الاستعلام مولَّدةٌ من وثيقة الواجهة لا مكتوبةٌ مرّتين** (`ق-١٤٠٤` · الخطّة
 * `docs/plans/shared-types-plan.md` §③ · المسح `26`).
 *
 * **المصدرُ الوثيقةُ المبنيّة** (`buildOpenApiDocument` بعد `nest build` — مُلحَقُ الواجهة يعمل تحته وحدَه، `ق-١٢٩٩`)، **فالمولَّدُ هو ما يقبله
 * الخادمُ فعلاً**: كلُّ صنفٍ يشير إليه جسمُ طلبٍ بـ`application/json` (وما يشير إليه هو بالتعدّي) يُرسَم واجهةً باسم صنفه، وكلُّ عمليةٍ
 * لها وسائطُ استعلامٍ تُرسَم واجهةً باسم متحكّمها وتابعها (`ReportsController_aging` ⟵ `ReportsAgingQuery`).
 *
 * **والملفّان مشتقّان لا مسرودان** — كالتعدادات (`shared-enums.util.ts`): تصريحٌ تحمل شيفرتُه علامةً سعودية (`COUNTRY_MARKERS`)، أو يشير
 * إلى تصريحٍ يحملها، يُكتب في ملفّ الوحدة؛ والباقي في `requests.ts`.
 *
 * **والحارسُ خطوةُ `openapi:check` نفسُها** (`scripts/openapi-snapshot.ts`): تعيد الرسمَ من الوثيقة وتقارن حرفاً وتُسقط إن اختلف — وهي تبني
 * أصلاً، وتعمل في كلِّ دفعٍ (`web-tests-light`).
 *
 * ⚠️ **وحدُّه معلَن**: يرسم **ما تعلنه الوثيقة** — فما لا يعبّر عنه الصنفُ (اتّحادُ «ربعٌ أو شهر» · قيمةٌ فارغةٌ تقبلها الواجهةُ ويرفضها التعداد) يبقى
 * بيد الواجهة **فوق** المولَّد لا بدلَه؛ والقيودُ العددية (`minimum`) والصيغ لا تصير أنواعاً. والردودُ ليست هنا (الخطوة ④).
 */
/** والملفّان `packages/shared/src/api/requests.ts` و`${SAUDI_UNIT_PATH_MARK}-requests.ts` — يحسب السكربتُ مساريهما من موضعه (لا من `dist`). */
export const REGENERATE_REQUESTS_COMMAND = 'npm run openapi:snapshot  (من apps/api)';

interface JsonSchema {
  $ref?: string;
  type?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  nullable?: boolean;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
}

interface Operation {
  operationId?: string;
  parameters?: { name: string; in: string; required?: boolean; schema?: JsonSchema }[];
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
}

const REF_PREFIX = '#/components/schemas/';
const refName = (ref: string) => ref.slice(REF_PREFIX.length);
const IDENT = /^[A-Za-z_$][\w$]*$/;
const propKey = (k: string) => (IDENT.test(k) ? k : `'${k.replace(/'/g, "\\'")}'`);
const literal = (v: unknown) => (typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v));

/** نوعُ `TypeScript` لمخطّطٍ واحد — بما تعلنه الوثيقةُ وحدَه. */
export function tsOf(s: JsonSchema | undefined): string {
  if (!s) return 'unknown';
  let t: string;
  if (s.$ref) t = refName(s.$ref);
  else if (s.allOf?.length) t = s.allOf.map((x) => tsOf(x)).join(' & ');
  else if (s.oneOf?.length || s.anyOf?.length) t = (s.oneOf ?? s.anyOf)!.map((x) => tsOf(x)).join(' | ');
  else if (s.enum?.length) t = s.enum.map(literal).join(' | ');
  else if (s.type === 'string') t = 'string';
  else if (s.type === 'number' || s.type === 'integer') t = 'number';
  else if (s.type === 'boolean') t = 'boolean';
  else if (s.type === 'array') {
    const inner = tsOf(s.items);
    t = /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
  } else if (s.type === 'object' && s.properties) t = `{ ${fieldsOf(s).join(' ')} }`;
  else if (s.type === 'object' && s.additionalProperties && typeof s.additionalProperties === 'object') t = `Record<string, ${tsOf(s.additionalProperties)}>`;
  else if (s.type === 'object') t = 'Record<string, unknown>';
  else t = 'unknown';
  return s.nullable ? `${t} | null` : t;
}

function fieldsOf(s: JsonSchema): string[] {
  const required = new Set(s.required ?? []);
  return Object.entries(s.properties ?? {}).map(([k, v]) => `${propKey(k)}${required.has(k) ? '' : '?'}: ${tsOf(v)};`);
}

/** أسماءُ الأصناف في مخطّط — لإغلاق التعدّي ولتوجيه ما يشير إلى الوحدة. */
function refsIn(s: JsonSchema | undefined, out = new Set<string>()): Set<string> {
  if (!s) return out;
  if (s.$ref) out.add(refName(s.$ref));
  for (const x of [...(s.allOf ?? []), ...(s.oneOf ?? []), ...(s.anyOf ?? [])]) refsIn(x, out);
  if (s.items) refsIn(s.items, out);
  for (const v of Object.values(s.properties ?? {})) refsIn(v, out);
  if (s.additionalProperties && typeof s.additionalProperties === 'object') refsIn(s.additionalProperties, out);
  return out;
}

const operationsOf = (doc: OpenAPIObject): Operation[] =>
  Object.values(doc.paths ?? {}).flatMap((item) => Object.values(item as Record<string, Operation>).filter((op) => op && typeof op === 'object'));

/** `ReportsController_aging` ⟵ `ReportsAgingQuery` — والمعرّفاتُ فريدةٌ بحارس ① فالأسماءُ فريدة. */
export function queryTypeName(operationId: string): string {
  const [controller, method = ''] = operationId.split('_');
  return `${controller.replace(/Controller$/, '')}${method.charAt(0).toUpperCase()}${method.slice(1)}Query`;
}

interface Declaration {
  name: string;
  text: string;
  refs: Set<string>;
  saudi: boolean;
}

function declarationOf(name: string, schema: JsonSchema, comment: string): Declaration {
  const body = fieldsOf(schema).map((f) => `  ${f}`);
  const text = [`/** ${comment} */`, `export interface ${name} {`, ...body, '}'].join('\n');
  const codeLines = text.split('\n').filter((l) => !l.startsWith('/**'));
  return { name, text, refs: refsIn(schema), saudi: COUNTRY_MARKERS.some((m) => codeLines.some((l) => m.re.test(l))) };
}

export interface RenderedRequests {
  general: string;
  unit: string;
  bodies: number;
  queries: number;
  unitNames: string[];
}

/** يرسم الملفّين من الوثيقة — والحارسُ يرسم بالدالّة نفسِها ويقارن. */
export function renderSharedRequests(doc: OpenAPIObject): RenderedRequests {
  const schemas = (doc.components?.schemas ?? {}) as Record<string, JsonSchema>;
  const ops = operationsOf(doc);

  // ① أجسامُ الطلب (JSON) وما تشير إليه بالتعدّي.
  const bodyNames = new Set<string>();
  const queue: string[] = [];
  for (const op of ops) {
    const schema = op.requestBody?.content?.['application/json']?.schema;
    for (const n of refsIn(schema)) queue.push(n);
  }
  while (queue.length) {
    const n = queue.pop()!;
    if (bodyNames.has(n) || !schemas[n]) continue;
    bodyNames.add(n);
    for (const r of refsIn(schemas[n])) queue.push(r);
  }
  const decls: Declaration[] = [...bodyNames].sort((a, b) => a.localeCompare(b, 'en')).map((n) => declarationOf(n, schemas[n], `جسمُ طلب — \`${n}\` في الخادم.`));

  // ② وسائطُ الاستعلام لكلِّ عمليةٍ تعلنها.
  const queries = ops
    .filter((op) => op.operationId && (op.parameters ?? []).some((p) => p.in === 'query'))
    .map((op) => {
      const params = (op.parameters ?? []).filter((p) => p.in === 'query');
      const schema: JsonSchema = {
        type: 'object',
        properties: Object.fromEntries(params.map((p) => [p.name, p.schema ?? {}])),
        required: params.filter((p) => p.required).map((p) => p.name),
      };
      return declarationOf(queryTypeName(op.operationId!), schema, `وسائطُ استعلام \`${op.operationId}\`.`);
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const names = [...decls, ...queries].map((d) => d.name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) throw new Error(`أسماءٌ مكرَّرة في المولَّد: ${[...new Set(dup)].join(' · ')}`);
  const all = [...decls, ...queries];

  // ③ الوحدةُ: ما يحمل علامةً، وما يشير إليه بالتعدّي — فلا يستورد العامُّ من ملفّ الوحدة اسماً يحمل علامتها.
  const unitSet = new Set(all.filter((d) => d.saudi).map((d) => d.name));
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of all) {
      if (!unitSet.has(d.name) && [...d.refs].some((r) => unitSet.has(r))) {
        unitSet.add(d.name);
        grew = true;
      }
    }
  }
  const general = all.filter((d) => !unitSet.has(d.name));
  const unit = all.filter((d) => unitSet.has(d.name));
  const unitImports = [...new Set(unit.flatMap((d) => [...d.refs]).filter((r) => !unitSet.has(r)))].sort((a, b) => a.localeCompare(b, 'en'));

  const header = (what: string) => [
    '// ⛔ مولَّدٌ — لا يُحرَّر بيد.',
    `// المصدرُ: وثيقةُ الواجهة المبنيّة (buildOpenApiDocument بعد nest build) — ${what}`,
    `// يُعاد توليدُه بـ: ${REGENERATE_REQUESTS_COMMAND}`,
    '// والحارسُ خطوةُ openapi:check نفسُها (scripts/openapi-snapshot.ts) — تعيد الرسمَ وتُسقط إن اختلف.',
    '',
  ];
  const generalText = [...header('أجسامُ الطلب ووسائطُ الاستعلام (ق-١٤٠٤).'), general.map((d) => d.text).join('\n\n'), ''].join('\n');
  const unitText = [
    ...header('ما يحمل علامةً سعوديةً منها أو يشير إليها (ق-١٣٥٠: حدُّ الوحدة بالاسم).'),
    ...(unitImports.length ? [`import type { ${unitImports.join(', ')} } from './requests';`, ''] : []),
    unit.length ? unit.map((d) => d.text).join('\n\n') : 'export {};',
    '',
  ].join('\n');
  return { general: generalText, unit: unitText, bodies: decls.length, queries: queries.length, unitNames: unit.map((d) => d.name) };
}
