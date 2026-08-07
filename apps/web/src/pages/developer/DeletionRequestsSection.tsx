import { useEffect, useState } from 'react';
import {
  approveDeletionRequest,
  listDeletionRequests,
  rejectDeletionRequest,
  type AdminDeletionRequest,
  type DeletionRequestStatus,
} from '../../api/deletionRequests';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';

const STATUS_META: Record<DeletionRequestStatus, { label: string; badge: string }> = {
  PENDING: { label: 'قيد المراجعة', badge: 'due' },
  APPROVED: { label: 'نُفِّذ', badge: 'overdue' },
  REJECTED: { label: 'مرفوض', badge: 'draft' },
  CANCELLED: { label: 'مسحوب', badge: 'draft' },
};

/**
 * قائمة عمل الدعم: طلبات حذف الحسابات عبر كل المنشآت. الموافقة هنا **تنفّذ**
 * الحذف فعلاً — لذلك خلف تأكيد يسمّي المنشأة باسمها، ويطلب سبباً يُعاد للتاجر
 * عند الرفض. onExecuted يُخطر اللوحة لتحدّث قائمة المنشآت (المحذوفة تختفي).
 */
export function DeletionRequestsSection({ onExecuted }: { onExecuted: () => void }) {
  const [requests, setRequests] = useState<AdminDeletionRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<AdminDeletionRequest | null>(null);

  async function reload() {
    setRequests(await listDeletionRequests());
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  async function run(fn: () => Promise<unknown>, fallback: string, executed = false) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
      if (executed) onExecuted();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? fallback);
    } finally {
      setBusy(false);
    }
  }

  const pending = requests.filter((r) => r.status === 'PENDING');

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div className="card-title">
          طلبات حذف الحسابات {pending.length > 0 && <span className="badge overdue">{pending.length} بانتظار المراجعة</span>}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {requests.length === 0 ? (
        <p className="hint">لا طلبات حذف.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>المنشأة</th>
              <th>السبب</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.company?.orgName ?? '—'}</td>
                <td>{r.reason ?? '—'}</td>
                <td className="num">{dfmt(r.createdAt)}</td>
                <td>
                  <span className={`badge ${STATUS_META[r.status].badge}`}>{STATUS_META[r.status].label}</span>
                  {r.decidedNote && <div className="hint">{r.decidedNote}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.status === 'PENDING' && (
                    <>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirming(r)}>
                        موافقة وتنفيذ
                      </button>{' '}
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => run(() => rejectDeletionRequest(r.id, note.trim() || undefined), 'تعذّر الرفض')}
                      >
                        رفض
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pending.length > 0 && (
        <div className="field" style={{ marginTop: 10, maxWidth: 420 }}>
          <label>ملاحظة القرار (تُعاد للتاجر)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: تواصلنا معك هاتفياً للتأكيد" />
        </div>
      )}

      {confirming && (
        <ConfirmModal
          title="تنفيذ حذف الحساب"
          body={`سيُحذف حساب "${confirming.company?.orgName}" وكل بياناته نهائياً — لا رجعة بعدها. هل تريد التنفيذ؟`}
          confirmLabel="تنفيذ الحذف"
          onConfirm={() => {
            const target = confirming;
            setConfirming(null);
            return run(() => approveDeletionRequest(target.id, note.trim() || undefined), 'تعذّر التنفيذ', true);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
