import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { acceptConsent, type ConsentState } from '../../api/consent';
import { exportAllData } from '../../api/subscription';
import { ConfirmModal } from '../../components/ConfirmModal';
import { DeletionRequestCard } from './DeletionRequestCard';
import { dfmt } from '../../lib/format';

/**
 * A choice, not a block: the service now requires this, so accept, or take your data and leave.
 * Three actions are offered together (accept, download, close the account); a screen with a
 * single option would be a block. The full list is shown with locations, so consent is given
 * to a text that can be read, not to a title.
 */
export function ConsentRequiredView({ state, onAccepted, onLogout }: { state: ConsentState; onAccepted: (next: ConsentState) => void; onLogout: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exiting, setExiting] = useState(false);
  const list = state.current;

  /** Download works here, through the same export as the subscription page. */
  async function download() {
    setError(null);
    setBusy(true);
    try {
      const data = await exportAllData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `mad-app-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('subscription.common.err_export'));
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (state.requiredVersion === null) return;
    setError(null);
    setBusy(true);
    try {
      onAccepted(await acceptConsent(state.requiredVersion));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('subscription.consent.err_accept'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 760, margin: '40px auto' }}>
      <div className="card-title" style={{ marginBottom: 10 }}>{t('subscription.consent.title')}</div>
      <p>
        {t('subscription.consent.intro')}
        <strong>{t('subscription.consent.intro_strong')}</strong>{t('subscription.consent.intro_end')}
      </p>
      {list && (
        <p className="hint">
          {t('subscription.consent.version_line', {
            version: list.version,
            published: dfmt(list.publishedAt),
            effective: dfmt(list.effectiveFrom),
            days: state.noticeDays,
          })}{' '}{list.summary}
        </p>
      )}

      {list && list.entries.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>{t('subscription.consent.col_processor')}</th>
              <th>{t('subscription.consent.col_purpose')}</th>
              <th>{t('subscription.consent.col_location')}</th>
              <th>{t('subscription.consent.col_categories')}</th>
            </tr>
          </thead>
          <tbody>
            {list.entries.map((e) => (
              <tr key={e.name}>
                <td>{e.name}</td>
                <td>{e.purpose}</td>
                <td>{e.location}</td>
                <td>{e.dataCategories.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: 14 }}>
        <strong>{t('subscription.consent.options_strong')}</strong>{t('subscription.consent.options')}
      </p>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConfirming(true)}>
          {t('subscription.consent.accept')}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={download}>
          {t('subscription.consent.download')}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setExiting((v) => !v)}>
          {t('subscription.consent.close_account')}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          {t('subscription.common.logout')}
        </button>
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

      {/* The same closure card, not a copy, so one card governs the request wherever it shows. */}
      {exiting && <DeletionRequestCard />}

      {confirming && (
        <ConfirmModal
          title={t('subscription.consent.confirm_title')}
          body={t('subscription.consent.confirm_body', { version: state.requiredVersion ?? '' })}
          confirmLabel={t('subscription.consent.confirm_label')}
          onConfirm={() => {
            setConfirming(false);
            return accept();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
