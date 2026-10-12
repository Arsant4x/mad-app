import { badgeAltOf, type BadgeMetaAlt } from '../../lib/statusBadge';
import { apiErrorMessage } from '../../lib/apiError';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportAllData, getSubscription, renewSubscription, type SubscriptionStatus } from '../../api/subscription';
import { useAuth } from '../../auth/AuthContext';
import { DeletionRequestCard } from './DeletionRequestCard';

// `label` holds a translation key; it is turned into text where rendered.
const STATUS_META: Record<SubscriptionStatus['status'], BadgeMetaAlt> = {
  ACTIVE: { label: 'subscription.page.status.active', badge: 'paid' },
  FROZEN: { label: 'subscription.page.status.frozen', badge: 'due' },
  STOPPED: { label: 'subscription.page.status.stopped', badge: 'overdue' },
  CLOSED: { label: 'subscription.page.status.closed', badge: 'overdue' },
};

const MONTH_OPTIONS = [1, 3, 6, 12];

/**
 * The tenant's own subscription: current state + self-service renewal. Reachable
 * even while frozen or stopped (that's the point). `standalone` renders it as a
 * full-screen gate for a stopped account, with a logout escape hatch.
 */
export function SubscriptionPage({ standalone = false }: { standalone?: boolean }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSubscription()
      .then(setSub)
      .catch(() => setError(t('subscription.page.err_load')))
      .finally(() => setLoading(false));
  }, []);

  async function renew() {
    setError(null);
    setBusy(true);
    try {
      await renewSubscription(months);
      // A full reload re-mints the session from the refresh cookie, so the new
      // ACTIVE status takes effect everywhere (banner/gate clear) in one step.
      window.location.href = '/';
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(data?.message ?? t('subscription.page.err_renew'));
      setBusy(false);
    }
  }


  async function downloadExport() {
    setExporting(true);
    try {
      const data = await exportAllData();
      // Built client-side into a file download; nothing is sent anywhere.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mad-app-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(apiErrorMessage(e, t('subscription.common.err_export')));
    } finally {
      setExporting(false);
    }
  }

  if (loading) return standalone ? <div className="status-screen"><p>{t('subscription.page.loading')}</p></div> : <p className="hint">{t('subscription.page.loading')}</p>;

  const status = sub ? badgeAltOf(STATUS_META, sub.status) : null;

  const body = (
    <div style={{ maxWidth: 560 }}>
      {sub && status && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b>{sub.orgName}</b>
              <span className={`badge ${status.badge}`}>{t(status.label)}</span>
            </div>
            <div className="hint">{t('subscription.page.start', { date: sub.subStart ?? '—' })}</div>
            <div className="hint">{t('subscription.page.end', { date: sub.subEnd ?? '—' })}</div>
            {sub.status === 'ACTIVE' && sub.daysLeft !== null && <div className="hint">{t('subscription.page.days_left', { n: sub.daysLeft })}</div>}
            {sub.status === 'FROZEN' && (
              <p className="hint" style={{ color: 'var(--rose)', marginTop: 8 }}>
                {sub.graceDaysLeft !== null
                  ? t('subscription.page.frozen_grace', { n: sub.graceDaysLeft })
                  : t('subscription.page.frozen')}
              </p>
            )}
            {sub.status === 'STOPPED' && (
              <p className="hint" style={{ color: 'var(--rose)', marginTop: 8 }}>{t('subscription.page.stopped')}</p>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>{t('subscription.page.renew_title')}</div>
            <div className="chip-group" style={{ marginBottom: 10 }}>
              {MONTH_OPTIONS.map((m) => (
                <button key={m} className={months === m ? 'chip active' : 'chip'} onClick={() => setMonths(m)}>
                  {t('subscription.page.months', { n: m })}
                </button>
              ))}
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary" disabled={busy} onClick={renew}>
              {busy ? t('subscription.page.renewing') : t('subscription.page.renew', { n: months })}
            </button>
          </div>
        </>
      )}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>{t('subscription.page.export_title')}</div>
        <p className="hint" style={{ marginBottom: 10 }}>{t('subscription.page.export_hint')}</p>
        <button className="btn btn-ghost btn-sm" disabled={exporting} onClick={downloadExport}>
          {exporting ? t('subscription.page.exporting') : t('subscription.page.export')}
        </button>
      </div>
      <DeletionRequestCard />
      {standalone && (
        <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => logout()}>
          {t('subscription.common.logout')}
        </button>
      )}
    </div>
  );

  if (standalone) {
    return (
      <div className="status-screen">
        <h1>{t('subscription.page.title')}</h1>
        {body}
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('subscription.page.title')}</div>
          <div className="page-sub">{t('subscription.page.subtitle')}</div>
        </div>
      </div>
      {body}
    </div>
  );
}
