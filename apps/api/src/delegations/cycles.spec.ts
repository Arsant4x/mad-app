import { BadRequestException } from '@nestjs/common';
import { assertNoCycle, Edge, wouldCreateCycle } from './cycles';
import { MSG } from '../common/i18n/messages';
import { effectiveGrants } from './intersection';
import { Grant } from './permission-tree';

/**
 * حارس منع الدورات.
 *
 * **الخطر ليس صلاحيةً خاطئة بل تعليق الطلب**: حساب التقاطع يمشي على السلسلة،
 * فحلقةٌ مغلقة تعني دوراناً بلا نهاية — لا رسالة ولا سجل، فقط انتظار.
 *
 * ⚠️ **والفخّ المعتاد: فحص الطرفين وحدهما.** `grantor !== grantee` يمرّ على
 * الدورة غير المباشرة (أ→ب→ج→أ) مروراً كاملاً. فالحارس يفحص **الوصول**
 * لا التساوي.
 */
const e = (grantorId: string, granteeId: string): Edge => ({ grantorId, granteeId });

describe('منع الدورات في شجرة التفويض', () => {
  it('التفويض العادي لا يُرفض', () => {
    expect(wouldCreateCycle([e('أ', 'ب')], 'ب', 'ج')).toBe(false);
    expect(wouldCreateCycle([], 'أ', 'ب')).toBe(false);
  });

  it('الدورة الذاتية مرفوضة — أ يفوّض نفسه', () => {
    expect(wouldCreateCycle([], 'أ', 'أ')).toBe(true);
  });

  it('الدورة المباشرة مرفوضة — أ→ب ثم ب→أ', () => {
    expect(wouldCreateCycle([e('أ', 'ب')], 'ب', 'أ')).toBe(true);
  });

  it('⚠️ الدورة غير المباشرة مرفوضة — أ→ب→ج ثم ج→أ', () => {
    // هنا يمرّ فحصُ `grantor !== grantee` مروراً كاملاً.
    const edges = [e('أ', 'ب'), e('ب', 'ج')];
    expect(edges.some((x) => x.grantorId === 'ج' && x.granteeId === 'أ')).toBe(false); // لا حافة مباشرة
    expect(wouldCreateCycle(edges, 'ج', 'أ')).toBe(true);
  });

  it('سلسلة طويلة: أ→ب→ج→د ثم د→أ', () => {
    expect(wouldCreateCycle([e('أ', 'ب'), e('ب', 'ج'), e('ج', 'د')], 'د', 'أ')).toBe(true);
  });

  it('التفرّع لا يُخلط بالدورة — شجرةٌ عريضة تبقى مقبولة', () => {
    const edges = [e('أ', 'ب'), e('أ', 'ج'), e('ب', 'د'), e('ج', 'د')];
    expect(wouldCreateCycle(edges, 'د', 'هـ')).toBe(false);
    expect(wouldCreateCycle(edges, 'د', 'أ')).toBe(true);
  });

  it('الرفض بنصّ عربي واضح — لا انهيار ولا استثناء تقني', () => {
    expect(() => assertNoCycle([e('أ', 'ب')], 'ب', 'أ')).toThrow(BadRequestException);
    expect(() => assertNoCycle([e('أ', 'ب')], 'ب', 'أ')).toThrow(MSG.delegation_cycle_rejected);
    expect(() => assertNoCycle([e('أ', 'ب')], 'ب', 'ج')).not.toThrow();
  });

  /**
   * ⭐ الحارس يقف حيث الخطر: يُثبت **أن الخطر حقيقي** لا أن الدالة تعمل.
   *
   * لو مرّت دورةٌ إلى التقاطع، فالسلسلة المُمرَّرة إليه ستكون بلا نهاية.
   * هنا نبني سلسلةً طولها 5000 حلقة — نظير ما تنتجه دورةٌ لم تُمنع — ونتأكد
   * أن التقاطع **ينتهي** بفضل خروجه المبكر عند الفراغ، فلا يتحوّل المنع إلى
   * خطّ الدفاع الوحيد.
   */
  it('التقاطع نفسه لا يعلّق على سلسلة طويلة — المنع طبقةٌ لا شرط بقاء', () => {
    const root = new Set<Grant>(['contracts:view' as Grant]);
    const long = Array.from({ length: 5000 }, () => ({
      grantorId: 'x',
      granteeId: 'y',
      granted: new Set<Grant>(['contracts:view' as Grant]),
      revoked: false,
    }));
    const t = Date.now();
    expect(effectiveGrants(root, long).size).toBe(1);
    expect(Date.now() - t).toBeLessThan(2000);
  });
});
