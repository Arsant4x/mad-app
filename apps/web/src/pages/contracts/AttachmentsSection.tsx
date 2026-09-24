import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../lib/apiError';
import {
  deleteContractAttachment,
  downloadContractAttachment,
  listContractAttachments,
  uploadContractAttachment,
  type ContractAttachment,
} from '../../api/contracts';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES } from '../../api/files';
import { dfmt } from '../../lib/format';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مب`;
}

/**
 * Files that belong to a lease — the signed PDF above all, plus annexes and
 * clearance letters. Deliberately not ID scans (see the ContractAttachment
 * model comment); the warning below says so to the user, too.
 * Kept apart from the rest of the contract object because it is its
 * own endpoint: the bytes live in object storage and are fetched through a
 * short-lived signed URL only when someone actually opens one.
 */
export function AttachmentsSection({ contractId }: { contractId: string }) {
  const [items, setItems] = useState<ContractAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listContractAttachments(contractId)
      .then(setItems)
      .catch(() => setError('تعذّر تحميل المرفقات'))
      .finally(() => setLoading(false));
  }, [contractId]);

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
      const created = await uploadContractAttachment(contractId, file);
      setItems((xs) => [created, ...xs]);
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر رفع الملف'));
    } finally {
      setBusy(false);
    }
  }

  async function open(att: ContractAttachment) {
    setError(null);
    try {
      // ق-١٣٦٥ — عبر الخادم مفكوكاً، لا رابطَ موقَّعاً.
      await downloadContractAttachment(att.id, att.filename);
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر فتح الملف'));
    }
  }

  async function remove(att: ContractAttachment) {
    setBusy(true);
    setError(null);
    try {
      await deleteContractAttachment(att.id);
      setItems((xs) => xs.filter((x) => x.id !== att.id));
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر حذف الملف'));
    } finally {
      setBusy(false);
      setConfirmingId(null);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>المرفقات ({items.length})</span>
        <>
          <input ref={inputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={onPick} style={{ display: 'none' }} />
          <button className="btn btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'جارٍ الرفع…' : '+ إرفاق ملف'}
          </button>
        </>
      </div>

      <p className="hint" style={{ marginBottom: 6 }}>PDF أو صورة (JPG/PNG/WebP)، حتى 10 ميغابايت. تُحفظ خاصة ولا تُشارك إلا برابط مؤقّت عند الفتح.</p>

      {/* تحذير نظامي لا تنسيقي: لائحة مرفق الضيافة السياحي (2289) م.٢٨/١٤ تُلزم
          المرفق المرخَّص بالتحقق من الهوية من أصلها وتسجيل بياناتها فقط «دون طلب
          أو أخذ نسخة منها». الإلزام على عميلنا لا علينا — لكن رفع الصورة هنا
          يضعه في المخالفة، والمنع غير ممكن تقنياً (الصور مسموحة لأسباب مشروعة:
          صور التسليم، مرفقات المطالبات). فالتحذير هو الأداة المتاحة.
          ولا يُحذف هذا التحذير إلا بعد وجود حقل رقم الهوية — انظر بند ③. */}
      <p className="warn-text" style={{ marginBottom: 10 }}>⚠️ لا ترفع صور الهويات — سجّل الرقم في حقله.</p>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="hint">جارٍ التحميل…</p>
      ) : items.length === 0 ? (
        <p className="hint">لا مرفقات بعد.</p>
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
  );
}
