import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  closeFiscalPeriod,
  createFiscalYear,
  deleteFiscalYear,
  getFiscalYears,
  reopenFiscalPeriod,
  setFiscalStartMonth,
  type FiscalYear,
} from '../../api/fiscal';
import { useAuth } from '../../auth/AuthContext';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import i18n from '../../i18n';

// Month name keys, January first; turned into text where rendered.
const MONTH_KEYS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];

export function FiscalPage() {
  const { t } = useTranslation();
  const monthName = (month: number) => t(`fiscal.months.${MONTH_KEYS[month - 1]}`);
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPeriodId, setBusyPeriodId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  // The start month belongs to the company owner and is accepted only before the first posting.
  const { user } = useAuth();
  const isOwner = user?.actorType === 'COMPANY';
  const { can } = usePermissions();
  // A year is added and deleted by those actions; closing and reopening a period reviews.
  const canAdd = can('fiscal', 'add');
  const canDelete = can('fiscal', 'delete');
  const canReview = can('fiscal', 'review');
  const [startMonth, setStartMonth] = useState<number | null>(null);

  const [pendingDelete, setPendingDelete] = useState<FiscalYear | null>(null);
  // Reopening a period needs a written reason that is recorded; it is asked before reopening and the server refuses a blank one.
  const [reopenFor, setReopenFor] = useState<{ id: string; label: string } | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  async function reload() {
    setYears(await getFiscalYears());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  function serverMessage(e: unknown, fallback: string): string {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    if (Array.isArray(data?.message)) return data.message.join(' — ');
    return data?.message ?? fallback;
  }

  async function handleStartMonth() {
    if (!startMonth) return;
    setError(null);
    try {
      await setFiscalStartMonth(startMonth);
      setStartMonth(null);
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_fiscal_year_save')));
    }
  }

  async function handleCreate() {
    setError(null);
    if (!name.trim() || !start || !end) {
      setError(i18n.t('err_fiscal_year_fields'));
      return;
    }
    setSaving(true);
    try {
      await createFiscalYear({ name: name.trim(), start, end });
      setShowForm(false);
      setName('');
      setStart('');
      setEnd('');
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_fiscal_year_save')));
    } finally {
      setSaving(false);
    }
  }

  async function togglePeriod(periodId: string, isClosed: boolean, reason?: string) {
    setError(null);
    setBusyPeriodId(periodId);
    try {
      await (isClosed ? reopenFiscalPeriod(periodId, reason ?? '') : closeFiscalPeriod(periodId));
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_fiscal_period_toggle')));
    } finally {
      setBusyPeriodId(null);
    }
  }

  async function confirmReopen() {
    if (!reopenFor) return;
    const { id } = reopenFor;
    setReopenFor(null);
    await togglePeriod(id, true, reopenReason.trim());
    setReopenReason('');
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setError(null);
    try {
      await deleteFiscalYear(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_fiscal_year_delete')));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('fiscal.title')}</div>
          <div className="page-sub">{t('fiscal.sub')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
              {t('fiscal.new_year')}
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {isOwner && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            {t('fiscal.start_month')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select data-testid="fiscal-start-month" value={startMonth ?? years[0]?.start.slice(5, 7).replace(/^0/, '') ?? '1'} onChange={(e) => setStartMonth(Number(e.target.value))}>
              {MONTH_KEYS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {monthName(i + 1)}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={handleStartMonth} disabled={!startMonth}>
              {t('fiscal.change')}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            {t('fiscal.start_month_hint')}
          </p>
        </div>
      )}

      {canAdd && showForm && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>
            {t('fiscal.form_title')}
          </div>
          <div className="field">
            <label>{t('fiscal.year_name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fiscal.year_name_placeholder')} />
          </div>
          <div className="two-col">
            <div className="field">
              <label>{t('fiscal.start')}</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('fiscal.end')}</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="hint">{t('fiscal.form_hint')}</p>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? t('fiscal.saving') : t('fiscal.save')}
          </button>
        </div>
      )}

      {years.length === 0 && !showForm && <div className="empty-state">{t('fiscal.empty')}</div>}

      {years.map((year) => (
        <div className="card" key={year.id}>
          <div className="card-head">
            <div className="card-title">
              {year.name}{' '}
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('fiscal.year_range', { start: year.start.slice(0, 10), end: year.end.slice(0, 10) })}</span>
            </div>
            {canDelete && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(year)}>
                {t('fiscal.delete_year')}
              </button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t('fiscal.col_period')}</th>
                <th>{t('fiscal.col_status')}</th>
                <th>{t('fiscal.col_closed_at')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {year.periods.map((p) => {
                const isClosed = p.status === 'CLOSED';
                return (
                  <tr key={p.id}>
                    <td>
                      {monthName(p.month)} {p.year}
                    </td>
                    <td>
                      <span className={isClosed ? 'badge' : 'badge paid'}>{isClosed ? t('fiscal.closed') : t('fiscal.open')}</span>
                    </td>
                    <td>{p.closedAt ? p.closedAt.slice(0, 10) : '—'}</td>
                    <td>
                      {canReview && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => (isClosed ? setReopenFor({ id: p.id, label: `${monthName(p.month)} ${p.year}` }) : togglePeriod(p.id, false))}
                          disabled={busyPeriodId === p.id}
                        >
                          {isClosed ? t('fiscal.reopen') : t('fiscal.close')}
                        </button>
                      )}
                      {p.reopenReason && (
                        <div className="hint" style={{ marginTop: 4 }}>
                          {t('fiscal.last_reopen', { reason: p.reopenReason })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {reopenFor && (
        <div className="overlay" onClick={() => setReopenFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{t('fiscal.reopen_title', { label: reopenFor.label })}</div>
              <button className="modal-close" onClick={() => setReopenFor(null)}>
                ✕
              </button>
            </div>
            <div className="field">
              <label>{t('fiscal.reopen_reason')}</label>
              <textarea
                data-testid="period-reopen-reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={t('fiscal.reopen_placeholder')}
                rows={3}
              />
              <p className="hint" style={{ marginTop: 4 }}>
                {t('fiscal.reopen_hint')}
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setReopenFor(null)}>
                {t('fiscal.cancel')}
              </button>
              <button className="btn btn-primary" onClick={confirmReopen} disabled={!reopenReason.trim()}>
                {t('fiscal.reopen')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('fiscal.delete_title')}
          body={t('fiscal.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('fiscal.delete_confirm')}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
