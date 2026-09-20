import { BUYER_DEPENDENT_LIMIT, OUT_OF_SCOPE_REASON_MAX, selectableReasonsFor, TAX_CATEGORY_OPTIONS, type LineTaxDraft } from '../lib/vat';

/**
 * ⑧ الفئةُ والسبب لسطرٍ بلا صنف — بدل «١٥٪ / ٠٪ (معفى)» (`ق-١٢١١`/③ · النموذجُ المرئيّ المُقرّ `ق-١٢٢٢`).
 *
 * الشاشةُ نفسُها في الفاتورة والإشعار المدين وعرض السعر. السطرُ الذي يحمل صنفاً يرث فئتَه من بطاقته
 * لحظةَ البيع ولا يعرضها للتعديل هنا؛ والسطرُ بلا صنفٍ **يُلزَم** بالفئة، وبالسبب لغير `S` — فلا
 * «٠٪ (معفى)» بلا سبب. والنسبةُ عمودٌ للقراءة يشتقّه الخادم.
 */
export function LineTaxPicker({ value, onChange, compact = false }: { value: LineTaxDraft; onChange: (next: LineTaxDraft) => void; compact?: boolean }) {
  const category = value.taxCategory;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <select
        aria-label="فئة الضريبة"
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
        <select aria-label="سبب الإعفاء" value={value.taxExemptionReasonCode ?? ''} onChange={(e) => onChange({ taxCategory: category, taxExemptionReasonCode: e.target.value || undefined })}>
          <option value="">— السبب من قائمة الهيئة —</option>
          {selectableReasonsFor(category).map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} · {r.ar}
            </option>
          ))}
        </select>
      )}
      {category === 'O' && (
        <input
          aria-label="سبب خارج النطاق"
          value={value.taxExemptionReason ?? ''}
          maxLength={OUT_OF_SCOPE_REASON_MAX}
          placeholder="سببٌ يُكتب لكل حالة — يخرج للهيئة"
          onChange={(e) => onChange({ taxCategory: 'O', taxExemptionReason: e.target.value })}
        />
      )}
      {category === 'Z' && !compact && <div className="hint">{BUYER_DEPENDENT_LIMIT}</div>}
    </div>
  );
}
