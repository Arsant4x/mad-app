import { readFileSync } from 'fs';
import { join } from 'path';
import { countMarkerLines, DEBT_FILE, insideSaudiBoundary, REPO_ROOT, scanCountryLiterals } from './country-literals.util';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): العلاماتُ السعودية نصوصٌ (`'SAR'` · `'Asia/Riyadh'` · `'ar-SA'`) — فتجريدُها يُعميه.
readsDeclaredStrings();

/**
 * 🔴 **حارسُ القاعدة الملزمة `ق-١٣٥٠`**: «ولا رقمَ ولا رمزَ ولا نصَّ سعوديٌّ حرفيٌّ خارج وحدته … وإن لم يكن بدٌّ … فيُعلَن بحجّته ويُعدّ».
 *
 * **مِسنَنٌ لا منع**: القائمُ يوم الحارس (مسحُ التوطين `docs/domain-scan/25`) دَينٌ معلَنٌ لكلِّ ملفٍّ بعدده وحجّته؛ **وما يُضاف خارج
 * الحدود يُسقط الحزمة** حتى يُعلَن — **وما يُحذف يُسقطها أيضاً** حتى يُنقص الدَّينُ في ملفّه، فيبقى الدفترُ مطابقاً للشيفرة لا أكبرَ منها.
 */
interface DebtEntry {
  count: number;
  reason: string;
}

describe('🔴 لا علامةَ سعوديةً حرفيةً جديدةً خارج وحدتها — والقائمُ دَينٌ معلَن ينقص ولا يزيد (ق-١٣٥٠)', () => {
  const scan = scanCountryLiterals();
  const debt = (JSON.parse(readFileSync(join(REPO_ROOT, DEBT_FILE), 'utf8')) as { files: Record<string, DebtEntry> }).files;

  it('⓪ المسبارُ يرى: يقرأ الشجرةَ كلَّها، ويُصيب موضعاً معلوماً ولا يُصيب ملفّاً نظيفاً', () => {
    // مصادقةُ المسبار بحالتين (ق-١٣٦) — لا صفرَ على صفر.
    expect(scan.filesScanned).toBeGreaterThan(500);
    expect(countMarkerLines("export const DEFAULT_CURRENCY = 'SAR';")).toBe(1);
    expect(countMarkerLines('// كان هنا \'SAR\' ثابتةً — شرحٌ لا شيفرة')).toBe(0);
    // The official riyal sign is a marker as the character and as its escape.
    expect(countMarkerLines(`const sign = '${String.fromCodePoint(0x20c1)}';`)).toBe(1);
    expect(countMarkerLines(`const sign = '${'\\'}u20C1';`)).toBe(1);
    // الموجبُ المعلوم: بذرةُ عملة الأساس في `company-defaults.ts` (كان `base-amount.util.ts` حتى أسقط `ق-١٣٦٨` ريالَه الثابت).
    expect(scan.outside['apps/api/src/companies/company-defaults.ts']).toBeGreaterThan(0);
    expect(scan.outside['apps/api/src/auth/auth.service.ts']).toBeUndefined();
    // والداخلُ داخل: الهيئةُ ووحدتا الضريبة والإقرار وسجلُّ الأقاليم (مسكنُ قيم الدولة — `ق-١٣٦٨`) لا تُعدّ دَيناً.
    expect(insideSaudiBoundary('apps/api/src/zatca/zatca.service.ts')).toBe(true);
    expect(insideSaudiBoundary('apps/api/src/common/region/regions.ts')).toBe(true);
    expect(insideSaudiBoundary('apps/api/src/invoices/invoices.service.ts')).toBe(false);
    expect(scan.insideLines).toBeGreaterThan(0);
  });

  it('⭐ ① لا ملفَّ خارج الحدود يزيد على دَينه — ولا ملفَّ جديداً بعلامةٍ لم تُعلَن', () => {
    const grown = Object.entries(scan.outside)
      .filter(([file, n]) => n > (debt[file]?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} سطراً والمعلَنُ ${debt[file]?.count ?? 0}`);
    if (grown.length) {
      throw new Error(
        [
          `⛔ ${grown.length} ملفّاً خارج الوحدة السعودية زادت علاماتُه السعودية الحرفية (ق-١٣٥٠):`,
          ...grown.map((g) => `   ${g}`),
          '',
          'النسبةُ من الإعداد، والعملةُ والمنطقةُ الزمنيةُ من المنشأة، وما هو سعوديٌّ يسكن وحدتَه خلف واجهةٍ موحّدة.',
          `وإن لم يكن بدٌّ: أعلنه بحجّته في ${DEBT_FILE} — وأعلن في رأس البناء أنه مسّ افتراضاً سعودياً وأين يسكن.`,
        ].join('\n'),
      );
    }
  });

  it('② الدَّينُ مطابقٌ للشيفرة لا أكبرُ منها — ما نقص يُنقص في دفتره (مِسنَن)', () => {
    const stale = Object.entries(debt)
      .filter(([file, e]) => (scan.outside[file] ?? 0) < e.count)
      .map(([file, e]) => `${file}: المعلَنُ ${e.count} والقائمُ ${scan.outside[file] ?? 0}`);
    expect(stale).toEqual([]);
  });

  it('③ ولا دَينَ بلا حجّة', () => {
    expect(Object.entries(debt).filter(([, e]) => typeof e.reason !== 'string' || e.reason.trim().length < 10)).toEqual([]);
  });
});
