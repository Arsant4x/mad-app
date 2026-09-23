import { useEffect, useState } from 'react';
import {
  decidePlatformDecision,
  listPlatformDecisions,
  requestPlatformDecision,
  PLATFORM_DECISION_ACTIONS,
  type PlatformDecision,
  type PlatformDecisionAction,
} from '../../api/platformDecisions';
import { dfmt } from '../../lib/format';

/**
 * **الفعلُ الحرجُ بيدين — طلبٌ وإقرار** (`ق-١٣١٨` · ⑪A1 — باب `⑪ تشغيلُ المنصّة`).
 *
 * «**محوُ بيانات منشأةٍ أو تغييرُ اشتراكها بيدٍ واحدة يقع مرّةً ولا يُردّ**».
 *
 * ⚠️ **واللوحةُ لا تخفي زرَّ الإقرار عمّن طلب**: يُضغط فيُردّ بنصّه «بيدين لا بيد» —
 * **فالرفضُ يعلّم، والإخفاءُ يترك السائلَ يخمّن**. والحكمُ في الخادم والقاعدة معاً.
 */
const ACTION_LABEL: Record<PlatformDecisionAction, string> = {
  ACCOUNT_ERASURE: 'إغلاق حساب أو محو بياناته',
  SUBSCRIPTION_CHANGE: 'تعديل اشتراك',
  REFUND: 'ردّ مال',
};

const STATUS_LABEL: Record<PlatformDecision['status'], { label: string; badgeClass: string }> = {
  PENDING: { label: 'بانتظار إقرار', badgeClass: 'due' },
  APPROVED: { label: 'مُقرّ — لم يُنفَّذ بعد', badgeClass: 'paid' },
  REJECTED: { label: 'مرفوض', badgeClass: 'overdue' },
  EXECUTED: { label: 'نُفِّذ', badgeClass: 'draft' },
};

export function DecisionsPanel() {
  const [rows, setRows] = useState<PlatformDecision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [action, setAction] = useState<PlatformDecisionAction>('SUBSCRIPTION_CHANGE');
  const [targetId, setTargetId] = useState('');
  const [summary, setSummary] = useState('');

  async function reload() {
    setRows(await listPlatformDecisions());
  }

  useEffect(() => {
    reload().catch(() => setRows([]));
  }, []);

  function show(e: unknown) {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر تنفيذ الطلب'));
  }

  async function ask() {
    setError(null);
    setBusy('new');
    try {
      await requestPlatformDecision({ action, targetId: targetId.trim(), summary: summary.trim() });
      setTargetId('');
      setSummary('');
      await reload();
    } catch (e) {
      show(e);
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: string, approve: boolean) {
    setError(null);
    setBusy(id);
    try {
      await decidePlatformDecision(id, approve);
      await reload();
    } catch (e) {
      show(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>
        القرارات الحرجة — بيدين لا بيد
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px' }}>
        إغلاق حساب أو محو بياناته وتعديل الاشتراك: يطلبها مدير ويقرّها مدير آخر. ومن طلب القرار لا يقرّه.
      </p>

      <div className="two-col" style={{ marginBottom: 8 }}>
        <div className="field">
          <label>الفعل</label>
          <select value={action} onChange={(e) => setAction(e.target.value as PlatformDecisionAction)}>
            {PLATFORM_DECISION_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>معرّف الهدف (منشأة أو طلب)</label>
          <input className="num" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>ملخّص الأثر — يقرأه من يقرّ</label>
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="ما الذي سيقع بالضبط، وعلى مَن" />
      </div>
      <button className="btn btn-sm btn-primary" onClick={ask} disabled={busy === 'new' || !targetId.trim() || summary.trim().length < 10}>
        طلب قرار
      </button>
      {error && <p className="error-text">{error}</p>}

      <table style={{ marginTop: 14 }}>
        <thead>
          <tr>
            <th>الفعل</th>
            <th>الملخّص</th>
            <th>الطالب</th>
            <th>الحالة</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">لا قرارات بعد</div>
              </td>
            </tr>
          )}
          {rows.map((d) => (
            <tr key={d.id}>
              <td>{ACTION_LABEL[d.action]}</td>
              <td>{d.summary}</td>
              <td>
                {d.requestedBy.displayName}
                <span style={{ fontSize: 11, color: 'var(--muted)' }}> — {dfmt(d.requestedAt)}</span>
              </td>
              <td>
                <span className={`badge ${STATUS_LABEL[d.status].badgeClass}`}>{STATUS_LABEL[d.status].label}</span>
                {d.decidedBy && <span style={{ fontSize: 11, color: 'var(--muted)' }}> — {d.decidedBy.displayName}</span>}
              </td>
              <td>
                {d.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" disabled={busy === d.id} onClick={() => decide(d.id, true)}>
                      إقرار
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={busy === d.id} onClick={() => decide(d.id, false)}>
                      رفض
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
