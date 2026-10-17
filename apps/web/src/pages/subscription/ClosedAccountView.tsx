import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  cancelDeletionRequest,
  getAccountClosureState,
  getClosureArchive,
  getMyDeletionRequest,
  requestErasure,
  requestReopening,
  type AccountClosureState,
  type ClosureArchive,
  type DeletionRequest,
} from '../../api/deletionRequests';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';
import i18n from '../../i18n';

const kb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? i18n.t('subscription.closed.size_mb', { n: (bytes / 1024 / 1024).toFixed(1) })
    : i18n.t('subscription.closed.size_kb', { n: Math.max(1, Math.round(bytes / 1024)) });

const KIND_KEY: Record<DeletionRequest['kind'], string> = {
  DELETION: 'subscription.closed.kind.deletion',
  REOPENING: 'subscription.closed.kind.reopening',
  ERASURE: 'subscription.closed.kind.erasure',
};

/**
 * The only screen a closed company's owner sees. It answers "where is my data?" with its
 * retention date, and offers two requests the support team reviews: reopening (while the
 * window is open) and erasing the non-mandatory data now. Erased data does not come back,
 * so that is said before the request.
 */
export function ClosedAccountView({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  // The requests are the owner's; an employee of a closed company reads the state and signs out.
  const { user } = useAuth();
  const isOwner = user?.actorType === 'COMPANY';
  const [account, setAccount] = useState<AccountClosureState | null>(null);
  const [req, setReq] = useState<DeletionRequest | null>(null);
  const [archive, setArchive] = useState<ClosureArchive | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

  useEffect(() => {
    getAccountClosureState().then(setAccount).catch(() => undefined);
    getMyDeletionRequest().then(setReq).catch(() => undefined);
    // The links are short lived: fetched when the screen opens, renewed by reopening it.
    getClosureArchive().then(setArchive).catch(() => undefined);
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

  const pending = req?.status === 'PENDING' ? req : null;
  const retainUntil = account?.retainUntil ? account.retainUntil.slice(0, 10) : null;
  const reopenUntil = account?.reopenUntil ? account.reopenUntil.slice(0, 10) : null;
  const erased = !!account?.erasedAt;
  const windowOpen = !erased && !!account?.reopenUntil && new Date(account.reopenUntil) > new Date();

  return (
    <div className="card" style={{ maxWidth: 640, margin: '40px auto' }}>
      <div className="card-title" style={{ marginBottom: 10 }}>{t('subscription.closed.title')}</div>
      {account?.closedAt && <p className="hint">{t('subscription.closed.closed_on', { date: dfmt(account.closedAt) })}</p>}
      <p style={{ marginTop: 8 }}>
        {retainUntil ? t('subscription.closed.retained_until', { date: retainUntil }) : t('subscription.closed.retained')}
      </p>
      {erased ? (
        <p className="hint">{t('subscription.closed.erased_note', { date: dfmt(account!.erasedAt!) })}</p>
      ) : (
        reopenUntil && (
          <p className="hint">
            {t('subscription.closed.reopen_note', { date: reopenUntil })}
          </p>
        )
      )}
      {req?.status !== 'PENDING' && req?.decidedNote && <p className="hint">{t('subscription.common.support_reply', { note: req.decidedNote })}</p>}

      {archive && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title" style={{ marginBottom: 6 }}>{t('subscription.closed.archive_title', { date: archive.expiresAt.slice(0, 10) })}</div>
          <p className="hint">
            {t('subscription.closed.archive_hint', {
              years: archive.years.join(' · ') || '—',
              invoices: archive.stampedInvoices,
              rows: archive.totalRows,
            })}
          </p>
          <ul style={{ paddingInlineStart: 18 }}>
            {archive.files.map((f) => (
              <li key={f.name}>
                <a href={f.url} target="_blank" rel="noreferrer">
                  {f.name}
                </a>{' '}
                <span className="hint">({kb(f.bytes)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pending ? (
          <>
            <span className="badge due">
              {t('subscription.closed.pending_badge', { kind: t(KIND_KEY[pending.kind]), date: dfmt(pending.createdAt) })}
            </span>
            {isOwner && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => cancelDeletionRequest(pending.id), t('subscription.common.err_withdraw'))}>
                {t('subscription.common.withdraw')}
              </button>
            )}
          </>
        ) : (
          isOwner && (
          <>
            {windowOpen && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => requestReopening(), t('subscription.common.err_submit'))}>
                {t('subscription.closed.request_reopen')}
              </button>
            )}
            {!erased && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmErase(true)}>
                {t('subscription.closed.request_erase')}
              </button>
            )}
          </>
          )
        )}
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          {t('subscription.common.logout')}
        </button>
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

      {isOwner && confirmErase && (
        <ConfirmModal
          title={t('subscription.closed.erase_confirm_title')}
          body={t('subscription.closed.erase_confirm_body')}
          confirmLabel={t('subscription.common.confirm_submit')}
          onConfirm={() => {
            setConfirmErase(false);
            return run(() => requestErasure(), t('subscription.common.err_submit'));
          }}
          onCancel={() => setConfirmErase(false)}
        />
      )}
    </div>
  );
}
