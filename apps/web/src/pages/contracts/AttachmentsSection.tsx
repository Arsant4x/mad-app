import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import i18n from '../../i18n';

function humanSize(bytes: number): string {
  if (bytes < 1024) return i18n.t('contracts.attachments.size_b', { n: bytes });
  if (bytes < 1024 * 1024) return i18n.t('contracts.attachments.size_kb', { n: Math.round(bytes / 1024) });
  return i18n.t('contracts.attachments.size_mb', { n: (bytes / (1024 * 1024)).toFixed(1) });
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
  const { t } = useTranslation();
  const [items, setItems] = useState<ContractAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listContractAttachments(contractId)
      .then(setItems)
      .catch(() => setError(i18n.t('contracts.attachments.load_failed')))
      .finally(() => setLoading(false));
  }, [contractId]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(t('contracts.attachments.too_large'));
      return;
    }
    setBusy(true);
    try {
      const created = await uploadContractAttachment(contractId, file);
      setItems((xs) => [created, ...xs]);
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.attachments.upload_failed')));
    } finally {
      setBusy(false);
    }
  }

  async function open(att: ContractAttachment) {
    setError(null);
    try {
      // Streamed decrypted through the server, never as a signed link.
      await downloadContractAttachment(att.id, att.filename);
    } catch (e) {
      setError(apiErrorMessage(e, t('contracts.attachments.open_failed')));
    }
  }

  async function remove(att: ContractAttachment) {
    setBusy(true);
    setError(null);
    try {
      await deleteContractAttachment(att.id);
      setItems((xs) => xs.filter((x) => x.id !== att.id));
    } catch (e) {
      setError(apiErrorMessage(e, t('contracts.attachments.delete_failed')));
    } finally {
      setBusy(false);
      setConfirmingId(null);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{t('contracts.attachments.title', { n: items.length })}</span>
        <>
          <input ref={inputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={onPick} style={{ display: 'none' }} />
          <button className="btn btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t('contracts.attachments.uploading') : t('contracts.attachments.attach')}
          </button>
        </>
      </div>

      <p className="hint" style={{ marginBottom: 6 }}>{t('contracts.attachments.hint')}</p>

      {/* A regulatory warning, not styling: the tourist hospitality facility
          regulation (2289) art. 28/14 requires the licensed facility to check an ID
          from the original and record its data only, without taking a copy. The
          duty is our customer's, but uploading the image here puts them in breach,
          and blocking images is not possible (photos are allowed for handovers and
          claims). So the warning is the available tool. Keep it until an ID number
          field exists. */}
      <p className="warn-text" style={{ marginBottom: 10 }}>{t('contracts.attachments.id_warning')}</p>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="hint">{t('contracts.attachments.loading')}</p>
      ) : items.length === 0 ? (
        <p className="hint">{t('contracts.attachments.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('contracts.attachments.col_file')}</th>
              <th>{t('contracts.attachments.col_size')}</th>
              <th>{t('contracts.attachments.col_date')}</th>
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
                        {t('contracts.attachments.confirm_delete')}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(null)}>
                        {t('contracts.attachments.cancel')}
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(att.id)}>
                      {t('contracts.attachments.delete')}
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
