import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listAuditLog, type AuditEntry } from '../../api/audit';
import { ALLOWED_SCREENS, SCREEN_LABELS } from '../../api/templates';
import { formatDate, formatTime } from '../../i18n/format';

/** Label key and badge per action, matching the actions the server enforces
 * (@RequiresAction) rather than generic create/update/delete. */
const ACTION_META: Record<string, { key: string; badge: string }> = {
  add: { key: 'audit.actions.add', badge: 'paid' },
  edit: { key: 'audit.actions.edit', badge: 'due' },
  delete: { key: 'audit.actions.delete', badge: 'overdue' },
  record: { key: 'audit.actions.record', badge: 'paid' },
  review: { key: 'audit.actions.review', badge: 'draft' },
  audit: { key: 'audit.actions.audit', badge: 'draft' },
  view: { key: 'audit.actions.view', badge: 'draft' },
};

function stamp(iso: string): string {
  return `${formatDate(iso, undefined, 'ar-SA-u-ca-gregory')} · ${formatTime(iso, { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Audit log. Read only by construction: the server exposes no way to alter an
 * entry, so no control here offers to.
 */
export function AuditLogPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [screen, setScreen] = useState('');
  const [action, setAction] = useState('');
  // Simplified view hides the technical detail column for a reader who only
  // wants the story, not the payload.
  const [simplified, setSimplified] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAuditLog({ screen: screen || undefined, limit: 500 })
      .then(setRows)
      .catch(() => setError(t('audit.load_failed')))
      .finally(() => setLoading(false));
  }, [screen]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (action && r.action !== action) return false;
      if (!q) return true;
      return r.actorName.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q);
    });
  }, [rows, search, action]);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">
            {t('audit.title')}{' '}
            <span className="badge paid" style={{ fontSize: 10, verticalAlign: 'middle' }}>
              {t('audit.immutable_badge')}
            </span>
          </div>
          <div className="page-sub">{t('audit.subtitle')}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('audit.search_placeholder')} />
        </div>
        <select value={screen} onChange={(e) => setScreen(e.target.value)} style={{ width: 'auto', padding: '8px 10px' }}>
          <option value="">{t('audit.all_sections')}</option>
          {ALLOWED_SCREENS.map((s) => (
            <option key={s} value={s}>
              {SCREEN_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 'auto', padding: '8px 10px' }}>
          <option value="">{t('audit.all_actions')}</option>
          {Object.entries(ACTION_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {t(meta.key)}
            </option>
          ))}
        </select>
        <div className="field" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'calc(12.5px * var(--font-scale))', marginBottom: 0 }}>
            <input type="checkbox" checked={simplified} onChange={(e) => setSimplified(e.target.checked)} style={{ width: 'auto' }} />
            {t('audit.simplified_view')}
          </label>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="hint">{t('audit.loading')}</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">{t('audit.empty')}</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>{t('audit.col.datetime')}</th>
                <th>{t('audit.col.user')}</th>
                <th>{t('audit.col.section')}</th>
                <th>{t('audit.col.action')}</th>
                <th>{t('audit.col.details')}</th>
                {!simplified && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = ACTION_META[r.action];
                const label = meta ? t(meta.key) : r.action;
                const badge = meta?.badge ?? 'draft';
                const open = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {stamp(r.createdAt)}
                      </td>
                      <td>
                        {r.actorName}
                        {r.actorType === 'COMPANY' && <span className="hint">{t('audit.owner_suffix')}</span>}
                        {r.actorType === 'PLATFORM_ADMIN' && <span className="hint">{t('audit.platform_admin_suffix')}</span>}
                      </td>
                      <td>{SCREEN_LABELS[r.screen as keyof typeof SCREEN_LABELS] ?? r.screen}</td>
                      <td>
                        <span className={`badge ${badge}`}>{label}</span>
                      </td>
                      <td>{r.summary}</td>
                      {!simplified && (
                        <td>
                          {r.details && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(open ? null : r.id)}>
                              {open ? t('audit.hide') : t('audit.details')}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {open && !simplified && r.details && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--paper)' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 'calc(12px * var(--font-scale))' }}>
                            {Object.entries(r.details).map(([k, v]) => (
                              <span key={k}>
                                <span className="hint">{k}:</span> {String(v)}
                              </span>
                            ))}
                            {r.ip && (
                              <span>
                                <span className="hint">{t('audit.ip_label')}</span> {r.ip}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
