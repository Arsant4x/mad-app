import { useState } from 'react';
import type { InvoiceStatus } from '../../api/invoices';
import { STATUS_META, STATUS_ORDER } from './statusMeta';

export function InvoiceStatusModal({
  currentStatus,
  onCancel,
  onSave,
}: {
  currentStatus: InvoiceStatus;
  onCancel: () => void;
  onSave: (status: InvoiceStatus) => void;
}) {
  const [value, setValue] = useState<InvoiceStatus>(currentStatus);

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">تغيير حالة الفاتورة</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>الحالة</label>
          <select value={value} onChange={(e) => setValue(e.target.value as InvoiceStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={() => onSave(value)}>
            حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
