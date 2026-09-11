import { useEffect, useState } from 'react';
import {
  cancelDeletionRequest,
  getAccountClosureState,
  getClosureArchive,
  getMyDeletionRequest,
  requestErasure,
  requestReopening,
  type AccountClosureState,
  type ClosureArchive,
  type DeletionRequest,
} from '../../api/deletionRequests';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';

const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(bytes / 1024))} ك.ب`);

const KIND_LABEL: Record<DeletionRequest['kind'], string> = { DELETION: 'طلب الحذف', REOPENING: 'طلب إعادة الفتح', ERASURE: 'طلب محو البيانات غير الملزِمة' };

/**
 * ما يراه صاحبُ منشأةٍ مغلقة (ق-٥٤٧): لا شاشةَ سوى هذه — الرسالةُ تجيب «وأين بياناتي؟»
 * وبأجل، وزرّان: طلبُ إعادة الفتح (ق-٥٤٨) ما دامت نافذتُها مفتوحة، وطلبُ محو غير الملزِم الآن
 * (ق-٥٥٩ — م٤/٥) — وكلاهما يُراجعه الدعم ويقرّره باسمه. **وما يُمحى لا يعود**: فيُقال ذلك قبل الطلب.
 */
export function ClosedAccountView({ onLogout }: { onLogout: () => void }) {
  const [account, setAccount] = useState<AccountClosureState | null>(null);
  const [req, setReq] = useState<DeletionRequest | null>(null);
  const [archive, setArchive] = useState<ClosureArchive | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

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

  const pending = req?.status === 'PENDING' ? req : null;
  const retainUntil = account?.retainUntil ? account.retainUntil.slice(0, 10) : null;
  const reopenUntil = account?.reopenUntil ? account.reopenUntil.slice(0, 10) : null;
  const erased = !!account?.erasedAt;
  const windowOpen = !erased && !!account?.reopenUntil && new Date(account.reopenUntil) > new Date();

  return (
    <div className="card" style={{ maxWidth: 640, margin: '40px auto' }}>
      <div className="card-title" style={{ marginBottom: 10 }}>حسابُك مغلقٌ بطلبك</div>
      {account?.closedAt && <p className="hint">أُغلق في {dfmt(account.closedAt)}.</p>}
      <p style={{ marginTop: 8 }}>
        بياناتُك محفوظةٌ بمدد الحفظ النظامية{retainUntil ? ` حتى ${retainUntil} على الأقلّ` : ''} ثم تُمحى — ويكتمل الإتلافُ خلال أربعةَ عشرَ يوماً من دوران النسخ الاحتياطية. لا يمكن الدخول إليها أو تعديلها ما دام الحساب مغلقاً.
      </p>
      {erased ? (
        <p className="hint">مُحيت بياناتُك غيرُ الملزِمة (الهواتف وبيانات التواصل) في {dfmt(account!.erasedAt!)} — وبقي ما يلزم النظامُ حفظَه إلى أجله. ولا إعادةَ فتحٍ بعد المحو.</p>
      ) : (
        reopenUntil && (
          <p className="hint">
            يمكنك طلب إعادة الفتح حتى {reopenUntil}. بعده تُمحى بياناتُك غيرُ الملزِمة (الهواتف وبيانات التواصل) آلياً — ويبقى ما يلزم النظامُ حفظَه إلى أجله، ولا إعادةَ فتحٍ بعد ذلك.
          </p>
        )
      )}
      {req?.status !== 'PENDING' && req?.decidedNote && <p className="hint">ردّ الدعم: {req.decidedNote}</p>}

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
        {pending ? (
          <>
            <span className="badge due">
              {KIND_LABEL[pending.kind]} قيد المراجعة — قُدِّم في {dfmt(pending.createdAt)}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => cancelDeletionRequest(pending.id), 'تعذّر سحب الطلب')}>
              سحب الطلب
            </button>
          </>
        ) : (
          <>
            {windowOpen && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => requestReopening(), 'تعذّر تقديم الطلب')}>
                طلب إعادة فتح الحساب
              </button>
            )}
            {!erased && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmErase(true)}>
                طلب محو بياناتي غير الملزِمة الآن
              </button>
            )}
          </>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          تسجيل الخروج
        </button>
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

      {confirmErase && (
        <ConfirmModal
          title="طلب محو البيانات غير الملزِمة"
          body="سيُراجع دعم المنصة طلبك ثم يُمحى ما لا يلزم النظامُ حفظَه: هواتف العملاء والموردين والموظفين وأطراف العقود، وبيانات تواصل منشأتك. وتبقى الأسماء والعناوين والفواتير والقيود إلى أجل حفظها. ولا يمكن إعادة فتح الحساب بعد المحو. هل أنت متأكد؟"
          confirmLabel="نعم، قدِّم الطلب"
          onConfirm={() => {
            setConfirmErase(false);
            return run(() => requestErasure(), 'تعذّر تقديم الطلب');
          }}
          onCancel={() => setConfirmErase(false)}
        />
      )}
    </div>
  );
}
