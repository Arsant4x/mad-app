import { useTranslation } from 'react-i18next';

/**
 * The share of a mixed contract: a percentage the lessor declares with its basis,
 * no area required. Shared by creation, renewal and declaring a legacy contract,
 * so the fields are written once.
 *
 * One contract holding an exempt residential part and a taxable part is split by
 * what reflects their values, and the lessor is responsible for the split; so the
 * exempt share in percent and its basis (area, market value, ...) are declared.
 * The server names what is missing.
 */
export function MixedShareFields({
  idPrefix,
  percent,
  onPercent,
  basis,
  onBasis,
}: {
  idPrefix: string;
  percent: string;
  onPercent: (v: string) => void;
  basis: string;
  onBasis: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="two-col">
      <div className="field">
        <label htmlFor={`${idPrefix}-exempt-share`}>{t('contracts.mixed.exempt_share')}</label>
        <input id={`${idPrefix}-exempt-share`} className="num" type="number" min="0.01" max="99.99" step="0.01" value={percent} onChange={(e) => onPercent(e.target.value)} placeholder={t('contracts.mixed.exempt_share_placeholder')} />
        <p className="hint" style={{ marginTop: 4 }}>{t('contracts.mixed.exempt_share_hint')}</p>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-exempt-basis`}>{t('contracts.mixed.basis')}</label>
        <input id={`${idPrefix}-exempt-basis`} value={basis} onChange={(e) => onBasis(e.target.value)} placeholder={t('contracts.mixed.basis_placeholder')} />
      </div>
    </div>
  );
}

/** What to send: the share and its basis for a mixed contract, nothing otherwise (the server rejects a share on any other kind). */
export function mixedSharePayload(classification: string, percent: string, basis: string) {
  if (classification !== 'MIXED') return {};
  const p = Number(percent);
  return { ...(percent.trim() !== '' && Number.isFinite(p) ? { exemptSharePercent: p } : {}), ...(basis.trim() ? { exemptShareBasis: basis.trim() } : {}) };
}
