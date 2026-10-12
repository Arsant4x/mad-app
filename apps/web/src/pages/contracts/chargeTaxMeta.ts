import type { ChargeTaxTreatment, DeclaredChargeTaxTreatment, DeductionKind } from '../../api/contracts';
import i18n from '../../i18n';

/**
 * Tax treatment of a claim and of a deposit deduction: its labels and which
 * treatments each deduction kind allows, matching `deductionTreatmentFor` on the
 * server (the server decides and names the error).
 */
export const CHARGE_TREATMENT_LABEL: Record<ChargeTaxTreatment, string> = {
  get TAXABLE_SERVICE() { return i18n.t('contracts.charge_tax.taxable_service'); },
  get ON_BEHALF() { return i18n.t('contracts.charge_tax.on_behalf'); },
  get COMPENSATION() { return i18n.t('contracts.charge_tax.compensation'); },
  get LEGACY_UNTAXED() { return i18n.t('contracts.charge_tax.legacy_untaxed'); },
};

export const CLAIM_TREATMENT_OPTIONS: DeclaredChargeTaxTreatment[] = ['TAXABLE_SERVICE', 'ON_BEHALF', 'COMPENSATION'];

/** Choices per deduction kind; `null` means no choice (damage and unpaid rent carry no treatment, cleaning is always taxable). */
export const DEDUCTION_TREATMENT_OPTIONS: Record<DeductionKind, DeclaredChargeTaxTreatment[] | null> = {
  UNPAID_RENT: null,
  DAMAGE: null,
  CLEANING: null,
  UTILITIES: ['TAXABLE_SERVICE', 'ON_BEHALF'],
  OTHER: ['TAXABLE_SERVICE', 'COMPENSATION'],
};
