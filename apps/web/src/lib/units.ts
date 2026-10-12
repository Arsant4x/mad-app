import { translateField } from './labelTable';

/**
 * Coded units of measure, the web copy of `apps/api/src/common/units/units.ts`.
 * UN/ECE Recommendation 20 codes as recommended for `BT-130`; packaging uses Recommendation 21 codes
 * with an `X` prefix. The list is closed: a unit is declared from here, never typed as text.
 * The codes, order and Arabic names must match the server copy exactly; `units.spec.ts` on the server
 * reads this file. The name shown comes from `common.units` and follows the interface language.
 */
export interface UnitOfMeasure {
  code: string;
  /** The unit name in the current interface language. */
  ar: string;
}

export const UNITS_OF_MEASURE: readonly UnitOfMeasure[] = [
  { code: 'H87', ar: 'قطعة' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'C62', ar: 'وحدة' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'KGM', ar: 'كيلوغرام' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'GRM', ar: 'غرام' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'TNE', ar: 'طنّ' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'LTR', ar: 'لتر' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'MLT', ar: 'مليلتر' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'MTR', ar: 'متر' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'CMT', ar: 'سنتيمتر' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'MTK', ar: 'متر مربّع' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'MTQ', ar: 'متر مكعّب' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'HUR', ar: 'ساعة' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'DAY', ar: 'يوم' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'MON', ar: 'شهر' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'SET', ar: 'طقم' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'PR', ar: 'زوج' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'DZN', ar: 'دزينة' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'XBX', ar: 'صندوق' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'XCT', ar: 'كرتون' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'XPK', ar: 'عبوة' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'XBG', ar: 'كيس' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'XBO', ar: 'زجاجة' }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'XCA', ar: 'علبة' }, // i18n-exempt: Arabic mirror compared with the server list
];
for (const u of UNITS_OF_MEASURE) translateField(u, 'ar', `common.units.${u.code.toLowerCase()}`);

export function unitLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return UNITS_OF_MEASURE.find((u) => u.code === code)?.ar ?? code;
}
