import { round2 } from '../common/money/rounding';
import { RENT_VAT_RATE } from './rent-tax-point.util';

/**
 * ⚖️ **ضريبةُ المطالبة والخصم الخاضعَين** (الأسئلة ٤٩ و٥١ و٤١٣ و٤١٤ · `ق-١٦٠٠` · `ق-١٦٠٩`/د).
 *
 * - **المطالبةُ** مبلغُها صافٍ والضريبةُ فوقه (`chargeTaxOn`): يُكتب «صيانةٌ بخمسمئة» فيدين المستأجرُ خمسمئةً وضريبتَها، كسطر
 *   الفاتورة (السعرُ قبل الضريبة) — تطبيقٌ معلَنٌ يُعرض على صاحب المشروع (توجيه ٢٧٦).
 * - **والخصمُ من التأمين** مبلغُه إجماليٌّ والضريبةُ منه (`chargeTaxIn`): مالٌ مأخوذٌ من وديعةٍ ثابتة، فما خُصم هو ما خرج منها.
 *
 * والنسبةُ من مصدرها الواحد عبر `RENT_VAT_RATE` (`ق-١٢١٢`) لا رقماً هنا.
 */
export function chargeTaxOn(net: number): number {
  return round2(net * RENT_VAT_RATE);
}

export function chargeTaxIn(gross: number): number {
  return round2((gross * RENT_VAT_RATE) / (1 + RENT_VAT_RATE));
}
