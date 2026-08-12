import { BadRequestException } from '@nestjs/common';
import { assertNoCycle, Edge, wouldCreateCycle } from './cycle-guard';
import { MSG } from '../common/i18n/messages';

/**
 * حارس منع الدورات.
 *
 * **الخطر ليس بيانات خاطئة بل انهيار**: حلقة أ→ب→ج→أ تجعل حساب التقاطع
 * يدور بلا نهاية أو ينفد المكدّس — فيسقط الطلب بخطأ 500 غامض بدل رفضٍ
 * مفهوم. والرفض هنا **قبل الكتابة** وبنصٍّ عربي يشرح السبب.
 */
const e = (grantorId: string, granteeId: string): Edge => ({ grantorId, granteeId });

describe('منع الدورات في شجرة التفويض', () => {
  const chain = [e('owner', 'a'), e('a', 'b'), e('b', 'c')];

  it('التفويض إلى الأسفل مسموح — لا دورة', () => {
    expect(wouldCreateCycle(chain, 'c', 'd')).toBe(false);
    expect(wouldCreateCycle(chain, 'owner', 'x')).toBe(false);
  });

  it('⭐ أ→ب→ج ثم ج→أ يُرفض — الحلقة تُغلق', () => {
    expect(wouldCreateCycle(chain, 'c', 'a')).toBe(true);
  });

  it('والحلقة القصيرة كذلك: ب→أ وأ يفوّض ب', () => {
    expect(wouldCreateCycle(chain, 'b', 'a')).toBe(true);
  });

  it('التفويض للنفس أقصر دورة', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
  });

  it('والرجوع إلى الجذر يُرفض — ج→المالك', () => {
    expect(wouldCreateCycle(chain, 'c', 'owner')).toBe(true);
  });

  it('⚠️ لا ينهار على دورةٍ قائمة سلفاً في البيانات', () => {
    // حارسٌ ينهار على المدخل الذي يحرس منه ليس حارساً.
    const corrupt = [e('a', 'b'), e('b', 'a')];
    expect(() => wouldCreateCycle(corrupt, 'b', 'z')).not.toThrow();
    expect(wouldCreateCycle(corrupt, 'b', 'z')).toBe(false);
  });

  it('يرفض بنصّ عربي مترجَم — لا بانهيار ولا برسالة تقنية', () => {
    expect(() => assertNoCycle(chain, 'c', 'a')).toThrow(BadRequestException);
    expect(() => assertNoCycle(chain, 'c', 'a')).toThrow(MSG.delegation_cycle_rejected);
    expect(() => assertNoCycle(chain, 'c', 'd')).not.toThrow();
  });

  it('الفروع المتوازية لا تُخلط بالدورات', () => {
    const branched = [e('owner', 'a'), e('owner', 'b'), e('a', 'x'), e('b', 'y')];
    // x وy في فرعين مختلفين — التفويض بينهما لا يخلق دورة.
    expect(wouldCreateCycle(branched, 'x', 'y')).toBe(false);
    // لكن الرجوع إلى المالك يخلقها.
    expect(wouldCreateCycle(branched, 'x', 'owner')).toBe(true);
  });
});
