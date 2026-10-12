import { useTranslation } from 'react-i18next';
import { buyerDependentLimit, OUT_OF_SCOPE_REASON_MAX, selectableReasonsFor, TAX_CATEGORY_OPTIONS, type LineTaxDraft } from '../lib/vat';

/**
 * The category and reason for a line without an item, the same control in the invoice, the debit note
 * and the quotation. A line with an item inherits its category from the item card at the time of sale
 * and does not show it here; a line without an item must declare a category, and a reason for anything
 * but `S`, so there is no zero rate without a reason. The rate is a read only column derived by the server.
 */
export function LineTaxPicker({ value, onChange, compact = false }: { value: LineTaxDraft; onChange: (next: LineTaxDraft) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const category = value.taxCategory;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <select
        aria-label={t('common.line_tax.category')}
        value={category}
        onChange={(e) => onChange({ taxCategory: e.target.value as LineTaxDraft['taxCategory'] })}
      >
        {TAX_CATEGORY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {compact ? o.short : o.label}
          </option>
        ))}
      </select>
      {(category === 'Z' || category === 'E') && (
        <select aria-label={t('common.line_tax.exemption_reason')} value={value.taxExemptionReasonCode ?? ''} onChange={(e) => onChange({ taxCategory: category, taxExemptionReasonCode: e.target.value || undefined })}>
          <option value="">{t('common.line_tax.reason_from_list')}</option>
          {selectableReasonsFor(category).map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} · {r.ar}
            </option>
          ))}
        </select>
      )}
      {category === 'O' && (
        <input
          aria-label={t('common.line_tax.out_of_scope_reason')}
          value={value.taxExemptionReason ?? ''}
          maxLength={OUT_OF_SCOPE_REASON_MAX}
          placeholder={t('common.line_tax.out_of_scope_placeholder')}
          onChange={(e) => onChange({ taxCategory: 'O', taxExemptionReason: e.target.value })}
        />
      )}
      {category === 'Z' && !compact && <div className="hint">{buyerDependentLimit()}</div>}
    </div>
  );
}
