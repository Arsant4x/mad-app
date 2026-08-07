import { useEffect, useState } from 'react';
import { exportAllData, getSubscription, renewSubscription, type SubscriptionStatus } from '../../api/subscription';
import { useAuth } from '../../auth/AuthContext';
import { DeletionRequestCard } from './DeletionRequestCard';

const STATUS_META: Record<SubscriptionStatus['status'], { label: string; badge: string }> = {
  ACTIVE: { label: 'نشط', badge: 'paid' },
  FROZEN: { label: 'فترة سماح (اطلاع فقط)', badge: 'due' },
  STOPPED: { label: 'متوقف', badge: 'overdue' },
};

const MONTH_OPTIONS = [1, 3, 6, 12];

/**
 * The tenant's own subscription: current state + self-service renewal. Reachable
 * even while frozen or stopped (that's the point). `standalone` renders it as a
 * full-screen gate for a stopped account, with a logout escape hatch.
 */
export function SubscriptionPage({ standalone = false }: { standalone?: boolean }) {
  const { logout } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSubscription()
      .then(setSub)
      .catch(() => setError('تعذّر تحميل بيانات الاشتراك'))
      .finally(() => setLoading(false));
  }, []);

  async function renew() {
    setError(null);
    setBusy(true);
    try {
      await renewSubscription(months);
      // A full reload re-mints the session from the refresh cookie, so the new
      // ACTIVE status takes effect everywhere (banner/gate clear) in one step.
      window.location.href = '/';
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(data?.message ?? 'تعذّر تجديد الاشتراك');
      setBusy(false);
    }
  }


  async function downloadExport() {
    setExporting(true);
    try {
      const data = await exportAllData();
      // Built client-side into a file download; nothing is sent anywhere.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mad-app-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('تعذّر تصدير البيانات');
    } finally {
      setExporting(false);
    }
  }

  if (loading) return standalone ? <div className="status-screen"><p>جارٍ التحميل…</p></div> : <p className="hint">جارٍ التحميل…</p>;

  const body = (
    <div style={{ maxWidth: 560 }}>
      {sub && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b>{sub.orgName}</b>
              <span className={`badge ${STATUS_META[sub.status].badge}`}>{STATUS_META[sub.status].label}</span>
            </div>
            <div className="hint">بداية الاشتراك: {sub.subStart ?? '—'}</div>
            <div className="hint">نهاية الاشتراك: {sub.subEnd ?? '—'}</div>
            {sub.status === 'ACTIVE' && sub.daysLeft !== null && <div className="hint">متبقٍّ: {sub.daysLeft} يوم</div>}
            {sub.status === 'FROZEN' && (
              <p className="hint" style={{ color: 'var(--rose)', marginTop: 8 }}>
                انتهى اشتراكك. أنت في فترة سماح للاطلاع والتصدير فقط{sub.graceDaysLeft !== null ? ` (يتبقّى ${sub.graceDaysLeft} يوم قبل الإيقاف)` : ''} — جدّد لاستعادة الإضافة والتعديل.
              </p>
            )}
            {sub.status === 'STOPPED' && (
              <p className="hint" style={{ color: 'var(--rose)', marginTop: 8 }}>الحساب متوقف. جدّد اشتراكك لاستعادة الوصول الكامل.</p>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>تجديد الاشتراك</div>
            <div className="chip-group" style={{ marginBottom: 10 }}>
              {MONTH_OPTIONS.map((m) => (
                <button key={m} className={months === m ? 'chip active' : 'chip'} onClick={() => setMonths(m)}>
                  {m} شهر
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginBottom: 10 }}>الدفع الإلكتروني قيد الإضافة — التجديد الآن يمدّد الاشتراك مباشرةً.</p>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary" disabled={busy} onClick={renew}>
              {busy ? 'جارٍ التجديد…' : `تجديد ${months} شهر`}
            </button>
          </div>
        </>
      )}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>نسخة من بياناتك</div>
        <p className="hint" style={{ marginBottom: 10 }}>ملف JSON واحد يضمّ كل بيانات منشأتك — متاح دائماً، حتى في فترة السماح.</p>
        <button className="btn btn-ghost btn-sm" disabled={exporting} onClick={downloadExport}>
          {exporting ? 'جارٍ التجهيز…' : 'تصدير كل البيانات'}
        </button>
      </div>
      <DeletionRequestCard />
      {standalone && (
        <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => logout()}>
          تسجيل الخروج
        </button>
      )}
    </div>
  );

  if (standalone) {
    return (
      <div className="status-screen">
        <h1>الاشتراك</h1>
        {body}
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الاشتراك</div>
          <div className="page-sub">حالة اشتراكك وتجديده من داخل المنصة</div>
        </div>
      </div>
      {body}
    </div>
  );
}
