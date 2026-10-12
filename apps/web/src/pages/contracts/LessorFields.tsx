import { useTranslation } from 'react-i18next';

/**
 * Who the lessor is on the contract. Shared by renewal and by declaring a legacy
 * contract, so the fields are written once.
 *
 * Declared on an operated property, never assumed: either the company is the
 * lessor (the rent is its revenue and commercial VAT is its own), or the owner is
 * the lessor and the company is the owner's agent (the rent is held for the owner
 * and the commission is the company's revenue with its VAT). The server checks
 * every condition and names what is missing.
 */
export type DeclaredLessorChoice = 'COMPANY' | 'OWNER' | '';

export function LessorFields({
  idPrefix,
  lessor,
  onLessor,
  ownerName,
  onOwnerName,
  ownerVatNumber,
  onOwnerVatNumber,
  commercial,
}: {
  idPrefix: string;
  lessor: DeclaredLessorChoice;
  onLessor: (v: DeclaredLessorChoice) => void;
  ownerName: string;
  onOwnerName: (v: string) => void;
  ownerVatNumber: string;
  onOwnerVatNumber: (v: string) => void;
  commercial: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="two-col">
      <div className="field">
        <label htmlFor={`${idPrefix}-lessor`}>{t('contracts.lessor.label')}</label>
        <select id={`${idPrefix}-lessor`} value={lessor} onChange={(e) => onLessor(e.target.value as DeclaredLessorChoice)}>
          <option value="">{t('contracts.lessor.choose')}</option>
          <option value="COMPANY">{t('contracts.lessor.company')}</option>
          <option value="OWNER">{t('contracts.lessor.owner')}</option>
        </select>
        {lessor === 'OWNER' && (
          <p className="hint" style={{ marginTop: 4 }}>
            {t('contracts.lessor.owner_hint_start')}<b>{t('contracts.lessor.owner_hint_bold')}</b>.
          </p>
        )}
      </div>
      {lessor === 'OWNER' && (
        <div className="field">
          <label htmlFor={`${idPrefix}-owner-name`}>{t('contracts.lessor.owner_name')}</label>
          <input id={`${idPrefix}-owner-name`} value={ownerName} onChange={(e) => onOwnerName(e.target.value)} placeholder={t('contracts.lessor.owner_name_placeholder')} />
          <label htmlFor={`${idPrefix}-owner-vat`} style={{ marginTop: 6 }}>
            {t('contracts.lessor.owner_vat')}{commercial ? '' : t('contracts.lessor.owner_vat_optional')}
          </label>
          <input id={`${idPrefix}-owner-vat`} className="num" value={ownerVatNumber} onChange={(e) => onOwnerVatNumber(e.target.value)} placeholder={t('contracts.lessor.owner_vat_placeholder')} />
        </div>
      )}
    </div>
  );
}

/** The fields to send; nothing when no lessor is chosen (the server names what is missing on an operated property). */
export function lessorPayload(lessor: DeclaredLessorChoice, ownerName: string, ownerVatNumber: string) {
  if (!lessor) return {};
  if (lessor === 'COMPANY') return { lessor };
  return { lessor, ownerName: ownerName.trim(), ownerVatNumber: ownerVatNumber.trim() || undefined };
}
