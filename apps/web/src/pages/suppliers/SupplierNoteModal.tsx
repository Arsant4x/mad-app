import { useState } from 'react';
import type { Purchase, SupplierNoteInput } from '../../api/purchases';
import { fmt, today } from '../../lib/format';

/**
 * تسجيلُ إشعارٍ من المورّد (دائنٍ أو مدين) على فاتورة شراء — **مستندُه هو، يُسجَّل لا يُصدَر**
 * (`ق-١٠٠٦`/①): سببُه وتاريخُه ورقمُه كما على ورقته، والبنودُ الكاملة من الفاتورة. والإشعارُ
 * الدائن الكامل يعيد البضاعةَ المخزنية إلى المورّد ويُخرجها من الرفّ (`ق-١٠٠٦`/③)؛ والمدينُ فوترةٌ
 * إضافية تُسدَّد بسند صرف. وما رُحِّل لا يُعدَّل ولا يُحذف — يُصحَّح بإشعارٍ مقابل.
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
      // رفضٌ مسمّىً من الخادم (سقفٌ · رفٌّ لا يكفي · هدفٌ لا يقبل) — يُعرض ولا يُبتلع.
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر تسجيل الإشعار');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{isCredit ? 'إشعار دائن من المورّد' : 'إشعار مدين من المورّد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          {isCredit
            ? `يُسجَّل إشعارُ المورّد الدائن بكامل قيمة الفاتورة ${purchase.no} (${fmt(purchase.total)}): البضاعةُ المخزنية تعود إلى المورّد وتخرج من الرفّ، وتُعكس ضريبة المدخلات بتاريخ الإشعار، ويقلّ ما ندين به. الفاتورة الأصلية لا تُمسّ.`
            : `يُسجَّل إشعارُ المورّد المدين بكامل بنود الفاتورة ${purchase.no} (${fmt(purchase.total)}) — فوترةٌ إضافية تزيد ما ندين به وتُسدَّد بسند صرف. الفاتورة الأصلية لا تُمسّ.`}
        </div>
        <div className="two-col">
          <div className="field">
            <label>تاريخ مستند المورّد</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>رقم الإشعار عند المورّد (مرجع خارجي)</label>
            <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder="كما على ورقة المورّد" />
          </div>
        </div>
        <div className="field">
          <label>السبب (إلزامي)</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isCredit ? 'مثال: إعادة بضاعة / تخفيض سعر' : 'مثال: فرق سعر / رسوم شحن'} />
        </div>
        {error && <div className="alert-error">{error}</div>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={!reason.trim() || saving} onClick={submit}>
            {saving ? 'جارٍ التسجيل…' : 'تسجيل الإشعار'}
          </button>
        </div>
      </div>
    </div>
  );
}
