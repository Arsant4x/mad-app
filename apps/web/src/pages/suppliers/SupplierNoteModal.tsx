import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Purchase, SupplierNoteInput } from '../../api/purchases';
import { fmt, today } from '../../lib/format';

/**
 * Records a supplier's credit or debit note against a purchase invoice. The note
 * is the supplier's own document, so it is recorded, not issued: its reason, date
 * and number as on their paper, with the full lines of the invoice. A full credit
 * note returns stock items to the supplier and takes them off the shelf; a debit
 * note is an extra charge settled with a payment voucher. Posted notes are never
 * edited or deleted; they are corrected with an opposite note.
 */
export function SupplierNoteModal({
  purchase,
  side,
  onCancel,
  onConfirm,
}: {
  purchase: Purchase;
  side: 'credit' | 'debit';
  onCancel: () => void;
  onConfirm: (data: SupplierNoteInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCredit = side === 'credit';

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm({ reason: reason.trim(), date, supplierRef: supplierRef.trim() || undefined });
    } catch (e) {
      // A named server refusal (cap, not enough stock, target not accepted) is shown, never swallowed.
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? t('suppliers.note.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{isCredit ? t('suppliers.note.title_credit') : t('suppliers.note.title_debit')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          {isCredit
            ? t('suppliers.note.intro_credit', { no: purchase.no, total: fmt(purchase.total) })
            : t('suppliers.note.intro_debit', { no: purchase.no, total: fmt(purchase.total) })}
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('suppliers.note.doc_date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('suppliers.note.ref')}</label>
            <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder={t('suppliers.note.ref_placeholder')} />
          </div>
        </div>
        <div className="field">
          <label>{t('suppliers.note.reason')}</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isCredit ? t('suppliers.note.reason_placeholder_credit') : t('suppliers.note.reason_placeholder_debit')} />
        </div>
        {error && <div className="alert-error">{error}</div>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            {t('suppliers.common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!reason.trim() || saving} onClick={submit}>
            {saving ? t('suppliers.note.saving') : t('suppliers.note.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
