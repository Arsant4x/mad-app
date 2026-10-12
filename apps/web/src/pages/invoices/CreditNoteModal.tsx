import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '../../api/invoices';
import { fmt } from '../../lib/format';

/**
 * Issues a ZATCA 381 credit note against an invoice — a full credit of the
 * whole document (partial credits exist in the API but aren't surfaced yet).
 * The reason is mandatory: the authority rejects a note without one, so the
 * button stays disabled until it's given.
 */
export function CreditNoteModal({ invoice, onCancel, onConfirm }: { invoice: Invoice; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{t('invoices.credit_note.title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          {invoice.docType === 'DEBIT_NOTE'
            ? t('invoices.credit_note.hint_on_debit_note', { no: invoice.no, total: fmt(invoice.total) })
            : t('invoices.credit_note.hint_on_invoice', { no: invoice.no, total: fmt(invoice.total) })}
        </div>
        <div className="field">
          <label>{t('invoices.common.reason_label')}</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('invoices.credit_note.reason_placeholder')} />
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('invoices.common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {t('invoices.common.issue_note')}
          </button>
        </div>
      </div>
    </div>
  );
}
