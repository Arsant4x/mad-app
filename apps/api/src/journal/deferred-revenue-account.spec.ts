import { DEFAULT_CHART } from '../accounts/default-chart';
import { CODE_BAND_GROUPS } from '../accounts/code-bands';
import { DEFERRED_REVENUE_ACCOUNT_CODE, DEFERRED_REVENUE_ACCOUNT_NAME } from './deferred-revenue-account.util';

/**
 * **رمزُ الإيراد المؤجَّل ثابتٌ لا مشتقّ** (`ق-٤٧٠`).
 *
 * أمرُ المالك الأوّل كان اشتقاقَه بـ`MAX+1` كما في الأدراج، **ونُقض بحجّةٍ
 * مقيسة**: النطاقُ لحساباتٍ **كثيرةٍ من نوعٍ واحد**، وهذا **واحدٌ لكلّ منشأة**
 * — **و`resolveAccountIds` يقرأ الحسابَ برمزه، ورمزٌ يختلف بين المنشآت لا
 * يُقرأ برمز**.
 *
 * فهذا الحارس يثبت الحدَّ الذي تقوم عليه تلك الحجّة **من المصدر لا من قائمة**:
 * **الرمزُ الثابت خارجَ كلِّ نطاقٍ يُولَّد منه رمز** — فلا يصطدم يوماً بحسابٍ
 * أنشأه التاجر ببنكٍ أو درج.
 */
function inAnyBand(code: string): boolean {
  const n = Number(code);
  return CODE_BAND_GROUPS.some((g) => g.bands.some((b) => n >= b.min && n <= b.max));
}

describe('رمزُ الإيراد المؤجَّل ثابتٌ ولا يصطدم بمولِّد (ق-٤٧٠)', () => {
  it('🔴 مسجَّلٌ في الدليل الافتراضي التزاماً — للمنشآت الجديدة', () => {
    const row = DEFAULT_CHART.find((a) => a.code === DEFERRED_REVENUE_ACCOUNT_CODE);
    // مجسٌّ للمجسّ: غيابُ الصفّ يعني أن الدليل لا يحمله — لا أن الاختبار نظيف.
    if (!row) throw new Error(`الدليلُ الافتراضي لا يحمل ${DEFERRED_REVENUE_ACCOUNT_CODE}`);
    expect(row.type).toBe('liability');
    expect(row.name).toBe(DEFERRED_REVENUE_ACCOUNT_NAME);
  });

  it('🔴 وخارجَ كلِّ نطاقٍ مشتقّ — فلا يصطدم برمزِ بنكٍ أو درجٍ يُولَّد', () => {
    expect(inAnyBand(DEFERRED_REVENUE_ACCOUNT_CODE)).toBe(false);
  });

  it('والفحصُ مُثبَتٌ بحالتَين: يُدين رمزاً داخل نطاق الأدراج ويقبل الذي خارجه', () => {
    const drawerBand = CODE_BAND_GROUPS.find((g) => g.key === 'drawer');
    if (!drawerBand) throw new Error('مجموعةُ الأدراج غائبةٌ عن النطاقات');
    expect(inAnyBand(String(drawerBand.bands[0].min))).toBe(true);
    expect(inAnyBand(DEFERRED_REVENUE_ACCOUNT_CODE)).toBe(false);
  });

  it('ولا يُكرَّر رمزُه في الدليل — فحسابٌ واحدٌ لكلّ منشأة', () => {
    const rows = DEFAULT_CHART.filter((a) => a.code === DEFERRED_REVENUE_ACCOUNT_CODE);
    expect(rows).toHaveLength(1);
  });
});
