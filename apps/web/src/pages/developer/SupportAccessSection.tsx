import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { adminListSupportGrants, requestSupportAccess, type SupportGrant } from '../../api/supportAccess';
import { listCompanies, type Company } from '../../api/companies';
import { ALLOWED_SCREENS, SCREEN_LABELS } from '../../api/templates';
import { enterSupportMode } from '../../lib/supportMode';
import { formatTime } from '../../i18n/format';
import i18n from '../../i18n';

const statusLabels = (): Record<string, { label: string; cls: string }> => ({
  PENDING: { label: i18n.t('developer.support.status.pending'), cls: 'draft' },
  APPROVED: { label: i18n.t('developer.support.status.approved'), cls: 'paid' },
  DENIED: { label: i18n.t('developer.support.status.denied'), cls: 'overdue' },
  REVOKED: { label: i18n.t('developer.support.status.revoked'), cls: 'overdue' },
});

function isActive(g: SupportGrant): boolean {
  return g.status === 'APPROVED' && !!g.expiresAt && new Date(g.expiresAt) > new Date();
}

/**
 * Technical support mode, platform admin side: request access with a written reason and a duration,
 * then wait for the owner's approval. Entering is possible only inside an active window, read only,
 * and every request is logged for the company.
 */
export function SupportAccessSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('60');
  /** The scope of what can be seen: chosen by the requester and shown to the owner before deciding. */
  const [screens, setScreens] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleScreen(screen: string) {
    setScreens((cur) => (cur.includes(screen) ? cur.filter((s) => s !== screen) : [...cur, screen]));
  }

  async function reload() {
    const [g, c] = await Promise.all([adminListSupportGrants(), listCompanies()]);
    setGrants(g);
    setCompanies(c);
  }

  useEffect(() => {
    reload().catch(() => {});
  }, []);

  async function handleRequest() {
    setError(null);
    if (!companyId || reason.trim().length < 5) {
      setError(t('developer.support.err_fields'));
      return;
    }
    if (screens.length === 0) {
      setError(t('developer.support.err_scope'));
      return;
    }
    try {
      await requestSupportAccess(companyId, reason.trim(), Number(duration), screens);
      setRequesting(false);
      setCompanyId('');
      setReason('');
      setScreens([]);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('developer.support.err_send'));
    }
  }

  function enter(g: SupportGrant) {
    enterSupportMode(g.companyId, g.companyName);
    navigate('/');
    // RoleAwareIndex switches to the tenant view on next render.
    window.location.reload();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">{t('developer.support.title')}</div>
          <div className="page-sub">{t('developer.support.subtitle')}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setRequesting(true)}>
          {t('developer.support.request_access')}
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t('developer.common.company')}</th>
            <th>{t('developer.common.reason')}</th>
            <th>{t('developer.common.status')}</th>
            <th>{t('developer.support.col_window')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {grants.length === 0 && (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">{t('developer.support.empty')}</div>
              </td>
            </tr>
          )}
          {grants.map((g) => {
            const st = statusLabels()[g.status] ?? { label: g.status, cls: 'draft' };
            const active = isActive(g);
            return (
              <tr key={g.id}>
                <td>{g.companyName || g.companyId}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{g.reason}</td>
                <td>
                  <span className={`badge ${active ? 'paid' : st.cls}`}>{active ? st.label : g.status === 'APPROVED' ? t('developer.support.expired') : st.label}</span>
                </td>
                <td className="num" style={{ fontSize: 12 }}>
                  {g.expiresAt
                    ? t('developer.support.until', { time: formatTime(g.expiresAt, { hour: '2-digit', minute: '2-digit' }) })
                    : t('developer.support.minutes', { n: g.durationMinutes })}
                </td>
                <td>
                  {active && (
                    <button className="btn btn-primary btn-sm" onClick={() => enter(g)}>
                      {t('developer.support.enter')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {requesting && (
        <div className="overlay" onClick={() => setRequesting(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <div className="modal-title">{t('developer.support.modal_title')}</div>
              <button className="modal-close" onClick={() => setRequesting(false)}>
                ✕
              </button>
            </div>
            <div className="field">
              <label>{t('developer.common.company')}</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">{t('developer.support.choose')}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.orgName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('developer.support.reason_label')}</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('developer.support.reason_placeholder')} />
            </div>
            <div className="field">
              <label>{t('developer.support.scope_label')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALLOWED_SCREENS.map((s) => (
                  <label key={s} className={`badge ${screens.includes(s) ? 'paid' : 'draft'}`} style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={screens.includes(s)} onChange={() => toggleScreen(s)} style={{ marginInlineEnd: 4 }} />
                    {SCREEN_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>{t('developer.support.duration')}</label>
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="30">{t('developer.support.duration_30')}</option>
                <option value="60">{t('developer.support.duration_60')}</option>
                <option value="240">{t('developer.support.duration_240')}</option>
                <option value="1440">{t('developer.support.duration_1440')}</option>
              </select>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setRequesting(false)}>
                {t('developer.common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleRequest}>
                {t('developer.support.send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
