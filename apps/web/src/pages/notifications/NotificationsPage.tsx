import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  runEscalation,
  runWarrantyCheck,
  type AppNotification,
  type NotificationList,
} from '../../api/notifications';
import { dfmt } from '../../lib/format';

export function NotificationsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  async function reload(only = unreadOnly) {
    setData(await listNotifications(only));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(d?.message) ? d.message.join(' — ') : (d?.message ?? 'تعذّر إتمام العملية'));
    } finally {
      setBusy(false);
    }
  }

  /** Opening a notification marks it read and takes you to what it is about —
   * a notification you have to go and find the subject of has done half its
   * job. */
  async function open(n: AppNotification) {
    await run(async () => {
      if (!n.readAt) await markNotificationRead(n.id);
    });
    if (n.linkScreen === 'contracts') navigate('/contracts');
    // Warranties are managed from within the maintenance screen — there is no
    // standalone route, so send the manager where they can actually act.
    else if (n.linkScreen === 'warranties' || n.linkScreen === 'maintenance') navigate('/maintenance');
  }

  async function checkWarrantiesNow() {
    setRunResult(null);
    await run(async () => {
      const result = await runWarrantyCheck();
      if (result.raised === 0) {
        setRunResult(`لا جديد — لا ضمانات تنتهي خلال ${result.noticeDays} يوم لم يُنبَّه عنها.`);
      } else {
        setRunResult(`تنبيه بشأن ${result.raised} ضمان يقترب انتهاؤه.`);
      }
    });
  }

  async function checkNow() {
    setRunResult(null);
    await run(async () => {
      const result = await runEscalation();
      if (result.skipped === 'disabled') {
        setRunResult('التصعيد غير مُفعّل — حدّد عتبة التصعيد في شاشة تذكيرات التحصيل أولاً.');
      } else if (result.escalated === 0) {
        setRunResult('لا جديد — كل متأخر تجاوز العتبة سبق تصعيده.');
      } else {
        setRunResult(
          `صُعِّد ${result.escalated} متأخر` + (result.remaining && result.remaining > 0 ? ` — ما زال ${result.remaining} في الانتظار، سيصل تباعاً.` : '.'),
        );
      }
    });
  }

  if (loading || !data) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الإشعارات</div>
          <div className="page-sub">ما احتاج النظام أن يخبر به أحداً</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" disabled={busy} onClick={checkNow}>
            فحص التصعيد الآن
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={checkWarrantiesNow}>
            فحص الضمانات الآن
          </button>
          <button className="btn btn-ghost" disabled={busy || data.unread === 0} onClick={() => run(markAllNotificationsRead)}>
            تعليم الكل كمقروء
          </button>
        </div>
      </div>

      {/* The honest limit, stated where it matters: nothing leaves the platform. */}
      <p className="hint" style={{ marginBottom: 12 }}>
        ⚠️ الإشعارات داخل المنصة فقط — لا بريد ولا رسائل نصية. من لا يفتح التطبيق لا يصله شيء.
      </p>

      {error && <p className="error-text">{error}</p>}
      {runResult && <p className="hint">{runResult}</p>}

      <div className="chip-group" style={{ marginBottom: 10 }}>
        <button className={unreadOnly ? 'chip' : 'chip active'} onClick={() => setUnreadOnly(false)}>
          الكل
        </button>
        <button className={unreadOnly ? 'chip active' : 'chip'} onClick={() => setUnreadOnly(true)}>
          غير المقروء ({data.unread})
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {data.notifications.length === 0 && <div className="empty-state">{unreadOnly ? 'لا إشعارات غير مقروءة' : 'لا إشعارات'}</div>}

        {data.notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => open(n)}
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--line)',
              cursor: 'pointer',
              // Unread is carried by weight and a marker, not colour alone.
              background: n.readAt ? 'transparent' : '#faf9f5',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontWeight: n.readAt ? 400 : 600 }}>
                {!n.readAt && <span style={{ color: 'var(--danger, #b4413c)', marginLeft: 6 }}>●</span>}
                {n.title}
              </div>
              <div className="hint" style={{ whiteSpace: 'nowrap' }}>
                {dfmt(n.createdAt)}
              </div>
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
              {n.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
