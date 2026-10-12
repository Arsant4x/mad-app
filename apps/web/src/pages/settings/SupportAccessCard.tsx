import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { approveSupport, denySupport, ownerSupportLog, ownerSupportOverview, revokeSupport, type SupportGrant, type SupportLogLine } from '../../api/supportAccess';
import { SCREEN_LABELS } from '../../api/templates';
import i18n from '../../i18n';
import { formatDateTime } from '../../i18n/format';

/** The grant's scope by screen names, shown where the owner decides, not only in the log. */
function scopeLabel(screens: string[]): string {
  if (screens.length === 0) return i18n.t('settings.support.no_scope');
  return screens.map((s) => SCREEN_LABELS[s as keyof typeof SCREEN_LABELS] ?? s).join(' · ');
}

/**
 * The owner's control over support mode: approve or deny, cut the window at any
 * time, and read every request support made inside it, with name, reason and time.
 */
export function SupportAccessCard() {
  const { t } = useTranslation();
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [log, setLog] = useState<SupportLogLine[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [g, l] = await Promise.all([ownerSupportOverview(), ownerSupportLog()]);
    setGrants(g);
    setLog(l);
  }

  useEffect(() => {
    reload().catch(() => {});
  }, []);

  async function act(fn: (id: string) => Promise<unknown>, id: string) {
    setError(null);
    try {
      await fn(id);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('settings.support.err_action'));
    }
  }

  const pending = grants.filter((g) => g.status === 'PENDING');
  const active = grants.filter((g) => g.active);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">{t('settings.support.title')}</div>
          <div className="page-sub">{t('settings.support.subtitle')}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowLog((v) => !v)}>
          {showLog ? t('settings.support.hide_log') : t('settings.support.show_log', { n: log.length })}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {pending.map((g) => (
        <div key={g.id} className="card" style={{ background: 'var(--bg)', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b>{t('settings.support.pending_title', { name: g.requestedByName })}</b>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {t('settings.support.pending_detail', { reason: g.reason, minutes: g.durationMinutes })}
              </div>
              <div style={{ fontSize: 13 }}>
                <b>{t('settings.support.will_see')}</b> {scopeLabel(g.screens)}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => act(approveSupport, g.id)}>
              {t('settings.support.approve')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => act(denySupport, g.id)}>
              {t('settings.support.deny')}
            </button>
          </div>
        </div>
      ))}

      {active.map((g) => (
        <div key={g.id} className="card" style={{ background: 'var(--bg)', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b>{t('settings.support.active_title', { name: g.requestedByName })}</b>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {t('settings.support.active_detail', { expires: g.expiresAt ? formatDateTime(g.expiresAt) : '—', scope: scopeLabel(g.screens) })}
                {' · '}
                {g.firstEntryAt ? t('settings.support.first_entry', { at: formatDateTime(g.firstEntryAt) }) : t('settings.support.not_entered')}
              </div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => act(revokeSupport, g.id)}>
              {t('settings.support.revoke_now')}
            </button>
          </div>
        </div>
      ))}

      {pending.length === 0 && active.length === 0 && <div className="empty-state">{t('settings.support.empty')}</div>}

      {showLog && (
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>{t('settings.support.col_time')}</th>
              <th>{t('settings.support.col_who')}</th>
              <th>{t('settings.support.col_what')}</th>
              <th>{t('settings.support.col_reason')}</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">{t('settings.support.log_empty')}</div>
                </td>
              </tr>
            )}
            {log.map((l) => (
              <tr key={l.id}>
                <td className="num" style={{ fontSize: 12 }}>
                  {formatDateTime(l.at)}
                </td>
                {/* Who actually entered; the requester stays on the grant itself. */}
                <td style={{ fontSize: 12 }}>{l.actorName || l.grant.requestedByName}</td>
                <td className="num" style={{ fontSize: 12 }}>
                  {l.method} {l.path}
                </td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{l.grant.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
