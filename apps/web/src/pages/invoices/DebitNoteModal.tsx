import { useState } from 'react';
import type { Invoice, InvoiceLineInput } from '../../api/invoices';
import { fmt } from '../../lib/format';

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
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<InvoiceLineInput[]>([{ description: '', quantity: 1, unitPrice: 0, taxRate: 15 }]);

  function updateLine(index: number, patch: Partial<InvoiceLineInput>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const tax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / 100), 0);
  // Every line must actually bill something — a zero-value note is a document
  // issued to the authority that says nothing.
  const valid = reason.trim() !== '' && lines.every((l) => l.description.trim() !== '' && l.quantity > 0 && l.unitPrice > 0);

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">إصدار إشعار مدين</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          {invoice.docType === 'CREDIT_NOTE'
            ? `إشعار مدين يصحّح الإشعار الدائن ${invoice.no} (${fmt(invoice.total)}) — يعيد ما زاد فيه إلى ذمّة العميل ولا يتجاوز قيمته، فالإشعار الصادر لا يُعدَّل ولا يُحذف؛ ويُرسَل للهيئة كمستند 383 مرتبطاً به.`
            : `مبالغ إضافية على الفاتورة ${invoice.no} — تُقيَّد على العميل كمستحقات جديدة، وتُرسَل للهيئة كمستند 383 مرتبطاً `}بها. الفاتورة الأصلية لا تُعدَّل.
        </div>
        <div className="field">
          <label>سبب الإصدار (إلزامي لهيئة الزكاة)</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تكاليف شحن غير مفوترة / فرق سعر" />
        </div>

        <table className="line-items">
          <thead>
            <tr>
              <th>الوصف</th>
              <th style={{ width: 55 }}>الكمية</th>
              <th style={{ width: 95 }}>السعر</th>
              <th style={{ width: 80 }}>الضريبة</th>
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
                  <select value={l.taxRate} onChange={(e) => updateLine(i, { taxRate: parseFloat(e.target.value) })}>
                    <option value={15}>15٪</option>
                    <option value={0}>0٪ (معفى)</option>
                  </select>
                </td>
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
        <button className="add-line" onClick={() => setLines((ls) => [...ls, { description: '', quantity: 1, unitPrice: 0, taxRate: 15 }])}>
          + إضافة بند جديد
        </button>

        <div className="hint" style={{ marginTop: 10 }}>
          الإجمالي: {fmt(subtotal + tax)} (شامل ضريبة {fmt(tax)})
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onConfirm(reason.trim(), lines)}>
            إصدار الإشعار
          </button>
        </div>
      </div>
    </div>
  );
}
