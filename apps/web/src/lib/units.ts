/**
 * وحداتُ القياس المرمَّزة — نسخةُ الواجهة من `apps/api/src/common/units/units.ts` (① · ق-١٠٦٩).
 * رموزُ UN/ECE Recommendation 20 كما توصي بها الهيئة في `BT-130`؛ والتعبئةُ برموز التوصية 21
 * بسابقة `X`. القائمةُ مغلقة: الوحدةُ تُعلَن من هنا ولا تُكتب نصّاً.
 * ⚠️ الرموزُ والترتيبُ يجب أن يطابقا نسخةَ الخادم حرفياً — حارسُ `units.spec.ts` في الخادم يقرأ هذا الملفّ.
 */
export interface UnitOfMeasure {
  code: string;
  ar: string;
}

export const UNITS_OF_MEASURE: readonly UnitOfMeasure[] = [
  { code: 'H87', ar: 'قطعة' },
  { code: 'C62', ar: 'وحدة' },
  { code: 'KGM', ar: 'كيلوغرام' },
  { code: 'GRM', ar: 'غرام' },
  { code: 'TNE', ar: 'طنّ' },
  { code: 'LTR', ar: 'لتر' },
  { code: 'MLT', ar: 'مليلتر' },
  { code: 'MTR', ar: 'متر' },
  { code: 'CMT', ar: 'سنتيمتر' },
  { code: 'MTK', ar: 'متر مربّع' },
  { code: 'MTQ', ar: 'متر مكعّب' },
  { code: 'HUR', ar: 'ساعة' },
  { code: 'DAY', ar: 'يوم' },
  { code: 'MON', ar: 'شهر' },
  { code: 'SET', ar: 'طقم' },
  { code: 'PR', ar: 'زوج' },
  { code: 'DZN', ar: 'دزينة' },
  { code: 'XBX', ar: 'صندوق' },
  { code: 'XCT', ar: 'كرتون' },
  { code: 'XPK', ar: 'عبوة' },
  { code: 'XBG', ar: 'كيس' },
  { code: 'XBO', ar: 'زجاجة' },
  { code: 'XCA', ar: 'علبة' },
];

export function unitLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return UNITS_OF_MEASURE.find((u) => u.code === code)?.ar ?? code;
}
