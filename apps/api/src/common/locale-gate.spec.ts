import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * حارس اللغة — `§8.7` الوجه السادس (قرار المالك 2026-09-03).
 *
 * ## العلّة التي يحرس منها — وقد وقعت
 *
 * `grep` بلا لغةٍ مضبوطة (`LANG` فارغة) يعامل النمط **بايتاتٍ لا أحرفاً**. وحرفٌ
 * عربيّ **بايتان** في UTF-8، فصنفٌ حرفيّ مثل `[أبجد]` يصير مجموعةَ بايتاتٍ مفردة
 * **لا تطابق حرفاً كاملاً أبداً**، و`.` يطابق **بايتاً** لا حرفاً. والنتيجة صفرٌ
 * **بلا خطأ** — فيُقرأ «غير موجود».
 *
 * وقد أسقطت هذه العلّة حكماً كاملاً: بحثٌ عن السلال الأربع في `CLAUDE.md §9`
 * بـ`grep -E "^### [أبجد] · "` أعاد صفراً، فأُبلغ المالك أن «المرحلة ب غير
 * معرَّفة» — وهي معرَّفة منذ #76. والنمط نفسه بـ`LC_ALL=C.UTF-8` أعاد **٤**.
 *
 * ## لماذا حارسٌ لا تذكير
 *
 * مستودعنا **كل وثائقه عربية**، فالعلّة تصيب **كل بحثٍ** لا بحثاً بعينه. وتذكيرٌ
 * يُنسى عند أول سطرٍ يُكتب على عجل — كما نُسي مع `rm` ومع `node -e` قبله. فالمنع
 * **بنيةً**: السير يضبط `LC_ALL` مرةً لكل الوظائف (`web-tests.yml` أعلى الملف)،
 * والسكربتات والخطّافات تُصدّره في سطرها الأول، وهذا الحارس يُسقط الحزمة إن
 * ظهر `grep` بنمطٍ **يجمع حرفاً عربياً وصنفاً حرفياً أو نقطة** في ملفٍ لا يضبط
 * اللغة.
 *
 * ## ما يفحصه ومَيله المعلَن
 *
 * - **المصدر لا المخرَج**: يقرأ ملفات السير والسكربتات والخطّافات نفسها.
 * - **بالاتجاهين**: ملفٌ فيه نمطٌ خطر بلا ضبط ⇒ سقوط. وضبطٌ بلا استعمال ⇒ لا شيء
 *   (الضبط الاحتياطي مقبول).
 * - **ميله إلى الإنذار الكاذب لا الصمت الكاذب**: نمطٌ عربيّ فيه `.` حرفيةٌ مهرَّبة
 *   `\.` يُعدّ خطراً أيضاً — فالإنذار يُراجَع بدقيقة، والصمت يعيش سنين.
 * - **وحدُّه**: لا يفحص `grep` داخل نصوص TypeScript (تلك تمرّ بـ`child_process`
 *   نادراً، ومحرّك JS نفسه آمنٌ على Unicode). سطحه الخمسة والاثنان أدناه.
 */

const REPO = join(__dirname, '..', '..', '..', '..');

/** يُشتقّ السطح من القرص لا من قائمةٍ بيد — ملفٌ جديد يدخل الفحص وحده. */
function listSurface(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(sh|ya?ml)$/.test(name) || dir.endsWith('.githooks')) out.push(p);
    }
  };
  walk(REPO);
  return out.sort();
}

/** حرفٌ عربيّ واحد على الأقل — بالمدى الصريح لا بصنفٍ يعتمد على اللغة (JS آمن هنا). */
const ARABIC = /[؀-ۿ]/;
/** صنفٌ حرفيّ أو نقطةٌ غير مهرَّبة داخل النمط — كلاهما يطابق بايتاً لا حرفاً بلا لغة. */
const BYTE_TRAP = /\[|(?<!\\)\./;
/** استدعاء grep وما بعده على السطر. */
const GREP_CALL = /\bgrep\b([^|;&]*)/g;
/** النمط المقتبس — بعلامتَي تنصيصٍ مزدوجتين أو مفردتين. */
const QUOTED = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g;

/**
 * يستخرج **النمط وحده** من وسائط grep — لا اسم الملف ولا الخيارات.
 *
 * ⚠️ وهذا تصحيحٌ لأول كتابةٍ كانت تفحص الوسائط كلّها، فعدَّت النقطة في اسم
 * الملف `CLAUDE.md` نقطةَ نمطٍ وأنذرت على `grep -c "^### ب · " CLAUDE.md` —
 * وهو آمنٌ تماماً. **كشفه اختبارُ الحالتين أدناه لا المراجعة**: كاشفٌ يُنذر على
 * كل سطرٍ فيه ملفٌ بامتداد يُعطَّل بعد يومين، فيصير أسوأ من لا كاشف.
 *
 * والنمط هو **أول سلسلةٍ مقتبسة** بعد `grep`؛ فإن لم تُوجد فأول وسيطٍ لا يبدأ
 * بـ`-`. (وحدٌّ معلَن: نمطٌ من متغيّرٍ `"$PAT"` لا يُفحص — لا نصّ يُقرأ.)
 */
function patternOf(args: string): string {
  const q = [...args.matchAll(QUOTED)].map((m) => m[1] ?? m[2] ?? '');
  if (q.length) return q[0];
  const tok = args.trim().split(/\s+/).find((t) => t && !t.startsWith('-'));
  return tok ?? '';
}

/** أخطر ما في الملف: أسطر `grep` نمطُها عربيٌّ وفيه صنفٌ أو نقطة. */
export function dangerousGrepLines(text: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/^\s*#.*$/, ''); // التعليقات تذكر الأنماط نصّاً — ليست أوامر
    if (!line.trim()) return;
    for (const m of line.matchAll(GREP_CALL)) {
      const pat = patternOf(m[1] ?? '');
      if (ARABIC.test(pat) && BYTE_TRAP.test(pat)) hits.push({ line: i + 1, text: raw.trim() });
    }
  });
  return hits;
}

/** هل يضبط الملف اللغة قبل أوامره؟ (تصديرٌ في صدفة، أو `env:` في سير.) */
export function declaresLocale(text: string): boolean {
  return /(^|\n)\s*(export\s+)?LC_ALL\s*[:=]\s*C\.UTF-8/.test(text);
}

describe('حارس اللغة — grep بنمطٍ عربيّ بلا LC_ALL (§8.7 الوجه السادس)', () => {
  const files = listSurface();

  it('السطح مشتقٌّ ويحوي السير والسكربتات والخطّافات — وإلا فالحارس يفحص العدم', () => {
    const rel = files.map((f) => relative(REPO, f).replace(/\\/g, '/'));
    expect(rel).toEqual(expect.arrayContaining(['.github/workflows/web-tests.yml', 'deploy.sh', '.githooks/pre-commit']));
  });

  it('⭐ لا ملفٌ فيه grep بنمطٍ عربيّ خطرٍ بلا ضبطٍ للغة', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      const bad = dangerousGrepLines(text);
      if (bad.length && !declaresLocale(text)) {
        offenders.push(...bad.map((b) => `${relative(REPO, f)}:${b.line}  ${b.text}`));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('السير يضبط LC_ALL على مستوى الملف — مرةً لكل الوظائف', () => {
    const wf = readFileSync(join(REPO, '.github', 'workflows', 'web-tests.yml'), 'utf8');
    expect(declaresLocale(wf)).toBe(true);
  });

  // ⭐ الإثبات العكسي مبنيٌّ في الحارس نفسه: كاشفٌ لا يكشف الحالة المعروفة أعمى.
  it('الكاشف يمسك النمط الخطر ويترك الآمن — مُثبَتٌ بحالتَين', () => {
    expect(dangerousGrepLines('grep -E "^### [أبجد] · " CLAUDE.md')).toHaveLength(1); // صنفٌ عربيّ
    expect(dangerousGrepLines('grep -oE "ق-." SPEC.md')).toHaveLength(1); // نقطة على عربي
    expect(dangerousGrepLines('grep -c "^### ب · " CLAUDE.md')).toHaveLength(0); // نصٌّ حرفيّ — آمن
    expect(dangerousGrepLines('grep -cE "^\\| *[0-9]+\\.[0-9]+ *\\|" SPEC.md')).toHaveLength(0); // ASCII — آمن
    expect(dangerousGrepLines('# grep -E "[أبجد]"  مثالٌ في تعليق')).toHaveLength(0); // تعليق — ليس أمراً
    expect(declaresLocale('export LC_ALL=C.UTF-8\ngrep -E "[أب]" f')).toBe(true);
    expect(declaresLocale('grep -E "[أب]" f')).toBe(false);
  });
});
