import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '../../lib/apiError';
import {
  deletePurchaseAttachment,
  listPurchaseAttachments,
  purchaseAttachmentDownloadUrl,
  uploadPurchaseAttachment,
  type Purchase,
  type PurchaseAttachment,
} from '../../api/purchases';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES } from '../../api/files';
import i18n from '../../i18n';
import { dfmt } from '../../lib/format';

function humanSize(bytes: number): string {
  if (bytes < 1024) return i18n.t('suppliers.attachments.size_b', { n: bytes });
  if (bytes < 1024 * 1024) return i18n.t('suppliers.attachments.size_kb', { n: Math.round(bytes / 1024) });
  return i18n.t('suppliers.attachments.size_mb', { n: (bytes / (1024 * 1024)).toFixed(1) });
}

/**
 * Expense invoice documents: an image or PDF of the invoice, uploaded from the
 * purchases row and opened through a short-lived signed link only on request.
 * Same behaviour as contract attachments, in a modal because purchases are a
 * table without a detail page.
 */
export function PurchaseAttachmentsModal({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PurchaseAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listPurchaseAttachments(purchase.id)
      .then(setItems)
      .catch(() => setError(t('suppliers.attachments.load_failed')))
      .finally(() => setLoading(false));
  }, [purchase.id]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(t('suppliers.attachments.too_large'));
      return;
    }
    setBusy(true);
    try {
      const created = await uploadPurchaseAttachment(purchase.id, file);
      setItems((xs) => [created, ...xs]);
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('suppliers.attachments.upload_failed')));
    } finally {
      setBusy(false);
    }
  }

  async function open(att: PurchaseAttachment) {
    setError(null);
    try {
      const { url } = await purchaseAttachmentDownloadUrl(att.id);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(apiErrorMessage(e, t('suppliers.attachments.open_failed')));
    }
  }

  async function remove(att: PurchaseAttachment) {
    setBusy(true);
    setError(null);
    try {
      await deletePurchaseAttachment(att.id);
      setItems((xs) => xs.filter((x) => x.id !== att.id));
    } catch (e) {
      setError(apiErrorMessage(e, t('suppliers.attachments.delete_failed')));
    } finally {
      setBusy(false);
      setConfirmingId(null);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div className="modal-title">{t('suppliers.attachments.title', { no: purchase.no })}</div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p className="hint" style={{ margin: 0 }}>{t('suppliers.attachments.hint')}</p>
          <input ref={inputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={onPick} style={{ display: 'none' }} />
          <button className="btn btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t('suppliers.attachments.uploading') : t('suppliers.attachments.attach')}
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        {loading ? (
          <p className="hint">{t('suppliers.common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="hint">{t('suppliers.attachments.empty')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('suppliers.attachments.col_file')}</th>
                <th>{t('suppliers.attachments.col_size')}</th>
                <th>{t('suppliers.attachments.col_date')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((att) => (
                <tr key={att.id}>
                  <td>
                    <button
                      onClick={() => open(att)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #2b6cb0)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', textAlign: 'start' }}
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
                          {t('suppliers.attachments.confirm_delete')}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(null)}>
                          {t('suppliers.common.cancel')}
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(att.id)}>
                        {t('suppliers.common.delete')}
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
