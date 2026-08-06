import { useEffect, useState } from 'react';
import {
  closeFiscalPeriod,
  createFiscalYear,
  deleteFiscalYear,
  getFiscalYears,
  reopenFiscalPeriod,
  type FiscalYear,
} from '../../api/fiscal';
import { ConfirmModal } from '../../components/ConfirmModal';
import i18n from '../../i18n';

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function FiscalPage() {
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPeriodId, setBusyPeriodId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<FiscalYear | null>(null);

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

  async function togglePeriod(periodId: string, isClosed: boolean) {
    setError(null);
    setBusyPeriodId(periodId);
    try {
      await (isClosed ? reopenFiscalPeriod(periodId) : closeFiscalPeriod(periodId));
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_fiscal_period_toggle')));
    } finally {
      setBusyPeriodId(null);
    }
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
          <div className="page-title">السنة المالية والفترات</div>
          <div className="page-sub">إقفال الفترة يمنع أي قيد فيها — والتصحيح يكون بقيد عكسي في فترة مفتوحة</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            + سنة مالية
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {showForm && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>
            سنة مالية جديدة
          </div>
          <div className="field">
            <label>اسم السنة</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: السنة المالية 2026" />
          </div>
          <div className="two-col">
            <div className="field">
              <label>تاريخ البداية</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field">
              <label>تاريخ النهاية</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="hint">تُنشأ 12 فترة شهرية مفتوحة ابتداءً من تاريخ البداية. الإقفال لاحقاً من الجدول.</p>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      )}

      {years.length === 0 && !showForm && (
        <div className="empty-state">
          لا توجد سنة مالية معرَّفة — ولا يوجد أي قيد ممنوع حالياً. عرّف سنة مالية لتتمكن من إقفال الفترات.
        </div>
      )}

      {years.map((year) => (
        <div className="card" key={year.id}>
          <div className="card-head">
            <div className="card-title">
              {year.name} <span style={{ fontSize: 12, color: 'var(--muted)' }}>({year.start.slice(0, 10)} → {year.end.slice(0, 10)})</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(year)}>
              حذف السنة
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>الفترة</th>
                <th>الحالة</th>
                <th>تاريخ الإقفال</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {year.periods.map((p) => {
                const isClosed = p.status === 'CLOSED';
                return (
                  <tr key={p.id}>
                    <td>
                      {AR_MONTHS[p.month - 1]} {p.year}
                    </td>
                    <td>
                      <span className={isClosed ? 'badge' : 'badge paid'}>{isClosed ? 'مقفلة' : 'مفتوحة'}</span>
                    </td>
                    <td>{p.closedAt ? p.closedAt.slice(0, 10) : '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => togglePeriod(p.id, isClosed)} disabled={busyPeriodId === p.id}>
                        {isClosed ? 'إعادة فتح' : 'إقفال'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {pendingDelete && (
        <ConfirmModal
          title="حذف السنة المالية"
          body={`سيُحذف "${pendingDelete.name}" وكل فتراته. القيود المرحَّلة لا تُحذف — يزول عنها قيد الإقفال فقط.`}
          confirmLabel="حذف"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
