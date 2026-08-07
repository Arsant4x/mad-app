import { useEffect, useMemo, useState } from 'react';
import { listAuditLog, type AuditEntry } from '../../api/audit';
import { ALLOWED_SCREENS, SCREEN_LABELS } from '../../api/templates';

const ACTION_META: Record<string, { label: string; badge: string }> = {
  add: { label: 'إضافة', badge: 'paid' },
  edit: { label: 'تعديل', badge: 'due' },
  delete: { label: 'حذف', badge: 'overdue' },
  record: { label: 'تسجيل', badge: 'paid' },
  review: { label: 'اعتماد', badge: 'draft' },
  audit: { label: 'تدقيق', badge: 'draft' },
  view: { label: 'اطلاع', badge: 'draft' },
};

/** Local date+time — an audit entry is worthless without knowing exactly when. */
function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('ar-SA-u-ca-gregory')} · ${d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const RANGES = [
  { days: 1, label: 'اليوم' },
  { days: 7, label: 'أسبوع' },
  { days: 30, label: 'شهر' },
  { days: 365, label: 'سنة' },
];

/**
 * Who changed what, and when. Read-only by construction — there is no server
 * route to alter an entry, so the screen offers no such control either.
 */
export function AuditLogPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [screen, setScreen] = useState('');
  const [actor, setActor] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAuditLog({ from: isoDaysAgo(days), screen: screen || undefined, limit: 500 })
      .then(setRows)
      .catch(() => setError('تعذّر تحميل سجل التدقيق'))
      .finally(() => setLoading(false));
  }, [days, screen]);

  // Actor filtering is client-side: the list is already bounded by date+screen,
  // and this keeps the dropdown honest — it only offers people who actually
  // appear in what you're looking at.
  const actors = useMemo(() => [...new Set(rows.map((r) => r.actorName))].sort(), [rows]);
  const visible = useMemo(() => (actor ? rows.filter((r) => r.actorName === actor) : rows), [rows, actor]);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">سجل التدقيق</div>
          <div className="page-sub">كل تغيير في النظام: من نفّذه ومتى — سجل غير قابل للتعديل أو الحذف</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="chip-group" style={{ marginBottom: 10 }}>
        {RANGES.map((r) => (
          <button key={r.days} className={days === r.days ? 'chip active' : 'chip'} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={screen} onChange={(e) => setScreen(e.target.value)}>
          <option value="">كل الأقسام</option>
          {ALLOWED_SCREENS.map((s) => (
            <option key={s} value={s}>
              {SCREEN_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">كل المستخدمين</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="hint" style={{ alignSelf: 'center' }}>{visible.length} عملية</span>
      </div>

      {loading ? (
        <p className="hint">جارٍ التحميل…</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">لا عمليات مسجّلة في هذه الفترة.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المستخدم</th>
                <th>الإجراء</th>
                <th>ماذا حدث</th>
                <th>القسم</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = ACTION_META[r.action] ?? { label: r.action, badge: 'draft' };
                const open = expanded === r.id;
                return (
                  <>
                    <tr key={r.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{stamp(r.createdAt)}</td>
                      <td>
                        {r.actorName}
                        {r.actorType === 'COMPANY' && <span className="hint"> (المالك)</span>}
                      </td>
                      <td>
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      </td>
                      <td>{r.summary}</td>
                      <td>{SCREEN_LABELS[r.screen as keyof typeof SCREEN_LABELS] ?? r.screen}</td>
                      <td>
                        {r.details && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(open ? null : r.id)}>
                            {open ? 'إخفاء' : 'التفاصيل'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && r.details && (
                      <tr key={`${r.id}-details`}>
                        <td colSpan={6} style={{ background: 'var(--paper)' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 'calc(12px * var(--font-scale))' }}>
                            {Object.entries(r.details).map(([k, v]) => (
                              <span key={k}>
                                <span className="hint">{k}:</span> {String(v)}
                              </span>
                            ))}
                            {r.ip && (
                              <span>
                                <span className="hint">IP:</span> {r.ip}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
