import { IsInt, Max, Min } from 'class-validator';

/**
 * ⚖️ **شهرُ بداية السنة المالية — يغيّره التاجرُ قبل أوّل ترحيل** (توجيه ٢٧٥ · `ق-١٥٨٤`، بحكم صاحب المشروع).
 * رقمُ الشهر (١ يناير … ١٢ ديسمبر)، والسنةُ ميلاديةٌ افتراضاً (١).
 */
export class SetFiscalStartMonthDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
