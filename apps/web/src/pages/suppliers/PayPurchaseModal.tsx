import { useState } from 'react';
import type { Purchase } from '../../api/purchases';
import { today } from '../../lib/format';

export function PayPurchaseModal({ purchase, onCancel, onConfirm }: { purchase: Purchase; onCancel: () => void; onConfirm: (paidDate: string) => Promise<void> }) {
  const [paidDate, setPaidDate] = useState(purchase.paidDate?.slice(0, 10) ?? today());
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await onConfirm(paidDate);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{purchase.paid ? 'تعديل بيانات السداد' : 'تسديد الفاتورة'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>تاريخ السداد</label>
          <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {purchase.paid ? 'حفظ التعديل' : 'تأكيد السداد'}
          </button>
        </div>
      </div>
    </div>
  );
}
