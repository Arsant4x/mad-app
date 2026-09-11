import { badgeAltOf } from '../../lib/statusBadge';
import { useEffect, useState } from 'react';
import {
  approveDeletionRequest,
  listDeletionRequests,
  rejectDeletionRequest,
  type AccountRequestOutcome,
  type AdminDeletionRequest,
  type DeletionRequestStatus,
} from '../../api/deletionRequests';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';

const STATUS_META: Record<DeletionRequestStatus, { label: string; badge: string }> = {
  PENDING: { label: 'قيد المراجعة', badge: 'due' },
  APPROVED: { label: 'مُوافَق', badge: 'overdue' },
  REJECTED: { label: 'مرفوض', badge: 'draft' },
  CANCELLED: { label: 'مسحوب', badge: 'draft' },
};

/** ما وقع فعلاً — لا «نُفِّذ» لكل موافقة (ق-٥٤٢). */
const OUTCOME_META: Record<AccountRequestOutcome, { label: string; badge: string }> = {
  DELETED: { label: 'حُذفت نهائياً', badge: 'overdue' },
  CLOSED: { label: 'أُغلقت — والبيانات باقية', badge: 'overdue' },
  REOPENED: { label: 'أُعيد فتحها', badge: 'paid' },
  ERASED: { label: 'مُحي غيرُ الملزِم — والملزِم باقٍ', badge: 'overdue' },
};

/** نوعُ الطلب كما يُقرأ في القائمة (ق-٥٥٩). */
const KIND_LABEL: Record<AdminDeletionRequest['kind'], string> = { DELETION: 'حذف', REOPENING: 'إعادة فتح', ERASURE: 'محو غير الملزِم' };

/** الوجهُ الذي يُقرأ: الموافقةُ تُعرَض بما وقع، والباقي بحالته. */
function statusOf(r: AdminDeletionRequest) {
  return r.status === 'APPROVED' && r.outcome ? badgeAltOf(OUTCOME_META, r.outcome) : badgeAltOf(STATUS_META, r.status);
}

/** نصُّ التأكيد يقول الحقيقة قبل الضغطة (ق-٥٤٦): أتُحذف أم تُغلَق، ولماذا. */
function confirmBody(r: AdminDeletionRequest): string {
  if (r.kind === 'REOPENING') return `سيُعاد فتح حساب "${r.companyName}" ويعود الدخول إليه. هل تريد التنفيذ؟`;
  if (r.kind === 'ERASURE') {
    return `ستُمحى الآن البيانات غير الملزِمة لمنشأة "${r.companyName}" (الهواتف وبيانات التواصل) ويبقى الملزِم إلى أجله — ولا إعادة فتح بعدها. هل تريد التنفيذ؟`;
  }
  if (r.preview?.outcome === 'CLOSE') {
    return `للمنشأة "${r.companyName}" حركة (${r.preview.movement.join(' · ')}) — فستُغلق ولا تُحذف: يُقطع الدخول وتبقى بياناتها محفوظة بمدد الحفظ النظامية. هل تريد التنفيذ؟`;
  }
  return `المنشأة "${r.companyName}" بلا حركة — سيُحذف حسابها وكل بياناتها نهائياً، لا رجعة بعدها. هل تريد التنفيذ؟`;
}

/**
 * قائمة عمل الدعم: طلبات حذف الحسابات وإعادة فتحها عبر كل المنشآت. الموافقة هنا
 * **تقيس ثم تنفّذ** (ق-٥٤٢): بلا حركةٍ حذفٌ، وبحركةٍ إغلاق — والتأكيدُ يسمّي المنشأة
 * ويقول ما سيقع قبل الضغطة. ولا زرَّ حذفٍ مباشراً في اللوحة (ق-٥٤٨): المسارُ الوحيد هنا.
 * onExecuted يُخطر اللوحة لتحدّث قائمة المنشآت (المحذوفة تختفي والمغلقة تُوسَم).
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
          طلبات حذف الحسابات وإعادة فتحها {pending.length > 0 && <span className="badge overdue">{pending.length} بانتظار المراجعة</span>}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {requests.length === 0 ? (
        <p className="hint">لا طلبات.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>المنشأة</th>
              <th>الطلب</th>
              <th>السبب</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.companyName || '—'}</td>
                <td>{KIND_LABEL[r.kind]}</td>
                <td>{r.reason ?? '—'}</td>
                <td className="num">{dfmt(r.createdAt)}</td>
                <td>
                  <span className={`badge ${statusOf(r).badge}`}>{statusOf(r).label}</span>
                  {r.status === 'PENDING' && r.preview && (
                    <div className="hint">
                      {r.preview.outcome === 'CLOSE' ? `لها حركة: ${r.preview.movement.join(' · ')} — ستُغلق` : 'بلا حركة — ستُحذف'}
                    </div>
                  )}
                  {r.outcome === 'CLOSED' && r.movement.length > 0 && <div className="hint">الحركة: {r.movement.join(' · ')}</div>}
                  {r.decidedNote && <div className="hint">{r.decidedNote}</div>}
                  {r.decidedByName && <div className="hint">بقرار: {r.decidedByName}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.status === 'PENDING' && (
                    <>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirming(r)}>
                        {r.kind === 'REOPENING' ? 'موافقة وإعادة فتح' : r.kind === 'ERASURE' ? 'موافقة ومحو' : 'موافقة وتنفيذ'}
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
          title={
            confirming.kind === 'REOPENING'
              ? 'إعادة فتح الحساب'
              : confirming.kind === 'ERASURE'
                ? 'محو البيانات غير الملزِمة'
                : confirming.preview?.outcome === 'CLOSE'
                  ? 'إغلاق الحساب'
                  : 'تنفيذ حذف الحساب'
          }
          body={confirmBody(confirming)}
          confirmLabel={confirming.kind === 'REOPENING' ? 'إعادة الفتح' : confirming.kind === 'ERASURE' ? 'محو' : confirming.preview?.outcome === 'CLOSE' ? 'إغلاق' : 'تنفيذ الحذف'}
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
