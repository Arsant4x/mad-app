import { useEffect, useRef, useState } from 'react';
import {
  deletePurchaseAttachment,
  listPurchaseAttachments,
  purchaseAttachmentDownloadUrl,
  uploadPurchaseAttachment,
  type Purchase,
  type PurchaseAttachment,
} from '../../api/purchases';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES } from '../../api/files';
import { dfmt } from '../../lib/format';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مب`;
}

/**
 * مستندات فاتورة المصروف (مستند §5): صورة الفاتورة أو PDF — يُرفَع من صف
 * المشتريات، ويُفتح برابط موقَّع قصير العمر عند الطلب فقط. نفس سلوك مرفقات
 * العقود، في مودال لأن المشتريات جدول بلا صفحة تفاصيل.
 */
export function PurchaseAttachmentsModal({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const [items, setItems] = useState<PurchaseAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listPurchaseAttachments(purchase.id)
      .then(setItems)
      .catch(() => setError('تعذّر تحميل المستندات'))
      .finally(() => setLoading(false));
  }, [purchase.id]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('الملف أكبر من الحد المسموح (10 ميغابايت).');
      return;
    }
    setBusy(true);
    try {
      const created = await uploadPurchaseAttachment(purchase.id, file);
      setItems((xs) => [created, ...xs]);
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر رفع الملف'));
    } finally {
      setBusy(false);
    }
  }

  async function open(att: PurchaseAttachment) {
    setError(null);
    try {
      const { url } = await purchaseAttachmentDownloadUrl(att.id);
      window.open(url, '_blank', 'noopener');
    } catch {
      setError('تعذّر فتح الملف');
    }
  }

  async function remove(att: PurchaseAttachment) {
    setBusy(true);
    setError(null);
    try {
      await deletePurchaseAttachment(att.id);
      setItems((xs) => xs.filter((x) => x.id !== att.id));
    } catch {
      setError('تعذّر حذف الملف');
    } finally {
      setBusy(false);
      setConfirmingId(null);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div className="modal-title">مستندات الفاتورة {purchase.no}</div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p className="hint" style={{ margin: 0 }}>PDF أو صورة (JPG/PNG/WebP)، حتى 10 ميغابايت.</p>
          <input ref={inputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={onPick} style={{ display: 'none' }} />
          <button className="btn btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'جارٍ الرفع…' : '+ إرفاق مستند'}
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        {loading ? (
          <p className="hint">جارٍ التحميل…</p>
        ) : items.length === 0 ? (
          <p className="hint">لا مستندات بعد — أرفق صورة الفاتورة أو ملف PDF.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الملف</th>
                <th>الحجم</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((att) => (
                <tr key={att.id}>
                  <td>
                    <button
                      onClick={() => open(att)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #2b6cb0)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', textAlign: 'right' }}
                    >
                      {att.filename}
                    </button>
                  </td>
                  <td className="num">{humanSize(att.size)}</td>
                  <td className="num">{dfmt(att.uploadedAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {confirmingId === att.id ? (
                      <>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(att)}>
                          تأكيد الحذف
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(null)}>
                          إلغاء
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(att.id)}>
                        حذف
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
