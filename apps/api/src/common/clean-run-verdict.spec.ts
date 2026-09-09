import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * **انقطاعٌ لا فشل — بوّابةٌ آليّة لا تذكُّراً** (`ق-٣٣٤`).
 *
 * ── العطل المُقاس ─────────────────────────────────────────────────────────
 *
 * سقطت الحزمة النظيفة **بلا مجموعةٍ ساقطة**: ٣٧ مجموعةً خضراء ثم انقطاعٌ بلا
 * ملخّص، **وسببُه إعادةُ تشغيل محرّك الحاويات من تحتها** (`docker inspect`:
 * توقّفٌ نظيف وبدءٌ بعده بثانيتين، `OOMKilled=false` · `RestartCount=0`).
 * **والشيفرةُ كانت خضراء قبله وبعده: ١٦٩/١٦٩ · ١٠٥٢/١٠٥٢.**
 *
 * ⚠️ **وتوقيعُه توقيعُ `ق-٣٢٣`** — لكنّ هذا **لا يُمنَع بانضباط**: لا يملك
 * أحدٌ منعَ المحرّك. **فالعلاجُ تمييزٌ لا منع**، **وحكمُ المالك: آلياً لا
 * قراءةً** — «فما يُتذكَّر يُنسى».
 *
 * ── ولماذا يُستدعى الملفُّ الحقيقيّ ──────────────────────────────────────
 *
 * ⚠️ **الاختبار يشغّل `scripts/clean-verdict.mjs` نفسه** بـ`node`، لا نسخةً
 * من منطقه: **نسخةٌ تُثبت النسخة**. والحالاتُ الثلاث **معلومةٌ سلفاً**، ومنها
 * **حالةُ سقوطٍ حقيقيّة** — فبوّابةٌ تقول «انقطاع» دائماً تُخفي كلَّ فشل،
 * وهي أسوأ من غيابها.
 */
describe('حكمُ التشغيل: انقطاعٌ لا فشل — بوّابةٌ مُثبَتةٌ بثلاث حالات', () => {
  const CLI = join(__dirname, '..', '..', 'scripts', 'clean-verdict.mjs');
  let dir: string;

  const verdict = (resultPath: string, threw: '0' | '1') =>
    execFileSync(process.execPath, [CLI, resultPath, threw], { encoding: 'utf8' }).trim();

  const write = (name: string, body: string) => {
    const p = join(dir, name);
    writeFileSync(p, body, 'utf8');
    return p;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'clean-verdict-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('🔴 حصيلةٌ غائبة ⇒ انقطاع — وهي الحالةُ التي بُنيت لها البوّابة', () => {
    expect(verdict(join(dir, 'لا-وجود-له.json'), '1')).toBe('INTERRUPTED');
    // ⚠️ **وحتى بلا رمي**: قتلٌ نظيفٌ لا يرمي ولا يكتب — والغيابُ وحده يحكم.
    expect(verdict(join(dir, 'لا-وجود-له.json'), '0')).toBe('INTERRUPTED');
  });

  it('🔴 وحصيلةٌ مبتورة ⇒ انقطاع — فالقتلُ أثناء الكتابة يترك JSON نصفَه', () => {
    expect(verdict(write('مبتورة.json', '{"success":true,"numTotalTests":10'), '1')).toBe('INTERRUPTED');
    // وملفٌّ صالحٌ لشيءٍ آخر ليس حصيلة — الحقلان يُتحقَّق منهما لا وجودُ كائن.
    expect(verdict(write('غريبة.json', '{"ok":1}'), '0')).toBe('INTERRUPTED');
  });

  it('🔴 وسقوطٌ حقيقيّ ⇒ فشل لا انقطاع — وهذا ما يمنع البوّابةَ من ابتلاع الأعطال', () => {
    // **الوجهُ الذي يجب أن يسقط**: بلا هذه الحالة تصير البوّابةُ عمىً شاملاً.
    expect(verdict(write('ساقطة.json', '{"success":false,"numTotalTests":1052,"numPassedTests":1049,"numFailedTests":3}'), '1')).toBe('FAIL');
    // وتناقضٌ بين حصيلةٍ ناجحة وخروجٍ ساقط يُقرأ **فشلاً** — الأشدُّ يُغلِّب.
    expect(verdict(write('متناقضة.json', '{"success":true,"numTotalTests":1052,"numPassedTests":1052,"numFailedTests":0}'), '1')).toBe('FAIL');
    // ⚠️ **وصفرُ اختبارٍ ليس نجاحاً**: `success: true` بلا توكيدٍ واحد خضرةٌ
    // لا تعني شيئاً. **والحصيلةُ منقولةٌ عن تشغيلٍ حقيقيّ** (`-t` لا يطابق
    // شيئاً) لا مصنوعة — **وهي التي أسقطت أوّلَ صياغةٍ فحصت المجموع**: جيست
    // يعدّ المتخطَّى في `numTotalTests`، **فالمقياسُ ما رُكض لا ما عُرف**.
    expect(verdict(write('متخطّاة.json', '{"success":true,"numTotalTests":20,"numPassedTests":0,"numFailedTests":0,"numPendingTests":20}'), '0')).toBe('EMPTY');
    expect(verdict(write('فارغة.json', '{"success":true,"numTotalTests":0}'), '0')).toBe('EMPTY');
  });

  it('🔴 ونجاحٌ تامّ ⇒ نجاح — كي لا تكون البوّابةُ حمراءَ دائماً', () => {
    // **الحصيلةُ بصياغتها الواقعية**: تشغيلُ الحزمة النظيفة الأخير.
    expect(verdict(write('ناجحة.json', '{"success":true,"numTotalTests":1052,"numPassedTests":1052,"numFailedTests":0}'), '0')).toBe('PASS');
  });

  it('🔴 وعدُّ النمط: صفرُ اختبارٍ ليس انقطاعاً — الثغرةُ التي كشفها الإثباتُ نفسُه', () => {
    // ⚠️ **قِيس على المُشغِّل الحقيقيّ**: نمطٌ لا يطابق شيئاً أخرج جيست بغير
    // صفرٍ **بلا حصيلة**، **فقرأته البوّابةُ انقطاعاً** — عذرٌ يبتلع «شُغِّل
    // صفرُ اختبار»، وهو عينُ عطل `ci-split`. فيُسأل النمطُ **قبل** التشغيل.
    const count = (stdout: string) =>
      execFileSync(process.execPath, [CLI, 'count'], { input: stdout, encoding: 'utf8' }).trim();

    expect(count('')).toBe('0');
    expect(count('\n  \n')).toBe('0');
    // والصياغةُ الواقعية لمخرَج `--listTests`: مساراتٌ مطلقة سطراً سطراً.
    expect(count(['D:\\mad-app\\apps\\api\\src\\common\\ci-split.spec.ts', 'D:\\mad-app\\apps\\api\\test\\pos.e2e-spec.ts'].join('\n'))).toBe('2');
    // وما ليس ملفَّ اختبارٍ لا يُعدّ — رسالةٌ أو تحذيرٌ يسبق القائمة.
    expect(count(['Determining test suites to run...', 'D:\\mad-app\\apps\\api\\src\\common\\ci-split.spec.ts'].join('\n'))).toBe('1');
  });
});
