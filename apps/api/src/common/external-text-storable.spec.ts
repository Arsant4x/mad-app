import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ⚖️ **حارسٌ مشتقٌّ: كلُّ كتابةِ نصٍّ من جهةٍ خارجية تمرّ بمصدرٍ واحد** (`ق-٩٨٢`/٢).
 *
 * الأعمدةُ التي تحمل نصّاً قادماً من جهةٍ خارجية (جوابُ الهيئة · رسالةُ خطأٍ من `fetch` · معرّفٌ
 * تُعيده الهيئة) **تُعلَن في المخطَّط** بسطر `/// @external-text` فوق الحقل — ومن هناك يُشتقّ هذا
 * الحارس، لا من قائمةٍ تُكتب هنا. ثم يفحص كلَّ كتابةٍ لتلك الأعمدة في `src` (عبر
 * `<model>.create/createMany/update/updateMany/upsert`) ويشترط أن تكون القيمةُ `null` أو نداءَ
 * `storableText(…)`/`storableError(…)` **في موضع الكتابة نفسِه** — فالموضعُ الخامس لا يُنسى،
 * يُسقط الحزمة.
 *
 * ولماذا لا تُنقّى الأعمدةُ كلُّها؟ لأن القياس (`ق-٩٧٩`) فصل صنفين: نصُّ المستخدم عند الحدّ يُردّ
 * بصوت (`500` ولا صفّ) وذاك مقبول (`ق-٩٨١`)؛ ونصُّ الجهة الخارجية يُكتب في الخلفية فيُضيع الردَّ
 * ويسرّب نصَّ `Prisma` إلى صفّ التاجر (`ق-٩٨٢`) — وهذا وحده ما يُنقّى.
 *
 * حدُّه معلَن (`§8.21`: يقرأ الشكلَ لا المعنى): كتابةٌ عبر متغيّرٍ (`lastError: message`) تُسقطه
 * وإن كان المتغيّرُ منقّى — فيُكتب النداءُ في موضع الكتابة؛ وكتابةٌ بنشرٍ (`data: { ...patch }`)
 * لا يراها؛ وكتابةٌ خامٌ بـSQL تُمسَك بفحصٍ ثانٍ على الاسم المقتبَس بين علامتَي تنصيص. والسلاسلُ
 * والتعليقاتُ تُقنَّع قبل المطابقة مع حفظ المواضع (`§8.24` · `ق-٢٧٤`) — فالأمثلةُ في التعليقات لا
 * تُدان، ورقمُ السطر يصدق.
 */

const API_ROOT = join(__dirname, '..', '..');
const SCHEMA_PATH = join(API_ROOT, 'prisma', 'schema.prisma');
const SRC_ROOT = join(API_ROOT, 'src');
export const EXTERNAL_TEXT_MARKER = '/// @external-text';
const STORABLE_CALL = /^storable(Text|Error)\s*\(/;
const WRITE_OPS = ['create', 'createMany', 'update', 'updateMany', 'upsert'] as const;

export interface ExternalTextField {
  model: string;
  field: string;
}

/** يُشتقّ من المخطَّط: كلُّ حقلٍ يسبقه سطرُ الإعلان. */
export function deriveExternalTextFields(schema: string): ExternalTextField[] {
  const lines = schema.split(/\r?\n/);
  const out: ExternalTextField[] = [];
  let model: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = /^model\s+(\w+)\s*\{/.exec(line);
    if (m) {
      model = m[1];
      continue;
    }
    if (line === '}') {
      model = null;
      continue;
    }
    if (line !== EXTERNAL_TEXT_MARKER) continue;
    if (!model) throw new Error(`سطرُ ${EXTERNAL_TEXT_MARKER} خارج أيّ نموذج (السطر ${i + 1})`);
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === '' || lines[j].trim().startsWith('//'))) j++;
    const field = lines[j]?.trim().split(/\s+/)[0];
    if (!field || !/^\w+$/.test(field)) throw new Error(`لا حقلَ بعد ${EXTERNAL_TEXT_MARKER} (السطر ${i + 1})`);
    out.push({ model, field });
  }
  return out;
}

/**
 * حارسُ الاشتقاق: حقلٌ نصّيٌّ يحمل اسمَ حقلٍ معلَن — في نموذجٍ آخر — **بلا إعلان** يُسقط: فإمّا
 * يُعلَن (فيُحرَس) أو يُسمّى غيرَ ذلك. وإلا وُلد عمودٌ خامسٌ باسم الرابع ولم يره أحد.
 */
export function undeclaredNamesakes(schema: string, declared: ExternalTextField[]): ExternalTextField[] {
  const names = new Set(declared.map((d) => d.field));
  const declaredKeys = new Set(declared.map((d) => `${d.model}.${d.field}`));
  const lines = schema.split(/\r?\n/);
  const out: ExternalTextField[] = [];
  let model: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = /^model\s+(\w+)\s*\{/.exec(line);
    if (m) {
      model = m[1];
      continue;
    }
    if (line === '}') {
      model = null;
      continue;
    }
    if (!model || line.startsWith('//') || line.startsWith('@@')) continue;
    const [field, type] = line.split(/\s+/);
    if (field && type && names.has(field) && type.startsWith('String') && !declaredKeys.has(`${model}.${field}`)) {
      out.push({ model, field });
    }
  }
  return out;
}

/** تقنيعُ السلاسل والتعليقات بمسافاتٍ مع حفظ الأطوال والأسطر — فرقمُ السطر بعده يصدق. */
export function maskStringsAndComments(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = source[i];
    const d = source[i + 1];
    if (c === '/' && d === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && source[j] !== c) {
        if (source[j] === '\\') j++;
        j++;
      }
      const stop = Math.min(n, j + 1);
      out += c + blank(source.slice(i + 1, Math.max(i + 1, stop - 1))) + (j < n ? c : '');
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** موضعُ القوس المغلِق المقابل لقوسٍ مفتوح عند `open` — على نصٍّ مقنَّع. */
function matchingClose(text: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [pairs[text[open]]];
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch in pairs) stack.push(pairs[ch]);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

export interface WriteSite {
  line: number;
  accessor: string;
  op: string;
  field: string;
  value: string;
}

export interface ScanResult {
  /** نداءاتُ الكتابة التي فُحصت — عدٌّ يُطبع كي يُعرف أن الحارس قرأ شيئاً. */
  examined: number;
  violations: WriteSite[];
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** يفحص نصَّ ملفٍّ واحد: كلُّ كتابةٍ لحقلٍ معلَن قيمتُها ليست `null` ولا نداءَ `storable*(`. */
export function scanSource(source: string, fields: ExternalTextField[]): ScanResult {
  const masked = maskStringsAndComments(source);
  const byAccessor = new Map<string, string[]>();
  for (const f of fields) {
    const acc = lowerFirst(f.model);
    byAccessor.set(acc, [...(byAccessor.get(acc) ?? []), f.field]);
  }
  const accessors = [...byAccessor.keys()];
  const result: ScanResult = { examined: 0, violations: [] };
  if (accessors.length === 0) return result;
  const call = new RegExp(`\\b(${accessors.join('|')})\\.(${WRITE_OPS.join('|')})\\s*\\(`, 'g');
  const lineOf = (idx: number) => source.slice(0, idx).split('\n').length;
  let m: RegExpExecArray | null;
  while ((m = call.exec(masked)) !== null) {
    const accessor = m[1];
    const op = m[2];
    const open = m.index + m[0].length - 1;
    const close = matchingClose(masked, open);
    result.examined += 1;
    if (close === -1) {
      // نداءٌ لا يستطيع الحارسُ قراءتَه (أقواسٌ غير متوازنة بعد التقنيع) يُدان لا يُتخطّى — فتخطّيه صامتاً
      // يُخفي ما بُني ليراه (كسرٌ لا يُترجم مرّ منه في إثباتٍ بالعكس 2026-09-17 قبل هذا السطر).
      result.violations.push({ line: lineOf(open), accessor, op, field: '*', value: 'نداءٌ لم يُقرأ — أقواسٌ غير متوازنة' });
      continue;
    }
    const args = masked.slice(open + 1, close);
    const keys = op === 'upsert' ? ['create', 'update'] : ['data'];
    for (const key of keys) {
      const blockRe = new RegExp(`\\b${key}\\s*:\\s*([\\[{])`, 'g');
      let b: RegExpExecArray | null;
      while ((b = blockRe.exec(args)) !== null) {
        const bOpen = open + 1 + b.index + b[0].length - 1;
        const bClose = matchingClose(masked, bOpen);
        if (bClose === -1) continue;
        const block = masked.slice(bOpen + 1, bClose);
        for (const field of byAccessor.get(accessor) ?? []) {
          // `field: value` — أو اختصارُ الخاصّية `field,` / `field }` وهو كتابةٌ بمتغيّرٍ يحمل اسمَه.
          const fieldRe = new RegExp(`\\b${field}\\b\\s*(:|(?=[,}\\]]))`, 'g');
          let f: RegExpExecArray | null;
          while ((f = fieldRe.exec(block)) !== null) {
            const at = bOpen + 1 + f.index;
            let value: string;
            if (f[1] === ':') {
              const start = f.index + f[0].length;
              let depth = 0;
              let end = start;
              for (; end < block.length; end++) {
                const ch = block[end];
                if (ch === '(' || ch === '[' || ch === '{') depth++;
                else if (ch === ')' || ch === ']' || ch === '}') {
                  if (depth === 0) break;
                  depth--;
                } else if (ch === ',' && depth === 0) break;
              }
              value = block.slice(start, end).trim();
            } else {
              value = `${field} (اختصارُ خاصّية)`;
            }
            if (value === 'null' || STORABLE_CALL.test(value)) continue;
            result.violations.push({ line: lineOf(at), accessor, op, field, value: value.replace(/\s+/g, ' ').slice(0, 80) });
          }
        }
      }
    }
  }
  return result;
}

/** كتابةٌ خامٌ بـSQL: اسمُ العمود بين علامتَي تنصيص مزدوجتَين — لا يكتبه Prisma، ولا يكتبه إلا SQL. */
export function rawSqlMentions(source: string, fields: ExternalTextField[]): number[] {
  const names = [...new Set(fields.map((f) => f.field))];
  const re = new RegExp(`"(${names.join('|')})"`, 'g');
  const lines: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) lines.push(source.slice(0, m.index).split('\n').length);
  return lines;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.e2e-spec.ts')) out.push(p);
  }
  return out;
}

describe('حارسٌ مشتقّ — كلُّ كتابةِ نصٍّ من جهةٍ خارجية تمرّ بـstorableText/storableError (ق-٩٨٢)', () => {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const fields = deriveExternalTextFields(schema);

  it('يشتقّ الأعمدةَ من المخطَّط — وقد قرأ شيئاً: المفتاحُ المعروف حاضر', () => {
    expect(fields.length).toBeGreaterThanOrEqual(4);
    expect(fields).toContainEqual({ model: 'Invoice', field: 'zatcaMessage' });
    expect(undeclaredNamesakes(schema, fields)).toEqual([]);
  });

  it('يُصادَق بحالتين قبل أن يُصدَّق: يُدين الخامَ ويُجيز المنقّى ويتجاهل الاختيارَ والتعليق', () => {
    const BT = String.fromCharCode(96);
    const fixture = [
      'const a = tx.invoice.update({ where: { id }, data: { zatcaStatus: "X", zatcaMessage: reason.slice(0, 500) } });',
      'const b = tx.invoice.update({ where: { id }, data: { zatcaMessage: storableText(reason) } });',
      'const c = tx.invoice.update({ where: { id }, data: { zatcaMessage: null } });',
      'const d = tx.invoice.findUnique({ where: { id }, select: { zatcaMessage: true } });',
      '// tx.invoice.update({ where: { id }, data: { zatcaMessage: raw } });',
      'const e = tx.zatcaCredential.update({ where: { companyId }, data: { complianceRequestId, status } });',
      'const f = tx.outboxEvent.update({ where: { id }, data: { lastError: message } });',
      `const g = tx.outboxEvent.upsert({ where: { id }, create: { lastError: ${BT}x ${BT} }, update: { lastError: storableError(e) } });`,
      'const h = tx.customer.update({ where: { id }, data: { name: "zatcaMessage: raw" } });',
      'const i = tx.invoice.update({ where: { id }, data: { zatcaMessage: raw } // قوسُ النداء مفقود',
    ].join('\n');
    const fx: ExternalTextField[] = [
      { model: 'Invoice', field: 'zatcaMessage' },
      { model: 'ZatcaCredential', field: 'complianceRequestId' },
      { model: 'OutboxEvent', field: 'lastError' },
    ];
    const r = scanSource(fixture, fx);
    expect(r.examined).toBe(7);
    expect(r.violations.map((v) => `${v.line}:${v.field}`)).toEqual(['1:zatcaMessage', '6:complianceRequestId', '7:lastError', '8:lastError', '10:*']);
    expect(rawSqlMentions('await tx.$executeRaw`UPDATE invoices SET "zatcaMessage" = ${x}`', fx)).toEqual([1]);
    expect(rawSqlMentions('const s = { zatcaMessage: 1 };', fx)).toEqual([]);
  });

  it('لا كتابةَ خامٍ في src — كلُّ موضعٍ يمرّ بالمصدر الواحد، والخامسُ يُسقط الحزمة', () => {
    const files = sourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(50);
    let examined = 0;
    const violations: string[] = [];
    const examinedFiles: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const rel = relative(API_ROOT, file).replace(/\\/g, '/');
      const r = scanSource(source, fields);
      if (r.examined > 0) examinedFiles.push(rel);
      examined += r.examined;
      for (const v of r.violations) violations.push(`${rel}:${v.line} — ${v.accessor}.${v.op} → ${v.field}: ${v.value}`);
      for (const line of rawSqlMentions(source, fields)) violations.push(`${rel}:${line} — كتابةٌ خامٌ بـSQL لعمودٍ معلَن`);
    }
    // eslint-disable-next-line no-console
    console.log(`external-text guard: ${fields.length} أعمدة معلَنة · ${files.length} ملفاً · ${examined} نداءَ كتابةٍ فُحص في ${examinedFiles.length} ملفاً`);
    expect(examined).toBeGreaterThanOrEqual(5);
    expect(examinedFiles).toContain('src/zatca/zatca.service.ts');
    expect(violations).toEqual([]);
  });
});
