import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getDueReminders,
  sendReminder,
  updateReminderPolicy,
  type DueReminder,
  type DueReminders,
  type ReminderChannel,
} from '../../api/reminders';
import { listCompanyUsers, type CompanyUser } from '../../api/companyUsers';
import { usePermissions } from '../../auth/PermissionsContext';
import { dfmt, fmt } from '../../lib/format';

const CHANNELS: ReminderChannel[] = ['WHATSAPP', 'SMS', 'CALL', 'EMAIL', 'OTHER'];

export function RemindersPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  // Logging a sent reminder needs record on contracts; the server refuses it otherwise.
  const canRecord = can('contracts', 'record');
  const [data, setData] = useState<DueReminders | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [channel, setChannel] = useState<ReminderChannel>('WHATSAPP');
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState<CompanyUser[]>([]);

  async function reload() {
    setData(await getDueReminders());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // Only the owner may list employees; for everyone else the recipient
    // picker simply offers "the account owner", which is always valid.
    listCompanyUsers()
      .then(setUsers)
      .catch(() => undefined);
  }, []);

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
      after?.();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(d?.message) ? d.message.join(' — ') : (d?.message ?? t('reminders.page.err_failed')));
    } finally {
      setBusy(false);
    }
  }

  function openFor(r: DueReminder) {
    setOpenId(openId === r.installmentId ? null : r.installmentId);
    setMessage(r.message);
    setChannel('WHATSAPP');
    setError(null);
  }

  /** Copying is the actual "send" today — see the notice below. */
  async function copy(r: DueReminder) {
    await navigator.clipboard.writeText(r.message);
    setCopiedId(r.installmentId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading || !data) return null;

  const upcoming = data.reminders.filter((r) => r.overdueDays <= 0);
  const overdue = data.reminders.filter((r) => r.overdueDays > 0);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('reminders.page.title')}</div>
          <div className="page-sub">{t('reminders.page.sub')}</div>
        </div>
      </div>

      {/* The single most important thing on this screen: the platform does not
          send anything. Saying otherwise would be discovered the first time
          rent goes uncollected. */}
      <p className="hint" style={{ marginBottom: 12 }}>
        {t('reminders.page.notice')}
      </p>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="two-col">
          <div className="field">
            <label>{t('reminders.page.days_before')}</label>
            <input
              type="number"
              min="0"
              max="30"
              value={data.policy.daysBefore}
              onChange={(e) => run(() => updateReminderPolicy({ daysBefore: Number(e.target.value) }))}
            />
            <p className="hint">{t('reminders.page.days_before_hint')}</p>
          </div>
          <div className="field">
            <label>{t('reminders.page.repeat')}</label>
            <input
              type="number"
              min="1"
              max="90"
              value={data.policy.repeatEveryDays}
              onChange={(e) => run(() => updateReminderPolicy({ repeatEveryDays: Number(e.target.value) }))}
            />
            {/* Explains the floor of 1 rather than letting it look arbitrary. */}
            <p className="hint">{t('reminders.page.repeat_hint')}</p>
          </div>
        </div>
        <div className="field">
          <label>
            <input type="checkbox" checked={data.policy.enabled} onChange={(e) => run(() => updateReminderPolicy({ enabled: e.target.checked }))} />{' '}
            {t('reminders.page.enable')}
          </label>
        </div>

        {/* Escalation: when an arrear stops being the collector's problem. */}
        <div className="two-col" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
          <div className="field">
            <label>{t('reminders.page.escalate_after')}</label>
            <input
              type="number"
              min="1"
              max="365"
              placeholder={t('reminders.page.escalate_placeholder')}
              value={data.policy.escalateAfterDays ?? ''}
              onChange={(e) => run(() => updateReminderPolicy({ escalateAfterDays: e.target.value === '' ? null : Number(e.target.value) }))}
            />
            <p className="hint">{t('reminders.page.escalate_hint')}</p>
          </div>
          <div className="field">
            <label>{t('reminders.page.escalate_to')}</label>
            <select
              value={data.policy.escalateToUserId ?? ''}
              onChange={(e) => run(() => updateReminderPolicy({ escalateToUserId: e.target.value === '' ? null : e.target.value }))}
            >
              <option value="">{t('reminders.page.account_owner')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {/* Says plainly where it arrives, so nobody waits for an SMS. */}
            <p className="hint">{t('reminders.page.escalate_to_hint')}</p>
          </div>
        </div>
      </div>

      {!data.enabled && <div className="empty-state">{t('reminders.page.disabled')}</div>}

      {data.enabled && (
        <>
          <div className="chip-group" style={{ marginBottom: 10 }}>
            <span className="chip">{t('reminders.page.overdue_count', { n: overdue.length })}</span>
            <span className="chip">{t('reminders.page.upcoming_count', { n: upcoming.length })}</span>
          </div>

          {data.truncated && (
            // Says the list is a queue, not the whole picture — otherwise the
            // count and the rows disagree and the user trusts neither.
            <p className="hint" style={{ marginBottom: 8 }}>
              {t('reminders.page.truncated', { shown: data.reminders.length, total: data.total })}
            </p>
          )}

          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>{t('reminders.page.col_tenant')}</th>
                  <th>{t('reminders.page.col_location')}</th>
                  <th>{t('reminders.page.col_due')}</th>
                  <th>{t('reminders.page.col_amount')}</th>
                  <th>{t('reminders.page.col_status')}</th>
                  <th>{t('reminders.page.col_last')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.reminders.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">{t('reminders.page.empty')}</div>
                    </td>
                  </tr>
                )}
                {data.reminders.map((r) => (
                  <tr key={r.installmentId}>
                    <td>
                      {r.tenant}
                      <div className="hint">
                        {r.contractNo}
                        {r.phone ? ` — ${r.phone}` : t('reminders.page.no_phone')}
                      </div>
                    </td>
                    <td>
                      {r.propertyName}
                      <div className="hint">{t('reminders.page.unit_no', { unit: r.unitNo })}</div>
                    </td>
                    <td className="num">{dfmt(r.dueDate)}</td>
                    <td className="num">{fmt(r.amount)}</td>
                    <td>
                      {r.overdueDays > 0 ? (
                        <span className="badge overdue">{t('reminders.page.overdue_days', { n: r.overdueDays })}</span>
                      ) : (
                        <span className="badge due">{t('reminders.page.due_in', { n: Math.abs(r.overdueDays) })}</span>
                      )}
                    </td>
                    <td className="num">{r.lastSentAt ? t('reminders.page.last_sent', { date: dfmt(r.lastSentAt), n: r.daysSinceLast }) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost" onClick={() => copy(r)}>
                          {copiedId === r.installmentId ? t('reminders.page.copied') : t('reminders.page.copy')}
                        </button>
                        {canRecord && (
                          <button className="btn btn-ghost" onClick={() => openFor(r)}>
                            {t('reminders.page.record_send')}
                          </button>
                        )}
                      </div>

                      {canRecord && openId === r.installmentId && (
                        <div className="card" style={{ background: '#faf9f5', marginTop: 6 }}>
                          <div className="field">
                            <label>{t('reminders.page.channel')}</label>
                            <select value={channel} onChange={(e) => setChannel(e.target.value as ReminderChannel)}>
                              {CHANNELS.map((c) => (
                                <option key={c} value={c}>
                                  {t(`reminders.channel.${c}`)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label>{t('reminders.page.message')}</label>
                            <textarea
                              value={message}
                              onChange={(e) => setMessage(e.target.value)}
                              rows={3}
                              style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.5, padding: 9, border: '1px solid var(--line)', borderRadius: 8 }}
                            />
                            {/* Stored as sent, not regenerated later. */}
                            <p className="hint">{t('reminders.page.message_hint')}</p>
                          </div>
                          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                            <button className="btn btn-ghost" onClick={() => setOpenId(null)}>
                              {t('reminders.page.back')}
                            </button>
                            <button
                              className="btn btn-primary"
                              disabled={busy || !message.trim()}
                              onClick={() => run(() => sendReminder(r.installmentId, { channel, message: message.trim() }), () => setOpenId(null))}
                            >
                              {t('reminders.page.record')}
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
