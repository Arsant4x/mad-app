import { badgeAltOf } from '../../lib/statusBadge';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  approveDeletionRequest,
  listDeletionRequests,
  rejectDeletionRequest,
  type AccountRequestOutcome,
  type AdminDeletionRequest,
  type DeletionRequestStatus,
} from '../../api/deletionRequests';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';
import i18n from '../../i18n';

const statusMeta = (): Record<DeletionRequestStatus, { label: string; badge: string }> => ({
  PENDING: { label: i18n.t('developer.deletion.status.pending'), badge: 'due' },
  APPROVED: { label: i18n.t('developer.deletion.status.approved'), badge: 'overdue' },
  REJECTED: { label: i18n.t('developer.deletion.status.rejected'), badge: 'draft' },
  CANCELLED: { label: i18n.t('developer.deletion.status.cancelled'), badge: 'draft' },
});

/** What actually happened; an approval is not shown as a plain "done". */
const outcomeMeta = (): Record<AccountRequestOutcome, { label: string; badge: string }> => ({
  DELETED: { label: i18n.t('developer.deletion.outcome.deleted'), badge: 'overdue' },
  CLOSED: { label: i18n.t('developer.deletion.outcome.closed'), badge: 'overdue' },
  REOPENED: { label: i18n.t('developer.deletion.outcome.reopened'), badge: 'paid' },
  ERASED: { label: i18n.t('developer.deletion.outcome.erased'), badge: 'overdue' },
});

const KIND_LABEL_KEY: Record<AdminDeletionRequest['kind'], string> = {
  DELETION: 'developer.deletion.kind.deletion',
  REOPENING: 'developer.deletion.kind.reopening',
  ERASURE: 'developer.deletion.kind.erasure',
};

/** An approved request shows what happened; the rest show their status. */
function statusOf(r: AdminDeletionRequest) {
  return r.status === 'APPROVED' && r.outcome ? badgeAltOf(outcomeMeta(), r.outcome) : badgeAltOf(statusMeta(), r.status);
}

/** The confirmation says what will happen before the click: delete or close, and why. */
function confirmBody(r: AdminDeletionRequest): string {
  if (r.kind === 'REOPENING') return i18n.t('developer.deletion.confirm_body_reopen', { company: r.companyName });
  if (r.kind === 'ERASURE') {
    return i18n.t('developer.deletion.confirm_body_erase', { company: r.companyName });
  }
  if (r.preview?.outcome === 'CLOSE') {
    return i18n.t('developer.deletion.confirm_body_close', { company: r.companyName, movement: r.preview.movement.join(' · ') });
  }
  return i18n.t('developer.deletion.confirm_body_delete', { company: r.companyName });
}

/**
 * Support work list: account deletion and reopening requests across all companies. Approval measures
 * first and then acts: no activity means delete, activity means close. The confirmation names the
 * company and says what will happen. There is no direct delete button in the panel; this is the only path.
 * onExecuted tells the panel to refresh its company list (deleted ones disappear, closed ones are marked).
 */
export function DeletionRequestsSection({ onExecuted }: { onExecuted: () => void }) {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<AdminDeletionRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<AdminDeletionRequest | null>(null);

  async function reload() {
    setRequests(await listDeletionRequests());
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  async function run(fn: () => Promise<unknown>, fallback: string, executed = false) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
      if (executed) onExecuted();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? fallback);
    } finally {
      setBusy(false);
    }
  }

  const pending = requests.filter((r) => r.status === 'PENDING');

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div className="card-title">
          {t('developer.deletion.title')} {pending.length > 0 && <span className="badge overdue">{t('developer.deletion.pending_badge', { n: pending.length })}</span>}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {requests.length === 0 ? (
        <p className="hint">{t('developer.deletion.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('developer.common.company')}</th>
              <th>{t('developer.deletion.col_request')}</th>
              <th>{t('developer.common.reason')}</th>
              <th>{t('developer.deletion.col_date')}</th>
              <th>{t('developer.common.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.companyName || '—'}</td>
                <td>{t(KIND_LABEL_KEY[r.kind])}</td>
                <td>{r.reason ?? '—'}</td>
                <td className="num">{dfmt(r.createdAt)}</td>
                <td>
                  <span className={`badge ${statusOf(r).badge}`}>{statusOf(r).label}</span>
                  {r.status === 'PENDING' && r.preview && (
                    <div className="hint">
                      {r.preview.outcome === 'CLOSE'
                        ? t('developer.deletion.preview_close', { movement: r.preview.movement.join(' · ') })
                        : t('developer.deletion.preview_delete')}
                    </div>
                  )}
                  {r.outcome === 'CLOSED' && r.movement.length > 0 && <div className="hint">{t('developer.deletion.movement', { movement: r.movement.join(' · ') })}</div>}
                  {r.decidedNote && <div className="hint">{r.decidedNote}</div>}
                  {r.decidedByName && <div className="hint">{t('developer.deletion.decided_by', { name: r.decidedByName })}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.status === 'PENDING' && (
                    <>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirming(r)}>
                        {r.kind === 'REOPENING'
                          ? t('developer.deletion.approve_reopen')
                          : r.kind === 'ERASURE'
                            ? t('developer.deletion.approve_erase')
                            : t('developer.deletion.approve_execute')}
                      </button>{' '}
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => run(() => rejectDeletionRequest(r.id, note.trim() || undefined), t('developer.deletion.err_reject'))}
                      >
                        {t('developer.common.reject')}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pending.length > 0 && (
        <div className="field" style={{ marginTop: 10, maxWidth: 420 }}>
          <label>{t('developer.deletion.note_label')}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('developer.deletion.note_placeholder')} />
        </div>
      )}

      {confirming && (
        <ConfirmModal
          title={
            confirming.kind === 'REOPENING'
              ? t('developer.deletion.confirm_title_reopen')
              : confirming.kind === 'ERASURE'
                ? t('developer.deletion.confirm_title_erase')
                : confirming.preview?.outcome === 'CLOSE'
                  ? t('developer.deletion.confirm_title_close')
                  : t('developer.deletion.confirm_title_delete')
          }
          body={confirmBody(confirming)}
          confirmLabel={
            confirming.kind === 'REOPENING'
              ? t('developer.deletion.confirm_label_reopen')
              : confirming.kind === 'ERASURE'
                ? t('developer.deletion.confirm_label_erase')
                : confirming.preview?.outcome === 'CLOSE'
                  ? t('developer.deletion.confirm_label_close')
                  : t('developer.deletion.confirm_label_delete')
          }
          onConfirm={() => {
            const target = confirming;
            setConfirming(null);
            return run(() => approveDeletionRequest(target.id, note.trim() || undefined), t('developer.deletion.err_execute'), true);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
