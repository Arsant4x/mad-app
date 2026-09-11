import { useEffect, useState } from 'react';
import { approveSupport, denySupport, ownerSupportLog, ownerSupportOverview, revokeSupport, type SupportGrant, type SupportLogLine } from '../../api/supportAccess';
import { SCREEN_LABELS } from '../../api/templates';

/** نطاقُ الإذن بأسماء شاشاته — يُعرض في شاشة القرار لا في السجل وحده (ق-٥٢٧). */
function scopeLabel(screens: string[]): string {
  if (screens.length === 0) return 'بلا نطاق — لا تُفتح شاشة';
  return screens.map((s) => SCREEN_LABELS[s as keyof typeof SCREEN_LABELS] ?? s).join(' · ');
}

/**
 * سيادة المالك على وضع الدعم (§1.10): يوافق أو يرفض، يقطع النافذة متى شاء،
 * ويقرأ سجلَّ كل طلبٍ نفّذه الدعم داخلها — بالاسم والسبب والوقت.
 */
export function SupportAccessCard() {
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
      setError(d?.message ?? 'تعذّر تنفيذ الإجراء');
    }
  }

  const pending = grants.filter((g) => g.status === 'PENDING');
  const active = grants.filter((g) => g.active);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">الدعم الفني والوصول لبياناتك</div>
          <div className="page-sub">لا يدخل الدعم بياناتك إلا بموافقتك، لمدة تحددها، قراءةً فقط — وكل ما يفعله مسجَّل هنا</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowLog((v) => !v)}>
          {showLog ? 'إخفاء سجل الوصول' : `سجل الوصول (${log.length})`}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {pending.map((g) => (
        <div key={g.id} className="card" style={{ background: 'var(--bg)', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b>طلب دخول من الدعم الفني ({g.requestedByName})</b>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                السبب: {g.reason} · المدة المطلوبة: {g.durationMinutes} دقيقة
              </div>
              <div style={{ fontSize: 13 }}>
                <b>ما سيراه (قراءةً فقط):</b> {scopeLabel(g.screens)}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => act(approveSupport, g.id)}>
              ✓ موافقة
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => act(denySupport, g.id)}>
              ✗ رفض
            </button>
          </div>
        </div>
      ))}

      {active.map((g) => (
        <div key={g.id} className="card" style={{ background: 'var(--bg)', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b>نافذة دعم فعّالة الآن ({g.requestedByName})</b>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                تنتهي: {g.expiresAt ? new Date(g.expiresAt).toLocaleString('ar-SA') : '—'} · قراءة فقط · النطاق: {scopeLabel(g.screens)}
                {' · '}
                {g.firstEntryAt ? `دخل أوّلَ مرّة: ${new Date(g.firstEntryAt).toLocaleString('ar-SA')}` : 'لم يدخل بعد'}
              </div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => act(revokeSupport, g.id)}>
              ⛔ قطع الوصول الآن
            </button>
          </div>
        </div>
      ))}

      {pending.length === 0 && active.length === 0 && <div className="empty-state">لا طلبات دعم معلّقة ولا نوافذ مفتوحة</div>}

      {showLog && (
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>مَن</th>
              <th>ماذا قرأ</th>
              <th>السبب المعلن</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">لم يدخل الدعم بياناتك قط</div>
                </td>
              </tr>
            )}
            {log.map((l) => (
              <tr key={l.id}>
                <td className="num" style={{ fontSize: 12 }}>
                  {new Date(l.at).toLocaleString('ar-SA')}
                </td>
                {/* من دخل فعلاً (ق-٥٢٨) — والطالبُ يبقى على الإذن نفسه. */}
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
