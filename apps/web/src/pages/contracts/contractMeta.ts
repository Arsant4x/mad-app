import type { ContractClassification, ContractVatInclusion, DeclaredClassification, DeclaredVatInclusion } from '../../api/contracts';
import i18n from '../../i18n';

// Labels are getters so they follow the language chosen at render time.
export const CYCLE_LABEL: Record<string, string> = {
  get monthly() { return i18n.t('contracts.meta.cycle.monthly'); },
  get quarterly() { return i18n.t('contracts.meta.cycle.quarterly'); },
  get semiannual() { return i18n.t('contracts.meta.cycle.semiannual'); },
  get annual() { return i18n.t('contracts.meta.cycle.annual'); },
};

/** Declaration choices, without the legacy value: it is never offered for a new contract. */
export const CLASSIFICATION_OPTIONS: { value: DeclaredClassification; label: string }[] = [
  { value: 'RESIDENTIAL', get label() { return i18n.t('contracts.meta.classification_option.residential'); } },
  { value: 'COMMERCIAL', get label() { return i18n.t('contracts.meta.classification_option.commercial'); } },
  // Serviced lodging is taxable even when it is housing; a mixed contract is split by a share the lessor declares.
  { value: 'SERVICED_LODGING', get label() { return i18n.t('contracts.meta.classification_option.serviced_lodging'); } },
  { value: 'MIXED', get label() { return i18n.t('contracts.meta.classification_option.mixed'); } },
];
export const VAT_INCLUSION_OPTIONS: { value: DeclaredVatInclusion; label: string }[] = [
  { value: 'EXCLUSIVE', get label() { return i18n.t('contracts.meta.vat_inclusion.exclusive'); } },
  { value: 'INCLUSIVE', get label() { return i18n.t('contracts.meta.vat_inclusion.inclusive'); } },
];
export const CLASSIFICATION_LABEL: Record<ContractClassification, string> = {
  get RESIDENTIAL() { return i18n.t('contracts.meta.classification.residential'); },
  get COMMERCIAL() { return i18n.t('contracts.meta.classification.commercial'); },
  get SERVICED_LODGING() { return i18n.t('contracts.meta.classification.serviced_lodging'); },
  get MIXED() { return i18n.t('contracts.meta.classification.mixed'); },
  get LEGACY_UNCLASSIFIED() { return i18n.t('contracts.meta.classification.legacy_unclassified'); },
};
export const VAT_INCLUSION_LABEL: Record<ContractVatInclusion, string> = {
  get INCLUSIVE() { return i18n.t('contracts.meta.vat_inclusion.inclusive'); },
  get EXCLUSIVE() { return i18n.t('contracts.meta.vat_inclusion.exclusive'); },
  get LEGACY_UNDECLARED() { return i18n.t('contracts.meta.vat_inclusion.legacy_undeclared'); },
};
export const isLegacyContract = (c: { classification: ContractClassification; vatInclusion: ContractVatInclusion }) =>
  c.classification === 'LEGACY_UNCLASSIFIED' || c.vatInclusion === 'LEGACY_UNDECLARED';

/** Does the tenant pay VAT on this rent? Commercial, serviced, and mixed for its taxable part (matches `isTaxedKind` on the server). */
export const isTaxedClassification = (classification: string) => classification === 'COMMERCIAL' || classification === 'SERVICED_LODGING' || classification === 'MIXED';

/**
 * The share of an installment that VAT is computed on: 1 when fully taxable,
 * `1 − exempt share` when mixed, 0 when exempt or legacy.
 * For display and suggestions only: the posted figure and each installment's gross come from the server.
 */
export function taxedShareOf(contract: { classification: string; exemptSharePercent?: string | null }): number {
  if (contract.classification === 'COMMERCIAL' || contract.classification === 'SERVICED_LODGING') return 1;
  if (contract.classification === 'MIXED') {
    const exempt = Number(contract.exemptSharePercent ?? NaN);
    return Number.isFinite(exempt) && exempt > 0 && exempt < 100 ? 1 - exempt / 100 : 0;
  }
  return 0;
}
