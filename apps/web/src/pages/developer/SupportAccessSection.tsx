import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminListSupportGrants, requestSupportAccess, type SupportGrant } from '../../api/supportAccess';
import { listCompanies, type Company } from '../../api/companies';
import { ALLOWED_SCREENS, SCREEN_LABELS } from '../../api/templates';
import { enterSupportMode } from '../../lib/supportMode';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'بانتظار موافقة المنشأة', cls: 'draft' },
  APPROVED: { label: 'نافذة فعّالة', cls: 'paid' },
  DENIED: { label: 'رفضته المنشأة', cls: 'overdue' },
  REVOKED: { label: 'قطعته المنشأة', cls: 'overdue' },
};

function isActive(g: SupportGrant): boolean {
  return g.status === 'APPROVED' && !!g.expiresAt && new Date(g.expiresAt) > new Date();
}

/**
 * وضع الدعم الفني — جانب مدير المنصة (§1.10): يطلب بسبب مكتوب ومدة، وينتظر
 * موافقة المالك. «الدخول» متاح فقط داخل نافذة فعّالة، قراءةً، وكل طلب يُسجَّل
 * أمام المنشأة.
 */
export function SupportAccessSection() {
  const navigate = useNavigate();
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('60');
  /** نطاقُ ما يُرى — يختاره الطالب هنا ويراه المالك قبل قراره (ق-٥٢٧). */
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
      setError('اختر المنشأة واكتب سبباً واضحاً (٥ أحرف فأكثر) — يظهر للمالك حرفياً.');
      return;
    }
    if (screens.length === 0) {
      setError('حدّد الشاشات التي يحتاجها الفحص — إذنٌ بلا نطاقٍ ليس تعليمة، والمالك يراها قبل قراره.');
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
      setError(d?.message ?? 'تعذّر إرسال الطلب');
    }
  }

  function enter(g: SupportGrant) {
    enterSupportMode(g.companyId, g.company?.orgName ?? '');
    navigate('/');
    // RoleAwareIndex switches to the tenant view on next render.
    window.location.reload();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">وضع الدعم الفني</div>
          <div className="page-sub">دخول لبيانات منشأة بموافقتها فقط · قراءة فقط · مسجَّل بالكامل أمامها</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setRequesting(true)}>
          + طلب دخول
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>المنشأة</th>
            <th>السبب</th>
            <th>الحالة</th>
            <th>النافذة</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {grants.length === 0 && (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">لا طلبات دعم</div>
              </td>
            </tr>
          )}
          {grants.map((g) => {
            const st = STATUS_LABELS[g.status] ?? { label: g.status, cls: 'draft' };
            const active = isActive(g);
            return (
              <tr key={g.id}>
                <td>{g.company?.orgName ?? g.companyId}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{g.reason}</td>
                <td>
                  <span className={`badge ${active ? 'paid' : st.cls}`}>{active ? st.label : g.status === 'APPROVED' ? 'انقضت' : st.label}</span>
                </td>
                <td className="num" style={{ fontSize: 12 }}>
                  {g.expiresAt ? `حتى ${new Date(g.expiresAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}` : `${g.durationMinutes} دقيقة`}
                </td>
                <td>
                  {active && (
                    <button className="btn btn-primary btn-sm" onClick={() => enter(g)}>
                      🔍 دخول للمعاينة
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
              <div className="modal-title">طلب دخول دعم فني</div>
              <button className="modal-close" onClick={() => setRequesting(false)}>
                ✕
              </button>
            </div>
            <div className="field">
              <label>المنشأة</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— اختر —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.orgName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>السبب (يظهر للمالك)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: فحص شكوى ترقيم فواتير" />
            </div>
            <div className="field">
              <label>نطاق الشاشات (يراه المالك قبل موافقته — وما ليس فيه لا يُفتح)</label>
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
              <label>المدة</label>
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="30">30 دقيقة</option>
                <option value="60">ساعة</option>
                <option value="240">4 ساعات</option>
                <option value="1440">يوم كامل</option>
              </select>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setRequesting(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={handleRequest}>
                إرسال الطلب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
