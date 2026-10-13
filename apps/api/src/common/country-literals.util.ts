import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { stripComments } from './source-scan.util';

/**
 * 🔴 **القاعدةُ الملزمة `ق-١٣٥٠` — حارسُها** (بنصّ المالك: «والحارسُ يُبنى بعد مسح التوطين»).
 *
 * «**النواةُ لا تعرف الدولة** … **ولا رقمَ ولا رمزَ ولا نصَّ سعوديٌّ حرفيٌّ خارج وحدته** … **وإن لم يكن بدٌّ من افتراضٍ سعوديٍّ في
 * النواة، فيُعلَن بحجّته ويُعدّ**.» — `CLAUDE.md §3.8`.
 *
 * ## ما يعدّه
 * أسطرُ شيفرة الإنتاج (بعد تجريد التعليقات — فالشرحُ لا يُعاقَب: `§8.24`) التي تحمل **علامةً سعوديةً حرفية** من القائمة أدناه — وهي
 * العلاماتُ **الشيفريّة** من مسح التوطين (`docs/domain-scan/25` · §ب)، كلٌّ مُصادَقٌ هناك بحالتين. **والنصوصُ تُقرأ عمداً** (`ق-٣٧٥`):
 * `'SAR'` و`'Asia/Riyadh'` و`'ar-SA'` نصوصٌ — فتجريدُها يُعمي الحارسَ عمّا وُضع له.
 *
 * ## أين يُسمح بها
 * **داخل حدود الوحدة السعودية كما هي اليوم** (المسح §ب): كلُّ ملفٍّ يحمل اسمُه `zatca` · ووحدتا الضريبة والإقرار (`common/vat` ·
 * `obligations`) وملفّاتُهما في الواجهة. **وخارجها دَينٌ معلَن** في `docs/country-literals-debt.json` — **ينقص ولا يزيد** (مِسنَن)، وكلُّ
 * سطرٍ جديدٍ يُعلَن بحجّته أو لا يدخل.
 *
 * ⚠️ **حدودُه معلَنة**: (١) يعدّ **الحرفيّ** لا الافتراضَ الضمنيّ — منطقٌ سعوديٌّ بلا علامةٍ حرفية (مهلةُ ١٥ يوماً باسمٍ عامّ) لا يراه.
 * (٢) الحدُّ «داخلها» هو **حدُّ اليوم** لا الوحدةُ المنشودة — فالهيئةُ ما زالت «نواة» في خريطة الطبقات (المسح §ب)، ونقلُها قرارٌ لم يُحسم.
 * (٣) لا يقرأ المخطَّطَ ولا الهجرات — قيودُ القاعدة وافتراضاتُها معدودةٌ في المسح (§ب · §د) لا هنا.
 */
export const COUNTRY_MARKERS: ReadonlyArray<{ id: string; re: RegExp; what: string }> = [
  { id: 'zatca', re: /zatca/i, what: 'اسمُ الهيئة (ZATCA) في شيفرةٍ عامّة' },
  { id: 'sar', re: /(['"`])SAR\1/, what: 'رمزُ الريال حرفاً — والعملةُ من المنشأة' },
  { id: 'riyal-symbol', re: /ر\.س/, what: 'رمزُ الريال في الواجهة' },
  { id: 'riyal-sign', re: /\u20C1|\\u20C1/, what: 'رمزُ الريال الرسميّ (U+20C1) حرفاً — والرمزُ من عملة المنشأة' },
  { id: 'riyadh-tz', re: /Asia\/Riyadh/, what: 'منطقةُ الرياض الزمنية — والمنطقةُ من المنشأة' },
  { id: 'ksa-offset', re: /\bKSA_UTC_OFFSET_MIN\b/, what: 'إزاحةُ التوقيت السعوديّ' },
  { id: 'ar-sa', re: /ar-SA/, what: 'محلّيةُ العرض السعودية' },
  { id: 'sa-code', re: /(['"`])SA\1/, what: 'رمزُ الدولة حرفاً' },
  { id: 'vat-format', re: /3\\d\{13\}3/, what: 'صيغةُ الرقم الضريبيّ السعوديّ' },
  { id: 'vatex-sa', re: /VATEX-SA/, what: 'رموزُ إعفاء الهيئة' },
  { id: 'br-ksa', re: /BR-KSA/, what: 'قواعدُ الهيئة' },
  { id: 'vat-rate', re: /\bSTANDARD_VAT_RATE\b/, what: 'النسبةُ الأساسية ثابتةً — والنسبةُ من الإعداد' },
  { id: 'fifteen-percent', re: /\b15\s*(%|٪)/, what: 'خمسةَ عشرَ بالمئة حرفاً' },
];

/** جذرُ المستودع — من موضع هذا الملفّ (`apps/api/src/common`). */
export const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/** جذورُ شيفرة الإنتاج الثلاثة — كما في المسح. */
export const SCAN_ROOTS = ['apps/api/src', 'apps/web/src', 'packages/shared/src'] as const;

/** ملفُّ الدَّين المعلَن — العددُ لكلِّ ملفٍّ وحجّتُه. */
export const DEBT_FILE = 'docs/country-literals-debt.json';

/** هذا الحارسُ نفسُه وقائمتُه يحملان العلاماتِ أمثلةً — مستثنَيان **بالاسم** (`§8.7`: يُستثنى بالاسم لا يُسرد المشمول). */
const SELF = new Set(['apps/api/src/common/country-literals.util.ts']);

const posix = (p: string) => p.split(sep).join('/');

/**
 * كلُّ ملفّات `.ts` و`.tsx` تحت الجذر — ⚠️ **لا `sourceFiles` المشتركة**: تلك `.ts` وحدَها، **والواجهةُ `.tsx` في أغلبها** — فحارسٌ
 * يمشي بها يرى نصفَ الواجهة ويسكت عن نصفها (`§8.7`: الأداةُ تستثني فئةً مما تقيسه ولا تقول).
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/** أهو ملفُّ إنتاج؟ — لا اختبار ولا بيئةَ اختبار. */
function isProduction(rel: string): boolean {
  if (!/\.(ts|tsx)$/.test(rel)) return false;
  if (/\.(spec|e2e-spec|test)\.tsx?$/.test(rel)) return false;
  return !rel.startsWith('apps/web/src/test/');
}

/**
 * أهو داخل حدود الوحدة السعودية كما هي اليوم؟ (المسح §ب — `PROD_Z` و`PROD_V`)
 *
 * ⚖️ **ومعها سجلُّ الأقاليم** (`common/region/` — `ق-١٣٦٨`): هو **مسكنُ قيم الدولة** بطبيعته — منه تُكتب الحقولُ الأربعة على المنشأة
 * عند ميلادها لتُقرأ من المنشأة في كلِّ موضعٍ آخر (`ق-١٣٥٠` ②). فعلامتُه هناك ليست دَيناً يُنقَص بل الموضعُ الذي يُنقَص إليه الدَّين.
 */
/**
 * علامةُ المسار التي تجعل ملفّاً داخل الوحدة — **مصدرٌ واحد** يقرؤه الحدُّ هنا ومولِّدُ التعدادات المشتركة (`ق-١٣٨٤`) حين يسمّي
 * ملفَّ ما يحمل علامةً سعودية: فإن تغيّر الحدُّ تبعه المولَّد، ولا يُكتب اسمُ الوحدة في مولِّدٍ عامّ.
 */
export const SAUDI_UNIT_PATH_MARK = 'zatca';

export function insideSaudiBoundary(rel: string): boolean {
  if (rel.toLowerCase().includes(SAUDI_UNIT_PATH_MARK)) return true;
  if (rel.startsWith('apps/api/src/common/region/')) return true;
  if (rel.startsWith('apps/api/src/common/vat/') || rel.startsWith('apps/api/src/obligations/')) return true;
  if (rel.startsWith('apps/web/src/pages/obligations/')) return true;
  return ['apps/web/src/lib/vat.ts', 'apps/web/src/api/obligations.ts', 'apps/web/src/components/LineTaxPicker.tsx'].includes(rel);
}

/** عددُ الأسطر التي تحمل علامةً سعودية في نصّ ملفّ — بعد تجريد التعليقات. */
export function countMarkerLines(source: string): number {
  return stripComments(source)
    .split(/\r?\n/)
    .filter((line) => COUNTRY_MARKERS.some((m) => m.re.test(line))).length;
}

export interface CountryLiteralsScan {
  /** كلُّ ملفّات الإنتاج المقروءة — دليلُ أن الحارس قرأ شيئاً. */
  filesScanned: number;
  /** العددُ لكلِّ ملفٍّ **خارج** الحدود (ما كان صفراً لا يُدرج). */
  outside: Record<string, number>;
  /** مجموعُ الداخل — للعرض وحدَه. */
  insideLines: number;
}

export function scanCountryLiterals(root: string = REPO_ROOT): CountryLiteralsScan {
  const outside: Record<string, number> = {};
  let filesScanned = 0;
  let insideLines = 0;
  for (const base of SCAN_ROOTS) {
    for (const abs of walk(join(root, base))) {
      const rel = posix(relative(root, abs));
      if (!isProduction(rel) || SELF.has(rel)) continue;
      filesScanned += 1;
      const n = countMarkerLines(readFileSync(abs, 'utf8'));
      if (n === 0) continue;
      if (insideSaudiBoundary(rel)) insideLines += n;
      else outside[rel] = n;
    }
  }
  return { filesScanned, outside, insideLines };
}
