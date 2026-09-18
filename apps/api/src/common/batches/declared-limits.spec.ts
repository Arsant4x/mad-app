import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../source-scan.util';
import { BATCH_FEFO_DECLARED_LIMITS } from './declared-limits';

/** يقرأ ملفَّ الواجهة نصّاً ويطابق سلاسلَ معلَنة — حارسُ `ق-٣٧٥` يقرأ هذه العلامة. */
readsDeclaredStrings();

/**
 * ٥+٦ الحدودُ الثلاثة المعلَنة في وجه ما بُني (`ق-١٠٨٥`): نصٌّ واحد في الخادم (يردّه تقريرُ قرب الانتهاء) ونسخةٌ في
 * الواجهة (`apps/web/src/lib/batchLimits.ts`) تُعرض في بطاقة الصنف وإدخال الدفعة والتقرير — **فإن افترقتا قرأ التاجرُ حدّاً
 * غيرَ الحدّ**. ثلاثةٌ لا أقلّ: البحثُ الجزئيّ · لا جلسة · لا نموذج.
 */
describe('٥+٦ الحدودُ المعلَنة في وجه ما بُني — الخادمُ والواجهةُ نصٌّ واحد', () => {
  const webFile = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'lib', 'batchLimits.ts');

  it('ثلاثةُ حدود، لكلٍّ رقمُه وموضوعُه', () => {
    expect(BATCH_FEFO_DECLARED_LIMITS).toHaveLength(3);
    expect(BATCH_FEFO_DECLARED_LIMITS[0]).toContain('حدٌّ معلَن ①');
    expect(BATCH_FEFO_DECLARED_LIMITS[1]).toContain('حدٌّ معلَن ②');
    expect(BATCH_FEFO_DECLARED_LIMITS[2]).toContain('حدٌّ معلَن ③');
  });

  it('نسخةُ الواجهة تحمل الحدودَ الثلاثة حرفياً', () => {
    const text = readFileSync(webFile, 'utf8');
    expect(text.length).toBeGreaterThan(100);
    for (const limit of BATCH_FEFO_DECLARED_LIMITS) expect(text).toContain(limit);
    expect((text.match(/حدٌّ معلَن/g) ?? []).length).toBe(3);
  });
});
