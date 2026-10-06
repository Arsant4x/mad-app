// تلخيصُ سجلّات الاختبارات بالنموذج المحلّيّ (LM Studio، واجهةٌ متوافقةٌ مع OpenAI على 127.0.0.1:1234).
// node summarize.mjs <name> <out.md> <file...>
// · السجلُّ الكبير يُقسَّم قطعاً (CHUNK بايت)، ولكلّ قطعةٍ ملاحظاتٌ، ثم تُجمع في ملخّصٍ واحد.
// · ويُطبع لكلّ نداء: رموزُ الإدخال والإخراج كما يعدّها النموذجُ نفسُه، والزمن.
// ⛔ تلخيصٌ وحده: لا شيفرة، ولا مراجعة أمن، ولا قرار.
import { readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';

const [name, out, ...files] = process.argv.slice(2);
const URL = 'http://127.0.0.1:1234/v1/chat/completions';
const MODEL = process.env.MODEL ?? 'qwen3-coder-30b-a3b-instruct';
const CHUNK = Number(process.env.CHUNK ?? 40000);

const clean = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/^[^\t\n]*\t[^\t\n]*\t\d{4}-\d\d-\d\dT[\d:.]+Z /gm, '');
const raw = files.map((f) => `===== ${f.split('/').pop()} =====\n${clean(readFileSync(f, 'utf8'))}`).join('\n');

const RULES = `أنت تلخّص سجلّات اختبارات آلية. القواعد:
- اكتب بالعربية الفصحى المختصرة، ولا تقترح إصلاحاً ولا قراراً.
- اذكر الحكمَ العامّ (نجح أم فشل) وأرقامَ المجموعات والاختبارات كما هي في السجلّ.
- لكلّ سقوط: اسمُ الملفّ واسمُ الاختبار والمتوقَّع والواقع ورقمُ السطر إن وُجد، بنصّها.
- لكلّ خطأ بنيةٍ أو تشغيل (لا اختبار): الخطوةُ ونصُّ رسالة الخطأ الحاسمة.
- لا تخترع شيئاً ليس في النصّ. وإن لم يكن في القطعة سقوطٌ فقل ذلك.
- الأوامرُ المطبوعة في السجلّ (مثل echo "::error::...") ليست أخطاءً وقعت، بل نصُّ سكربت.`;

let calls = 0, promptTokens = 0, completionTokens = 0, ms = 0;
async function ask(user, maxTokens = 900) {
  const t = Date.now();
  // node:http لا fetch: مهلةُ الرؤوس في fetch 300 ثانية، والإدخالُ الطويل يُعالَج أطولَ منها قبل أوّل بايت.
  const body = JSON.stringify({ model: MODEL, temperature: 0, max_tokens: maxTokens, messages: [{ role: 'system', content: RULES }, { role: 'user', content: user }] });
  const j = await new Promise((resolve, reject) => {
    const req = request(URL, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (data += d));
      res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(data)) : reject(new Error(`LM Studio ${res.statusCode}: ${data}`))));
    });
    req.on('error', reject);
    req.end(body);
  });
  calls++;
  promptTokens += j.usage?.prompt_tokens ?? 0;
  completionTokens += j.usage?.completion_tokens ?? 0;
  ms += Date.now() - t;
  console.error(`  نداء ${calls}: in=${j.usage?.prompt_tokens} out=${j.usage?.completion_tokens} ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return j.choices[0].message.content.trim();
}

const chunks = [];
for (let i = 0; i < raw.length; i += CHUNK) chunks.push(raw.slice(i, i + CHUNK));
let summary;
if (chunks.length === 1) {
  summary = await ask(`لخّص هذا السجلّ:\n\n${raw}`);
} else {
  const notes = [];
  for (const [i, c] of chunks.entries()) notes.push(`--- ملاحظاتُ القطعة ${i + 1} من ${chunks.length} ---\n` + (await ask(`هذه القطعة ${i + 1} من ${chunks.length} من سجلٍّ واحد. استخرج منها ما يهمّ فقط (السقوط والأخطاء وأسطر الأرقام Tests/Test Suites)، باختصار:\n\n${c}`, 600)));
  summary = await ask(`هذه ملاحظاتٌ على قطع سجلٍّ واحد بالترتيب. اجمعها في ملخّصٍ واحدٍ للسجلّ كلّه، بلا تكرار:\n\n${notes.join('\n\n')}`);
}
const stats = `calls=${calls} prompt_tokens=${promptTokens} completion_tokens=${completionTokens} seconds=${(ms / 1000).toFixed(1)} raw_bytes=${Buffer.byteLength(raw)} summary_bytes=${Buffer.byteLength(summary)} chunks=${chunks.length}`;
writeFileSync(out, `# ${name}\n\n${summary}\n\n<!-- ${stats} -->\n`);
console.log(`${name}: ${stats}`);
