import { badgeAltOf } from '../../lib/statusBadge';
import { useEffect, useState } from 'react';
import {
  cancelDeletionRequest,
  getMyDeletionRequest,
  submitDeletionRequest,
  type AccountRequestOutcome,
  type DeletionRequest,
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

/** ما وقع فعلاً — «نُفِّذ» لمن حُذفت، و«أُغلق» لمن لها حركة (ق-٥٤٢). */
const OUTCOME_META: Record<AccountRequestOutcome, { label: string; badge: string }> = {
  DELETED: { label: 'نُفِّذ', badge: 'overdue' },
  CLOSED: { label: 'أُغلق', badge: 'overdue' },
  REOPENED: { label: 'أُعيد الفتح', badge: 'paid' },
};

/**
 * حذف الحساب، بصيغة SaaS: التاجر يقدّم طلباً والدعم هو من ينفّذه — لا زرّ
 * «امسح كل شيء». يعيش في صفحة الاشتراك لأن هذا هو المكان الذي يُدار منه
 * وجود الحساب نفسه.
 *
 * والحقيقةُ قبل الطلب (ق-٥٤٧): منشأةٌ لها حركة تُغلَق ولا تُحذف — فيُقال ذلك هنا،
 * لا بعد الموافقة.
 */
export function DeletionRequestCard() {
  const [req, setReq] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyDeletionRequest()
      .then(setReq)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function run(fn: () => Promise<DeletionRequest>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      setReq(await fn());
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? fallback);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  const open = req?.status === 'PENDING';
  const shown = req ? (req.status === 'APPROVED' && req.outcome ? badgeAltOf(OUTCOME_META, req.outcome) : badgeAltOf(STATUS_META, req.status)) : null;

  return (
    <div className="card" style={{ marginTop: 14, borderColor: 'rgba(180, 65, 60, 0.35)' }}>
      <div className="card-title" style={{ marginBottom: 10 }}>حذف الحساب</div>

      {req && shown && (
        <div style={{ marginBottom: 10 }}>
          <span className={`badge ${shown.badge}`}>{shown.label}</span>{' '}
          <span className="hint">
            {req.kind === 'REOPENING' ? 'طلب إعادة فتح' : 'طلب حذف'} — قُدِّم في {dfmt(req.createdAt)}
          </span>
          {req.decidedNote && <p className="hint" style={{ marginTop: 6 }}>ردّ الدعم: {req.decidedNote}</p>}
        </div>
      )}

      {open ? (
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => cancelDeletionRequest(req!.id), 'تعذّر سحب الطلب')}>
          سحب الطلب
        </button>
      ) : asking ? (
        <div>
          <div className="field">
            <label>سبب الحذف (اختياري — يساعد الدعم على خدمتك)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: إغلاق النشاط" />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConfirming(true)}>
            تقديم الطلب
          </button>{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>
            تراجع
          </button>
        </div>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 10 }}>
            حذف الحساب لا يتم مباشرةً: تقدّم طلباً يراجعه دعم المنصة ثم ينفّذه. منشأةٌ بلا حركة تُحذف بياناتها نهائياً؛ ومنشأةٌ لها حركة (فواتير · قيود · سندات · عقود · مهامّ…) تُغلق ولا تُحذف — يُقطع الدخول وتبقى بياناتها محفوظة بمدد الحفظ النظامية ثم تُمحى. ويمكنك طلب إعادة الفتح لاحقاً.
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => setAsking(true)}>
            طلب حذف الحساب
          </button>
        </>
      )}

      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

      {confirming && (
        <ConfirmModal
          title="تقديم طلب حذف الحساب"
          body="سيُراجع دعم المنصة طلبك. إن كانت منشأتك بلا حركة تُحذف كل بياناتها نهائياً ولا يمكن استرجاعها؛ وإن كانت لها حركة تُغلق ويُقطع الدخول وتبقى بياناتها محفوظة بمدد الحفظ النظامية. هل أنت متأكد؟"
          confirmLabel="نعم، قدِّم الطلب"
          onConfirm={() => {
            setConfirming(false);
            setAsking(false);
            return run(() => submitDeletionRequest(reason.trim() || undefined), 'تعذّر تقديم الطلب');
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
