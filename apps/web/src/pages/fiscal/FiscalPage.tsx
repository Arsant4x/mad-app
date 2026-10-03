import { useEffect, useState } from 'react';
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
  // ⚖️ شهرُ البداية (`ق-١٥٨٤`): لصاحب المنشأة، ويُقبل قبل أوّل ترحيلٍ وحدَه.
  const { user } = useAuth();
  const isOwner = user?.actorType === 'COMPANY';
  const [startMonth, setStartMonth] = useState<number | null>(null);

  const [pendingDelete, setPendingDelete] = useState<FiscalYear | null>(null);
  // ⚖️ إعادةُ فتح الفترة بسببٍ مكتوبٍ يُسجَّل (`ق-١٥٨٣`): يُسأل عنه قبل الفتح، والخادمُ يرفض الفراغ.
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

      {isOwner && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            شهر بداية السنة المالية
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select data-testid="fiscal-start-month" value={startMonth ?? years[0]?.start.slice(5, 7).replace(/^0/, '') ?? '1'} onChange={(e) => setStartMonth(Number(e.target.value))}>
              {AR_MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={handleStartMonth} disabled={!startMonth}>
              تغيير
            </button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            السنة ميلادية افتراضاً وتتجدّد تلقائياً مع أول قيد في سنة جديدة. ويتغيّر شهر بدايتها قبل أول قيد مرحَّل فقط، فيُعاد بناء التقويم منه.
          </p>
        </div>
      )}

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
          لا توجد سنة مالية بعد، وتُنشأ تلقائياً مع أول قيد مرحَّل.
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
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => (isClosed ? setReopenFor({ id: p.id, label: `${AR_MONTHS[p.month - 1]} ${p.year}` }) : togglePeriod(p.id, false))}
                        disabled={busyPeriodId === p.id}
                      >
                        {isClosed ? 'إعادة فتح' : 'إقفال'}
                      </button>
                      {p.reopenReason && <div className="hint" style={{ marginTop: 4 }}>آخر فتح: {p.reopenReason}</div>}
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
              <div className="modal-title">إعادة فتح {reopenFor.label}</div>
              <button className="modal-close" onClick={() => setReopenFor(null)}>
                ✕
              </button>
            </div>
            <div className="field">
              <label>سبب إعادة الفتح</label>
              <textarea data-testid="period-reopen-reason" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="مثال: تصحيح قيد مصروف رُحّل على حساب خطأ" rows={3} />
              <p className="hint" style={{ marginTop: 4 }}>
                يُحفظ السبب على الفترة مع وقت الفتح ومن فتحها. وإعادة الفتح تعكس قيد إقفال السنة إن وُجد، ويُعاد توليده حين تُقفل الفترة ثانيةً.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setReopenFor(null)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={confirmReopen} disabled={!reopenReason.trim()}>
                إعادة فتح
              </button>
            </div>
          </div>
        </div>
      )}

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
