import { useEffect, useState } from 'react';
import { beginMfa, confirmMfa, disableMfa, getMfaStatus, type MfaStatus } from '../api/mfa';

/**
 * **المصادقةُ المتعدّدة — على حسابك أنت** (`ق-١٣١٨` · ⑨A1).
 *
 * **قاعدةُ الفاعل** (`§3.5`): حمايةُ حسابي قراري — فلا دورَ يمنحها ولا يمنعها، والهويّةُ
 * من الرمز.
 *
 * ⚠️ **والسرُّ ورموزُ الاسترداد تُعرض مرّةً واحدة**: لا مسارَ يُعيدها، **والشاشةُ تقول ذلك
 * قبل أن يُغلقها المستخدم** — فمن أغلقها بلا نسخٍ يبدأ من جديد.
 */
export function MfaCard() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setStatus(await getMfaStatus());
  }

  useEffect(() => {
    reload().catch(() => setStatus(null));
  }, []);

  function show(e: unknown) {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر تنفيذ الطلب'));
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      show(e);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>
        المصادقة بخطوتين
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px' }}>
        رمز من تطبيق مصادقة على هاتفك يُطلب مع كلمة المرور. كلمة مرور وحدها تكفي من سرقها للدخول.
        {status.required && ' وهي إلزامية على حسابات المنصّة.'}
      </p>

      {status.enrolled ? (
        <>
          <p style={{ fontSize: 12 }}>
            <span className="badge paid">مفعّلة</span> — رموز استرداد متبقية: <span className="num">{status.recoveryCodesLeft}</span>
          </p>
          {status.recoveryCodesLeft <= 2 && <p className="error-text">تبقّى القليل من رموز الاسترداد — ألغِ التفعيل وأعِده للحصول على رموز جديدة.</p>}
          <div className="field" style={{ maxWidth: 220 }}>
            <label>رمز من التطبيق (لإلغاء التفعيل)</label>
            <input className="num" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy || code.trim().length < 6}
            onClick={() =>
              run(async () => {
                await disableMfa(code.trim());
                setCode('');
                setCodes(null);
                setSecret(null);
                await reload();
              })
            }
          >
            إلغاء التفعيل
          </button>
        </>
      ) : secret ? (
        <>
          <p style={{ fontSize: 12 }}>أضف هذا المفتاح في تطبيق المصادقة، ثم أدخل الرمز الذي يعرضه:</p>
          <p className="num" style={{ fontSize: 14, letterSpacing: 1, wordBreak: 'break-all' }}>{secret}</p>
          {otpauth && <p style={{ fontSize: 10, color: 'var(--muted)', wordBreak: 'break-all' }}>{otpauth}</p>}
          <div className="field" style={{ maxWidth: 220 }}>
            <label>الرمز من التطبيق</label>
            <input className="num" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || code.trim().length < 6}
            onClick={() =>
              run(async () => {
                const done = await confirmMfa(code.trim());
                setCodes(done.recoveryCodes);
                setCode('');
                setSecret(null);
                await reload();
              })
            }
          >
            تأكيد التفعيل
          </button>
        </>
      ) : (
        <button
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const begun = await beginMfa();
              setSecret(begun.secret);
              setOtpauth(begun.otpauth);
            })
          }
        >
          تفعيل المصادقة بخطوتين
        </button>
      )}

      {codes && (
        <div style={{ marginTop: 14 }}>
          <p className="error-text">احفظ رموز الاسترداد الآن — لن تُعرض مرة أخرى. كل رمز يعمل مرة واحدة.</p>
          <p className="num" style={{ fontSize: 13, lineHeight: 1.9 }}>{codes.join(' · ')}</p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
