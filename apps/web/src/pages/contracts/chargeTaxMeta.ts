import type { ChargeTaxTreatment, DeclaredChargeTaxTreatment, DeductionKind } from '../../api/contracts';

/**
 * ⚖️ **معاملةُ المطالبة والخصم من التأمين الضريبية** (الأسئلة ٤٩ و٥١ و٤١٣ و٤١٤ · ق-١٦٠٠) — تسمياتُها وما يجوز منها لكلِّ خصم،
 * مطابقاً `deductionTreatmentFor` في الخادم (والخادمُ يحكم ويسمّي الخطأ).
 */
export const CHARGE_TREATMENT_LABEL: Record<ChargeTaxTreatment, string> = {
  TAXABLE_SERVICE: 'خدمة خاضعة للضريبة',
  ON_BEHALF: 'مبلغ مدفوع نيابةً عن المستأجر',
  COMPENSATION: 'تعويض عن ضرر (بلا ضريبة)',
  LEGACY_UNTAXED: 'قديمة بلا ضريبة',
};

export const CLAIM_TREATMENT_OPTIONS: DeclaredChargeTaxTreatment[] = ['TAXABLE_SERVICE', 'ON_BEHALF', 'COMPENSATION'];

/** ما يُختار لكلِّ نوع خصم — `null`: لا اختيار (الضررُ والإيجارُ غيرُ المسدَّد بلا معاملة، والنظافةُ خاضعةٌ دائماً). */
export const DEDUCTION_TREATMENT_OPTIONS: Record<DeductionKind, DeclaredChargeTaxTreatment[] | null> = {
  UNPAID_RENT: null,
  DAMAGE: null,
  CLEANING: null,
  UTILITIES: ['TAXABLE_SERVICE', 'ON_BEHALF'],
  OTHER: ['TAXABLE_SERVICE', 'COMPENSATION'],
};
