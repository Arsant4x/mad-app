import * as path from 'node:path';
import * as ts from 'typescript';

/**
 * حارسُ `strict` في الجانبين (ق-١٠٤٤ · 2026-09-17) — **العيّنةُ التي قِيس بها الصفرُ حالةٌ دائمة**.
 *
 * يوم التفعيل قِيس `tsc --strict` على الخادم (`630` ملفاً) والويب (`182`) فأعطى صفراً وصفراً — **ولم يُصدَّق
 * الصفرُ حتى صُودق المسبار**: عيّنةٌ من سطرين يجب أن تسقط أعطت خطأين بالعلَم وصفراً بدونه. وهذا الحارس
 * يُبقي تلك العيّنةَ نفسَها في الحزمة، فمن أزال العلَم بعد سنةٍ سقطت عليه:
 *
 * - يقرأ كلَّ إعدادٍ **بواجهة TypeScript لا بنصّه** (الخياراتُ الفعليّة بعد التحليل) — فحارسٌ نصّيّ يبحث عن
 *   `"strict": true` يُرضيه سطرٌ بجواره يُطفئ عضواً (`§8.5`: مكتوبةٌ لا تعمل).
 * - يترجم السطرين تحت كلِّ إعدادٍ كما هو ويوجب الخطأين المسمَّيين.
 * - **ويُصادق نفسَه** (ق-٢٠٨ في موضعه · ق-١٣٦): السطران نفسُهما بلا عائلة `strict` كلِّها ⇒ صفرٌ — فالسقوطُ من
 *   الصرامة لا من العيّنة؛ وبلا المظلّة وحدَها ⇒ يغيب ما لا تعطيه إلا هي (`TS2564`) — وهو ما يفصل في الخادم،
 *   لأنه يحمل `strictNullChecks` و`noImplicitAny` و`strictBindCallApply` فرادى منذ قبل، فإزالةُ `strict` وحدَه
 *   لا تُسقط السطرَ الأول وتُسقط الثاني.
 */
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const CONFIGS = [
  { side: 'الخادم', file: 'apps/api/tsconfig.json' },
  { side: 'الويب — المصدر', file: 'apps/web/tsconfig.app.json' },
  { side: 'الويب — إعدادُ vite', file: 'apps/web/tsconfig.node.json' },
] as const;

/** العيّنةُ التي قِيس بها الصفر (2026-09-17) — لا تُعدَّل: التعديلُ يجعل الحارسَ يشهد لنفسه. */
const SAMPLE = 'export const x: string = null;\nexport class C { y: number; }\n';
/** `TS2322` عدمٌ إلى نصّ (`strictNullChecks`) · `TS2564` خاصيةٌ بلا مهيّئ (`strictPropertyInitialization` — من المظلّة وحدَها). */
const EXPECTED = [2322, 2564];
const UMBRELLA_ONLY_CODE = 2564;
const STRICT_FAMILY = [
  'strict',
  'strictNullChecks',
  'noImplicitAny',
  'strictBindCallApply',
  'strictFunctionTypes',
  'strictPropertyInitialization',
  'noImplicitThis',
  'alwaysStrict',
  'useUnknownInCatchVariables',
  'strictBuiltinIteratorReturn',
];

function readEffectiveOptions(file: string): ts.CompilerOptions {
  const abs = path.join(ROOT, file);
  const read = ts.readConfigFile(abs, ts.sys.readFile);
  if (read.error) throw new Error(`تعذّرت قراءة ${file}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(abs), undefined, abs);
  const fatal = parsed.errors.filter((e) => e.category === ts.DiagnosticCategory.Error);
  if (fatal.length) throw new Error(`${file}: ${fatal.map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join(' · ')}`);
  return parsed.options;
}

/** يترجم العيّنةَ (ملفّاً افتراضياً لا يُكتب على القرص) تحت الخيارات المعطاة ويعيد رموزَ أخطائها مرتّبة. */
function diagnoseSample(options: ts.CompilerOptions, configFile: string): number[] {
  const samplePath = path.join(ROOT, path.dirname(configFile), '__strict-gate-sample__.ts').replace(/\\/g, '/');
  const opts: ts.CompilerOptions = {
    ...options,
    noEmit: true,
    incremental: false,
    composite: false,
    tsBuildInfoFile: undefined,
    declaration: false,
    sourceMap: false,
    types: [], // العيّنةُ لا تحتاج أنواعَ البيئة — والتحليلُ لا يعتمد على مسار node_modules
  };
  const isSample = (f: string) => path.normalize(f).replace(/\\/g, '/') === samplePath;
  const host = ts.createCompilerHost(opts, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (f, lang, onError, shouldCreate) =>
    isSample(f) ? ts.createSourceFile(samplePath, SAMPLE, lang, true) : getSourceFile(f, lang, onError, shouldCreate);
  host.fileExists = (f) => isSample(f) || fileExists(f);
  host.readFile = (f) => (isSample(f) ? SAMPLE : readFile(f));
  const program = ts.createProgram({ rootNames: [samplePath], options: opts, host });
  const sf = program.getSourceFile(samplePath);
  if (!sf) throw new Error(`العيّنةُ لم تدخل البرنامج تحت ${configFile}`);
  return ts
    .getPreEmitDiagnostics(program, sf)
    .filter((d) => !d.file || d.file.fileName === samplePath)
    .map((d) => d.code)
    .sort((a, b) => a - b);
}

describe('حارسُ strict في الجانبين — العيّنةُ التي قِيس بها الصفرُ حالةٌ دائمة (ق-١٠٤٤)', () => {
  it('الحارسُ يرى الإعداداتِ الثلاثة فعلاً', () => {
    expect(CONFIGS.length).toBe(3);
    for (const c of CONFIGS) expect(ts.sys.fileExists(path.join(ROOT, c.file))).toBe(true);
  });

  for (const c of CONFIGS) {
    describe(`${c.side} — ${c.file}`, () => {
      it('العلَمُ حاضرٌ في الخيارات الفعليّة بعد التحليل — لا في النصّ وحده', () => {
        expect(readEffectiveOptions(c.file).strict).toBe(true);
      });

      it('العيّنةُ تسقط بالخطأين المسمَّيين تحت الإعداد كما هو', () => {
        expect(diagnoseSample(readEffectiveOptions(c.file), c.file)).toEqual(EXPECTED);
      });

      it('المسبارُ يرى: السطران نفسُهما بلا عائلة strict كلِّها ⇒ صفر — فالسقوطُ من الصرامة لا من العيّنة', () => {
        const bare: ts.CompilerOptions = { ...readEffectiveOptions(c.file) };
        for (const k of STRICT_FAMILY) delete bare[k];
        expect(diagnoseSample(bare, c.file)).toEqual([]);
      });

      it('إزالةُ المظلّة وحدَها تُغيّب ما لا تعطيه إلا هي (TS2564) — فمن أزال السطرَ سقط عليه الاختباران أعلاه', () => {
        const noUmbrella: ts.CompilerOptions = { ...readEffectiveOptions(c.file) };
        delete noUmbrella.strict;
        expect(diagnoseSample(noUmbrella, c.file)).not.toContain(UMBRELLA_ONLY_CODE);
      });
    });
  }
});
