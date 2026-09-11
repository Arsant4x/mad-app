import { useEffect, useState } from 'react';
import {
  cancelDeletionRequest,
  getAccountClosureState,
  getClosureArchive,
  getMyDeletionRequest,
  requestReopening,
  type AccountClosureState,
  type ClosureArchive,
  type DeletionRequest,
} from '../../api/deletionRequests';
import { dfmt } from '../../lib/format';

const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(bytes / 1024))} ك.ب`);

/**
 * ما يراه صاحبُ منشأةٍ مغلقة (ق-٥٤٧): لا شاشةَ سوى هذه — الرسالةُ تجيب «وأين بياناتي؟»
 * وبأجل، وزرٌّ واحد: طلبُ إعادة الفتح (ق-٥٤٨) — يُراجعه الدعم ويقرّره باسمه.
 */
export function ClosedAccountView({ onLogout }: { onLogout: () => void }) {
  const [account, setAccount] = useState<AccountClosureState | null>(null);
  const [req, setReq] = useState<DeletionRequest | null>(null);
  const [archive, setArchive] = useState<ClosureArchive | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccountClosureState().then(setAccount).catch(() => undefined);
    getMyDeletionRequest().then(setReq).catch(() => undefined);
    // الروابطُ قصيرةُ العمر — تُطلب عند فتح الشاشة، وتُعاد بإعادة فتحها.
    getClosureArchive().then(setArchive).catch(() => undefined);
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

  const reopenPending = req?.kind === 'REOPENING' && req.status === 'PENDING';
  const retainUntil = account?.retainUntil ? account.retainUntil.slice(0, 10) : null;

  return (
    <div className="card" style={{ maxWidth: 640, margin: '40px auto' }}>
      <div className="card-title" style={{ marginBottom: 10 }}>حسابُك مغلقٌ بطلبك</div>
      {account?.closedAt && <p className="hint">أُغلق في {dfmt(account.closedAt)}.</p>}
      <p style={{ marginTop: 8 }}>
        بياناتُك محفوظةٌ بمدد الحفظ النظامية{retainUntil ? ` حتى ${retainUntil} على الأقلّ` : ''} ثم تُمحى. لا يمكن الدخول إليها أو تعديلها ما دام الحساب مغلقاً.
      </p>
      {req?.kind === 'REOPENING' && req.decidedNote && <p className="hint">ردّ الدعم: {req.decidedNote}</p>}

      {archive && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title" style={{ marginBottom: 6 }}>نسختُك الكاملة — جاهزةٌ للتنزيل حتى {archive.expiresAt.slice(0, 10)}</div>
          <p className="hint">
            ملفّاتٌ سنوية ({archive.years.join(' · ') || '—'}) وملفٌّ أساسيّ، و{archive.stampedInvoices} فاتورةً مختومةً كما هي، و{archive.totalRows} صفّاً — مع `README` يشرح المحتوى و`manifest` ببصمة كلِّ ملفّ.
          </p>
          <ul style={{ paddingInlineStart: 18 }}>
            {archive.files.map((f) => (
              <li key={f.name}>
                <a href={f.url} target="_blank" rel="noreferrer">
                  {f.name}
                </a>{' '}
                <span className="hint">({kb(f.bytes)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {reopenPending ? (
          <>
            <span className="badge due">طلب إعادة الفتح قيد المراجعة — قُدِّم في {dfmt(req!.createdAt)}</span>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => cancelDeletionRequest(req!.id), 'تعذّر سحب الطلب')}>
              سحب الطلب
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => requestReopening(), 'تعذّر تقديم الطلب')}>
            طلب إعادة فتح الحساب
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          تسجيل الخروج
        </button>
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
