import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  decidePlatformDecision,
  listPlatformDecisions,
  requestPlatformDecision,
  PLATFORM_DECISION_ACTIONS,
  type PlatformDecision,
  type PlatformDecisionAction,
} from '../../api/platformDecisions';
import { dfmt } from '../../lib/format';

/**
 * Critical actions take two people: one requests, another approves.
 * Erasing a company's data or changing its subscription with one hand happens once and cannot be undone.
 *
 * The approve button is not hidden from the requester: pressing it returns the server's refusal, which
 * teaches the rule, while hiding it would leave them guessing. The server and database enforce it.
 */
const ACTION_LABEL_KEY: Record<PlatformDecisionAction, string> = {
  ACCOUNT_ERASURE: 'developer.decisions.actions.account_erasure',
  SUBSCRIPTION_CHANGE: 'developer.decisions.actions.subscription_change',
  REFUND: 'developer.decisions.actions.refund',
};

const STATUS_LABEL: Record<PlatformDecision['status'], { labelKey: string; badgeClass: string }> = {
  PENDING: { labelKey: 'developer.decisions.status.pending', badgeClass: 'due' },
  APPROVED: { labelKey: 'developer.decisions.status.approved', badgeClass: 'paid' },
  REJECTED: { labelKey: 'developer.decisions.status.rejected', badgeClass: 'overdue' },
  EXECUTED: { labelKey: 'developer.decisions.status.executed', badgeClass: 'draft' },
};

export function DecisionsPanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PlatformDecision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [action, setAction] = useState<PlatformDecisionAction>('SUBSCRIPTION_CHANGE');
  const [targetId, setTargetId] = useState('');
  const [summary, setSummary] = useState('');
  // A subscription change carries the end date it approves; applying it later requires that same date.
  const [subEnd, setSubEnd] = useState('');
  const isSubscription = action === 'SUBSCRIPTION_CHANGE';

  async function reload() {
    setRows(await listPlatformDecisions());
  }

  useEffect(() => {
    reload().catch(() => setRows([]));
  }, []);

  function show(e: unknown) {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('developer.decisions.err_request')));
  }

  async function ask() {
    setError(null);
    setBusy('new');
    try {
      await requestPlatformDecision({ action, targetId: targetId.trim(), summary: summary.trim(), ...(isSubscription ? { subEnd } : {}) });
      setTargetId('');
      setSummary('');
      setSubEnd('');
      await reload();
    } catch (e) {
      show(e);
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: string, approve: boolean) {
    setError(null);
    setBusy(id);
    try {
      await decidePlatformDecision(id, approve);
      await reload();
    } catch (e) {
      show(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>
        {t('developer.decisions.title')}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px' }}>
        {t('developer.decisions.intro')}
      </p>

      <div className="two-col" style={{ marginBottom: 8 }}>
        <div className="field">
          <label>{t('developer.decisions.action')}</label>
          <select value={action} onChange={(e) => setAction(e.target.value as PlatformDecisionAction)}>
            {PLATFORM_DECISION_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(ACTION_LABEL_KEY[a])}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('developer.decisions.target_id')}</label>
          <input className="num" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>{t('developer.decisions.summary_label')}</label>
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t('developer.decisions.summary_placeholder')} />
      </div>
      {isSubscription && (
        <div className="field">
          <label htmlFor="decision-sub-end">{t('developer.decisions.sub_end')}</label>
          <input id="decision-sub-end" type="date" value={subEnd} onChange={(e) => setSubEnd(e.target.value)} />
        </div>
      )}
      <button
        className="btn btn-sm btn-primary"
        onClick={ask}
        disabled={busy === 'new' || !targetId.trim() || summary.trim().length < 10 || (isSubscription && !subEnd)}
      >
        {t('developer.decisions.request')}
      </button>
      {error && <p className="error-text">{error}</p>}

      <table style={{ marginTop: 14 }}>
        <thead>
          <tr>
            <th>{t('developer.decisions.action')}</th>
            <th>{t('developer.decisions.col_summary')}</th>
            <th>{t('developer.decisions.col_requester')}</th>
            <th>{t('developer.common.status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">{t('developer.decisions.empty')}</div>
              </td>
            </tr>
          )}
          {rows.map((d) => (
            <tr key={d.id}>
              <td>{t(ACTION_LABEL_KEY[d.action])}</td>
              <td>
                {d.summary}
                {d.subEnd && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t('developer.decisions.requested_end', { date: dfmt(d.subEnd) })}</div>}
              </td>
              <td>
                {d.requestedBy.displayName}
                <span style={{ fontSize: 11, color: 'var(--muted)' }}> — {dfmt(d.requestedAt)}</span>
              </td>
              <td>
                <span className={`badge ${STATUS_LABEL[d.status].badgeClass}`}>{t(STATUS_LABEL[d.status].labelKey)}</span>
                {d.decidedBy && <span style={{ fontSize: 11, color: 'var(--muted)' }}> — {d.decidedBy.displayName}</span>}
                {d.executedBy && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t('developer.decisions.executed_by', { name: d.executedBy.displayName })}</div>
                )}
              </td>
              <td>
                {d.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" disabled={busy === d.id} onClick={() => decide(d.id, true)}>
                      {t('developer.decisions.approve')}
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={busy === d.id} onClick={() => decide(d.id, false)}>
                      {t('developer.common.reject')}
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
