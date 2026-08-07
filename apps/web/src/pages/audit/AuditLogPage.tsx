import { useEffect, useMemo, useState } from 'react';
import { listAuditLog, type AuditEntry } from '../../api/audit';
import { ALLOWED_SCREENS, SCREEN_LABELS } from '../../api/templates';

/** Arabic label + badge per action, matching the actions the server enforces
 * (@RequiresAction) rather than the mockup's generic create/update/delete. */
const ACTION_META: Record<string, { label: string; badge: string }> = {
  add: { label: 'إنشاء', badge: 'paid' },
  edit: { label: 'تعديل', badge: 'due' },
  delete: { label: 'حذف', badge: 'overdue' },
  record: { label: 'تسجيل', badge: 'paid' },
  review: { label: 'اعتماد', badge: 'draft' },
  audit: { label: 'تدقيق', badge: 'draft' },
  view: { label: 'اطلاع', badge: 'draft' },
};

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('ar-SA-u-ca-gregory')} · ${d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * سجل العمليات — ported from the v20 mockup's `screen-audit-log`: the same
 * topbar (with the "غير قابل للحذف أو التعديل" badge), the same toolbar
 * (search + module filter + action filter + "عرض مبسّط"), and the same table
 * columns. Read-only by construction: the server exposes no way to alter an
 * entry, so no control here offers to.
 */
export function AuditLogPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [screen, setScreen] = useState('');
  const [action, setAction] = useState('');
  // The mockup's "عرض مبسّط": hides the technical detail column for a reader
  // who only wants the story, not the payload.
  const [simplified, setSimplified] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAuditLog({ screen: screen || undefined, limit: 500 })
      .then(setRows)
      .catch(() => setError('تعذّر تحميل سجل العمليات'))
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
            سجل العمليات{' '}
            <span className="badge paid" style={{ fontSize: 10, verticalAlign: 'middle' }}>
              غير قابل للحذف أو التعديل
            </span>
          </div>
          <div className="page-sub">توثيق تلقائي لكل حركة بالنظام — لأغراض التدقيق والمساءلة</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالمستخدم أو العنصر..." />
        </div>
        <select value={screen} onChange={(e) => setScreen(e.target.value)} style={{ width: 'auto', padding: '8px 10px' }}>
          <option value="">كل الأقسام</option>
          {ALLOWED_SCREENS.map((s) => (
            <option key={s} value={s}>
              {SCREEN_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 'auto', padding: '8px 10px' }}>
          <option value="">كل أنواع العمليات</option>
          {Object.entries(ACTION_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
        <div className="field" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'calc(12.5px * var(--font-scale))', marginBottom: 0 }}>
            <input type="checkbox" checked={simplified} onChange={(e) => setSimplified(e.target.checked)} style={{ width: 'auto' }} />
            عرض مبسّط
          </label>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="hint">جارٍ التحميل…</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">لا عمليات مسجّلة مطابقة.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>المستخدم</th>
                <th>القسم</th>
                <th>نوع العملية</th>
                <th>التفاصيل</th>
                {!simplified && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = ACTION_META[r.action] ?? { label: r.action, badge: 'draft' };
                const open = expanded === r.id;
                return (
                  <>
                    <tr key={r.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {stamp(r.createdAt)}
                      </td>
                      <td>
                        {r.actorName}
                        {r.actorType === 'COMPANY' && <span className="hint"> (المالك)</span>}
                      </td>
                      <td>{SCREEN_LABELS[r.screen as keyof typeof SCREEN_LABELS] ?? r.screen}</td>
                      <td>
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      </td>
                      <td>{r.summary}</td>
                      {!simplified && (
                        <td>
                          {r.details && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(open ? null : r.id)}>
                              {open ? 'إخفاء' : 'التفاصيل'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {open && !simplified && r.details && (
                      <tr key={`${r.id}-d`}>
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
