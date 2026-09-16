import { useState } from 'react';
import type { Invoice } from '../../api/invoices';
import { fmt } from '../../lib/format';

/**
 * Issues a ZATCA 381 credit note against an invoice — a full credit of the
 * whole document (partial credits exist in the API but aren't surfaced yet).
 * The reason is mandatory: the authority rejects a note without one, so the
 * button stays disabled until it's given.
 */
export function CreditNoteModal({ invoice, onCancel, onConfirm }: { invoice: Invoice; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">إصدار إشعار دائن</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          {invoice.docType === 'DEBIT_NOTE'
            ? `إشعار دائن يصحّح الإشعار المدين ${invoice.no} (${fmt(invoice.total)}) بكامل قيمته — فالإشعار الصادر لا يُعدَّل ولا يُحذف، ومخرجه إشعار مقابل؛ ويُرسَل للهيئة كمستند 381 مرتبطاً به.`
            : `إشعار دائن بكامل قيمة الفاتورة ${invoice.no} (${fmt(invoice.total)}) — يعكس أثرها في الدفاتر دون تعديل الفاتورة الأصلية، ويُرسَل للهيئة كمستند 381 مرتبطاً بها.`}
        </div>
        <div className="field">
          <label>سبب الإصدار (إلزامي لهيئة الزكاة)</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: إرجاع بضاعة / إلغاء خدمة / تصحيح مبلغ" />
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            إصدار الإشعار
          </button>
        </div>
      </div>
    </div>
  );
}
