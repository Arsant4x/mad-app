/**
 * حارسٌ: **تصنيفُ العقد لا يُستنبَط من كلمة** (`ق-٨٩١` · `ق-٨٩٨`).
 *
 * كانت في `contracts.service.ts` خريطةُ كلماتٍ خمس (`UNIT_TYPE_TO_ACTIVITY`) تحوّل `Unit.type`
 * — وهو نصٌّ حرٌّ يقبل الخادمُ فيه أيَّ كلمة — إلى تعداد العقار، **وتتخطّى ما لا تعرفه
 * صامتةً**: `apartment` و`office` بالحرف اللاتينيّ غيرُ مرئيَّين لها، فعقودُهما لا سكنيةٌ ولا
 * تجارية. حُذفت بحكم المالك، **ولا تُبقى «لفحص الاتساق» فبقاؤها يُبقي الاستنباط**.
 *
 * ما يُمنع في وحدة العقود (بلا ملفّات الاختبار):
 *   ① عودةُ الاسم `UNIT_TYPE_TO_ACTIVITY` أو أيُّ قراءةٍ لـ`unit.type` / `.unit.type`.
 *   ② كائنٌ أو خريطةٌ مفاتيحُها كلماتُ أنواع الوحدات العربية (اثنتان فأكثر في نافذةٍ واحدة).
 *   ③ إسنادُ `classification:` أو `vatInclusion:` من غير الـDTO (`dto.`) — فالمصدرُ الوحيد
 *      إعلانُ المستخدم، لا اشتقاقٌ من وحدةٍ ولا عقارٍ ولا عقدٍ سابق.
 *
 * يقرأ المصدرَ لا المخرَج (`§8.7`)، ويجرّد التعليقاتِ قبل المطابقة كي لا يُدين شرحَ ما مُنع
 * (`§8.24`) — **ويُبقي السلاسلَ** لأن المخالفةَ هنا مفاتيحُ نصّية. وعيّناتُه تُبنى بدالّةٍ لا
 * تُكتب حرفياً، ويُثبَت أنه يرى (must-hit) وأنه لا يُدين البريء (must-miss).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CONTRACTS_DIR = join(__dirname);

/** كلماتُ أنواع الوحدات كما اقترحتها الواجهة — تُبنى من أجزاءٍ كي لا تظهر حرفياً هنا. */
const unitWords = (): string[] => ['سك|ني', 'مح|ل', 'مع|رض', 'مك|تب', 'مخ|زن'].map((w) => w.split('|').join(''));

/** يجرّد التعليقات (سطريةً وكتليةً) ويُبقي السلاسل — فالمخالفةُ مفاتيحُ نصّية. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));
}

export interface WordClassificationHit {
  rule: string;
  line: number;
  text: string;
}

export function findWordClassification(source: string): WordClassificationHit[] {
  const hits: WordClassificationHit[] = [];
  const lines = stripComments(source).split(/\r?\n/);
  const words = unitWords();
  // مفاتيحُ الخريطة تتوزّع على أسطرٍ — كلمةٌ في كلِّ سطر كما كانت الخريطةُ الأصلية —
  // فتُجمع على الملفّ كلِّه لا على السطر (أوّلُ صياغةٍ قاست السطرَ وحدَه فسقطت مصادقتُها).
  const keyed = new Map<string, number>();
  lines.forEach((text, i) => {
    const line = i + 1;
    if (/UNIT_TYPE_TO_ACTIVITY/.test(text)) hits.push({ rule: 'map-name', line, text: text.trim() });
    if (/\bunit\.type\b/.test(text) && !/unit\.type\s*[:=]/.test(text)) hits.push({ rule: 'reads-unit-type', line, text: text.trim() });
    for (const w of words) {
      if (new RegExp(`['"\`]${w}['"\`]\\s*:`).test(text) && !keyed.has(w)) keyed.set(w, line);
    }
    const assign = text.match(/\b(classification|vatInclusion)\s*:\s*([^,\n]+)/);
    if (assign && !/^dto\.(classification|vatInclusion)\b/.test(assign[2].trim())) {
      hits.push({ rule: 'derived-classification', line, text: text.trim() });
    }
  });
  if (keyed.size >= 2) {
    const [firstWord, firstLine] = [...keyed.entries()].sort((a, b) => a[1] - b[1])[0];
    hits.push({ rule: 'word-map', line: firstLine, text: `${keyed.size} unit-word keys, first: ${firstWord}` });
  }
  return hits;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

describe('حارس: تصنيفُ العقد لا يُستنبَط من كلمة (ق-٨٩١ · ق-٨٩٨)', () => {
  const files = sourceFiles(CONTRACTS_DIR);

  it('يقرأ وحدةَ العقود فعلاً — لا يخضرّ على فراغ', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.some((f) => f.endsWith('contracts.service.ts'))).toBe(true);
  });

  it('⭐ المصادقة (must-hit): خريطةُ كلماتٍ وقراءةُ unit.type واشتقاقُ التصنيف تُرى كلُّها', () => {
    const w = unitWords();
    const sample = [
      `const UNIT_TYPE_TO_ACTIVITY: Record<string, string> = {`,
      `  '${w[0]}': 'residential',`,
      `  '${w[1]}': 'shop',`,
      `};`,
      `const mapped = MAP[unit.type];`,
      `classification: unit.type === '${w[0]}' ? 'RESIDENTIAL' : 'COMMERCIAL',`,
      `classification: source.classification,`,
    ].join('\n');
    const rules = findWordClassification(sample).map((h) => h.rule);
    expect(rules).toContain('map-name');
    expect(rules).toContain('word-map');
    expect(rules).toContain('reads-unit-type');
    expect(rules.filter((r) => r === 'derived-classification')).toHaveLength(2);
  });

  it('⭐ المصادقة (must-miss): الإسنادُ من الـDTO وشرحٌ في تعليقٍ لا يُدانان', () => {
    const w = unitWords();
    const sample = [
      `// كانت هنا خريطةُ '${w[0]}' و'${w[1]}' — حُذفت`,
      `/* const UNIT_TYPE_TO_ACTIVITY = { '${w[2]}': 'x' } */`,
      `classification: dto.classification,`,
      `vatInclusion: dto.vatInclusion,`,
      `data.classification = dto.classification;`,
    ].join('\n');
    expect(findWordClassification(sample)).toEqual([]);
  });

  it('⛔ وحدةُ العقود خاليةٌ من الاستنباط', () => {
    const offenders = files.flatMap((f) => findWordClassification(readFileSync(f, 'utf8')).map((h) => `${f.replace(CONTRACTS_DIR, 'contracts')}:${h.line} [${h.rule}] ${h.text}`));
    expect(offenders).toEqual([]);
  });
});
