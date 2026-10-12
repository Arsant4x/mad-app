import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceLineInput } from '../../api/invoices';
import { fmt } from '../../lib/format';
import { lineTaxDraftError, lineTaxPayload, rateForCategory, STANDARD_LINE_TAX, type LineTaxDraft } from '../../lib/vat';
import { LineTaxPicker } from '../../components/LineTaxPicker';

/** A line carries its tax category (with its reason), not a chosen rate — as in the invoice builder. */
interface DebitLineDraft {
  description: string;
  quantity: number;
  unitPrice: number;
  tax: LineTaxDraft;
}

function toInput(l: DebitLineDraft): InvoiceLineInput {
  return { description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, ...lineTaxPayload(l.tax) };
}

/**
 * Issues a ZATCA 383 debit note — additional billing against an already-issued
 * invoice (an undercharge, an unbilled delivery cost).
 *
 * Deliberately starts with one **empty** line rather than copying the original
 * invoice: a debit note adds to what was billed, so pre-filling it with the
 * original's lines would make accidental double-billing the default gesture.
 * The server enforces the same rule (lines are required, no full-copy fallback).
 */
export function DebitNoteModal({
  invoice,
  onCancel,
  onConfirm,
}: {
  invoice: Invoice;
  onCancel: () => void;
  onConfirm: (reason: string, lines: InvoiceLineInput[]) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DebitLineDraft[]>([{ description: '', quantity: 1, unitPrice: 0, tax: STANDARD_LINE_TAX }]);

  function updateLine(index: number, patch: Partial<DebitLineDraft>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  // Preview only, with the rate derived from the category; the server's figures are authoritative.
  const tax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (rateForCategory(l.tax.taxCategory) / 100), 0);
  // Every line must actually bill something — a zero-value note is a document
  // issued to the authority that says nothing. And a Z/E/O line without its
  // reason is refused here as the server refuses it.
  const taxProblem = lines.map((l, i) => ({ i, msg: lineTaxDraftError(l.tax) })).find((x) => x.msg);
  const valid = reason.trim() !== '' && !taxProblem && lines.every((l) => l.description.trim() !== '' && l.quantity > 0 && l.unitPrice > 0);

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{t('invoices.debit_note.title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          {invoice.docType === 'CREDIT_NOTE'
            ? t('invoices.debit_note.hint_on_credit_note', { no: invoice.no, total: fmt(invoice.total) })
            : t('invoices.debit_note.hint_on_invoice', { no: invoice.no })}
        </div>
        <div className="field">
          <label>{t('invoices.common.reason_label')}</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('invoices.debit_note.reason_placeholder')} />
        </div>

        <table className="line-items">
          <thead>
            <tr>
              <th>{t('invoices.common.col_description')}</th>
              <th style={{ width: 55 }}>{t('invoices.common.col_quantity')}</th>
              <th style={{ width: 95 }}>{t('invoices.common.col_price')}</th>
              <th style={{ width: 210 }}>{t('invoices.common.col_tax_category')}</th>
              <th style={{ width: 55 }}>{t('invoices.common.col_rate')}</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                </td>
                <td>
                  <input className="num" value={l.quantity} onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })} />
                </td>
                <td>
                  <input className="num" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                </td>
                <td>
                  <LineTaxPicker compact value={l.tax} onChange={(tax) => updateLine(i, { tax })} />
                </td>
                <td className="num">{t('invoices.common.rate_pct', { rate: rateForCategory(l.tax.taxCategory) })}</td>
                <td>
                  {lines.length > 1 && (
                    <button className="remove-line" onClick={() => setLines((ls) => ls.filter((_, x) => x !== i))}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add-line" onClick={() => setLines((ls) => [...ls, { description: '', quantity: 1, unitPrice: 0, tax: STANDARD_LINE_TAX }])}>
          {t('invoices.common.add_line')}
        </button>

        {taxProblem && (
          <p className="error-text" style={{ marginTop: 8 }}>
            {t('invoices.common.line_error', { n: taxProblem.i + 1, msg: taxProblem.msg })}
          </p>
        )}

        <div className="hint" style={{ marginTop: 10 }}>
          {t('invoices.debit_note.total', { total: fmt(subtotal + tax), tax: fmt(tax) })}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('invoices.common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onConfirm(reason.trim(), lines.map(toInput))}>
            {t('invoices.common.issue_note')}
          </button>
        </div>
      </div>
    </div>
  );
}
