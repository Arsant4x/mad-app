import { badgeAltOf, type BadgeMetaAlt } from '../../lib/statusBadge';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  cancelDeletionRequest,
  getMyDeletionRequest,
  submitDeletionRequest,
  type AccountRequestOutcome,
  type DeletionRequest,
  type DeletionRequestStatus,
} from '../../api/deletionRequests';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';

// `label` holds a translation key; it is turned into text where rendered.
const STATUS_META: Record<DeletionRequestStatus, BadgeMetaAlt> = {
  PENDING: { label: 'subscription.deletion.status.pending', badge: 'due' },
  APPROVED: { label: 'subscription.deletion.status.approved', badge: 'overdue' },
  REJECTED: { label: 'subscription.deletion.status.rejected', badge: 'draft' },
  CANCELLED: { label: 'subscription.deletion.status.cancelled', badge: 'draft' },
};

/** What actually happened: deleted for a company without activity, closed for one with activity. */
const OUTCOME_META: Record<AccountRequestOutcome, BadgeMetaAlt> = {
  DELETED: { label: 'subscription.deletion.outcome.deleted', badge: 'overdue' },
  CLOSED: { label: 'subscription.deletion.outcome.closed', badge: 'overdue' },
  REOPENED: { label: 'subscription.deletion.outcome.reopened', badge: 'paid' },
  ERASED: { label: 'subscription.deletion.outcome.erased', badge: 'overdue' },
};

const KIND_KEY: Record<DeletionRequest['kind'], string> = {
  DELETION: 'subscription.deletion.kind.deletion',
  REOPENING: 'subscription.deletion.kind.reopening',
  ERASURE: 'subscription.deletion.kind.erasure',
};

/**
 * Account deletion, SaaS style: the merchant submits a request and support carries it out;
 * there is no "erase everything" button. It lives on the subscription page because that is
 * where the account's existence is managed.
 *
 * The truth is told before the request: a company with activity is closed, not deleted.
 */
export function DeletionRequestCard() {
  const { t } = useTranslation();
  const [req, setReq] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyDeletionRequest()
      .then(setReq)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function run(fn: () => Promise<DeletionRequest>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      setReq(await fn());
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? fallback);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  const open = req?.status === 'PENDING';
  const shown = req ? (req.status === 'APPROVED' && req.outcome ? badgeAltOf(OUTCOME_META, req.outcome) : badgeAltOf(STATUS_META, req.status)) : null;

  return (
    <div className="card" style={{ marginTop: 14, borderColor: 'rgba(180, 65, 60, 0.35)' }}>
      <div className="card-title" style={{ marginBottom: 10 }}>{t('subscription.deletion.title')}</div>

      {req && shown && (
        <div style={{ marginBottom: 10 }}>
          <span className={`badge ${shown.badge}`}>{t(shown.label)}</span>{' '}
          <span className="hint">
            {t('subscription.deletion.submitted', { kind: t(KIND_KEY[req.kind]), date: dfmt(req.createdAt) })}
          </span>
          {req.decidedNote && <p className="hint" style={{ marginTop: 6 }}>{t('subscription.common.support_reply', { note: req.decidedNote })}</p>}
        </div>
      )}

      {open ? (
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => cancelDeletionRequest(req!.id), t('subscription.common.err_withdraw'))}>
          {t('subscription.common.withdraw')}
        </button>
      ) : asking ? (
        <div>
          <div className="field">
            <label>{t('subscription.deletion.reason_label')}</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('subscription.deletion.reason_placeholder')} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConfirming(true)}>
            {t('subscription.deletion.submit')}
          </button>{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>
            {t('subscription.deletion.back')}
          </button>
        </div>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 10 }}>
            {t('subscription.deletion.explain')}
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => setAsking(true)}>
            {t('subscription.deletion.request')}
          </button>
        </>
      )}

      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

      {confirming && (
        <ConfirmModal
          title={t('subscription.deletion.confirm_title')}
          body={t('subscription.deletion.confirm_body')}
          confirmLabel={t('subscription.common.confirm_submit')}
          onConfirm={() => {
            setConfirming(false);
            setAsking(false);
            return run(() => submitDeletionRequest(reason.trim() || undefined), t('subscription.common.err_submit'));
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
