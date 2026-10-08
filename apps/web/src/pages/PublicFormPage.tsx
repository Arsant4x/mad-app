import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  decidePublicSubstitute,
  objectPublicForm,
  openFormLink,
  pollFormNafath,
  requestFormOtp,
  signPublicForm,
  startFormNafath,
  verifyFormOtp,
  viewPublicForm,
  type FormLinkOpen,
  type FormOtpIssued,
  type FormPublicView,
} from '../api/forms';
import { SignaturePad } from '../components/SignaturePad';
import { apiErrorMessage } from '../lib/apiError';
import { dateTimeText } from './forms/formItems';
import { SIGNATURE_LEVEL, SIGNER_ROLE } from './forms/formStatus';

const NAFATH_POLL_MS = 3000;

type Stage = 'loading' | 'closed' | 'login' | 'view' | 'signed' | 'objected' | 'approved' | 'rejected';

/** قيمةُ البند كما تُقرأ: رقمٌ أو نعم/لا أو نصّ. */
function itemValue(i: FormPublicView['items'][number]): string {
  if (i.number !== null) return `${i.number}${i.unit ? ` ${i.unit}` : ''}`;
  if (i.bool !== null) return i.bool ? 'نعم' : 'لا';
  return i.text ?? '';
}

/**
 * ⚖️ **صفحةُ النموذج للمستأجر** (توجيه ٢٨٧ ① إلى ③ و⑨ · `ق-١٦٢٠`): الفاعلُ العميلُ النهائيّ بلا حساب (`§3.5`). **قبل الدخول لا يظهر من
 * النموذج شيء**: لا اسمَ ولا مبلغ ولا منشأة، بل طرقُ الدخول وحدَها. **والدخولُ** برمزٍ من ستّة أرقامٍ إلى جواله المسجَّل (خمسُ دقائق وثلاثُ
 * محاولات) أو عبر نفاذ حين يُشترط. **ثم يراجع** فيقرّ ويوقّع برسمه، **أو يعترض** بملاحظةٍ وصورة. **والنسخةُ النهائية** رابطٌ يُفتح بالرمز
 * نفسِه وفيه رقمُ الختم وبصمتُه وحكمُ التحقّق.
 */
export function PublicFormPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [stage, setStage] = useState<Stage>('loading');
  const [link, setLink] = useState<FormLinkOpen | null>(null);
  const [otp, setOtp] = useState<FormOtpIssued | null>(null);
  const [code, setCode] = useState('');
  const [nafathCode, setNafathCode] = useState<string | null>(null);
  // ⚖️ البديلُ في نموذج نفاذ (`ق-١٦٧٧`): جلسةُ رمزه تُحفظ هنا لتصحب نفاذ، ولا يُرى النموذجُ بها وحدَها.
  const [otpStep, setOtpStep] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [view, setView] = useState<FormPublicView | null>(null);
  const [ack, setAck] = useState(false);
  const [drawing, setDrawing] = useState<Blob | null>(null);
  const [objecting, setObjecting] = useState(false);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [finalCopy, setFinalCopy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const poller = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    openFormLink(token)
      .then((l) => {
        if (!alive) return;
        setLink(l);
        setStage(l.state === 'ACTIVE' ? 'login' : 'closed');
      })
      .catch(() => alive && setStage('closed'));
    return () => {
      alive = false;
      if (poller.current) window.clearInterval(poller.current);
    };
  }, [token]);

  async function run(fn: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(apiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function enter(s: string) {
    setSession(s);
    setView(await viewPublicForm(token, s));
    setStage('view');
  }

  const sendCode = () => run(async () => setOtp(await requestFormOtp(token)), 'تعذّر إرسالُ الرمز');
  const checkCode = () =>
    run(async () => {
      if (!otp) return;
      const s = await verifyFormOtp(token, otp.challengeId, code.trim());
      if (link?.nafathAfterOtp) {
        setOtpStep(s.session);
        return;
      }
      await enter(s.session);
    }, 'تعذّر التحقّق من الرمز');

  const startNafath = () =>
    run(async () => {
      const started = otpStep ? await startFormNafath(token, otpStep) : await startFormNafath(token);
      setNafathCode(started.displayCode);
      if (poller.current) window.clearInterval(poller.current);
      poller.current = window.setInterval(async () => {
        try {
          const r = otpStep ? await pollFormNafath(token, otpStep) : await pollFormNafath(token);
          if (r.state === 'APPROVED' && r.session) {
            if (poller.current) window.clearInterval(poller.current);
            await enter(r.session.session);
          }
        } catch (e) {
          if (poller.current) window.clearInterval(poller.current);
          setNafathCode(null);
          setError(apiErrorMessage(e, 'لم يكتمل التحقّق عبر نفاذ'));
        }
      }, NAFATH_POLL_MS);
    }, 'تعذّر بدءُ التحقّق عبر نفاذ');

  const sign = () =>
    run(async () => {
      if (!session || !drawing) return;
      const r = await signPublicForm(token, session, drawing);
      setFinalCopy(r.finalCopy);
      setStage('signed');
    }, 'تعذّر التوقيع');

  const decide = (approve: boolean) =>
    run(async () => {
      if (!session) return;
      await decidePublicSubstitute(token, session, approve);
      setStage(approve ? 'approved' : 'rejected');
    }, 'تعذّر تسجيلُ قرارك');

  const object = () =>
    run(async () => {
      if (!session) return;
      await objectPublicForm(token, session, note.trim(), photo);
      setStage('objected');
    }, 'تعذّر تسجيلُ الاعتراض');

  return (
    <div className="login-screen" style={{ alignItems: 'flex-start', overflowY: 'auto' }}>
      <div className="login-card" style={{ maxWidth: 720, width: '100%' }} data-testid="public-form-page">
        {stage === 'loading' && <p className="hint">جارٍ فتحُ الرابط…</p>}

        {stage === 'closed' && <p className="error-text">انتهى هذا الرابط أو أُقفل. إن كان لديك نموذجٌ ينتظر توقيعك فاطلب رابطاً جديداً ممّن أرسله.</p>}

        {stage === 'login' && link && (
          <>
            <h2 style={{ marginTop: 0 }}>
              {link.purpose === 'FINAL_COPY' ? 'نسختُك النهائية من النموذج' : link.purpose === 'SUBSTITUTE_CONSENT' ? 'طلبُ مستلمٍ بديلٍ عنك' : 'نموذجٌ ينتظر توقيعك'}
            </h2>
            <p className="hint">
              {link.nafathAfterOtp ? 'ادخل بالرمز الذي يصل جوالك أوّلاً، ثم بنفاذ، لترى النموذج.' : 'ادخل أوّلاً لترى النموذج.'}
            </p>
            {link.nafathAfterOtp && otpStep && <p className="hint">تحقّقنا من جوالك؛ بقي التحقّقُ عبر {link.identityProvider ?? 'نفاذ'}.</p>}
            {link.methods.otp && !otpStep && (
              <div style={{ marginBottom: 12 }}>
                {!otp ? (
                  <button className="btn btn-primary" disabled={busy} onClick={sendCode}>
                    أرسل رمزاً إلى جوالي
                  </button>
                ) : (
                  <>
                    <p className="hint">
                      أُرسل رمزٌ من ستّة أرقام إلى <span className="num">{otp.mobileMasked}</span>، صالحٌ خمس دقائق.
                    </p>
                    <div className="field">
                      <label>الرمز</label>
                      <input aria-label="الرمز" className="num" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={checkCode}>
                        دخول
                      </button>
                      <button className="btn btn-ghost" disabled={busy} onClick={sendCode}>
                        رمزٌ جديد
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {link.methods.nafath && (!link.nafathAfterOtp || otpStep) && (
              <div>
                {!nafathCode ? (
                  <button className={link.methods.otp && !otpStep ? 'btn btn-ghost' : 'btn btn-primary'} disabled={busy} onClick={startNafath}>
                    التحقّق عبر {link.identityProvider ?? 'نفاذ'}
                  </button>
                ) : (
                  <p className="hint">
                    افتح تطبيق {link.identityProvider ?? 'نفاذ'} واختر الرقم <strong className="num">{nafathCode}</strong>، وتنتقل الصفحةُ حين يكتمل التحقّق.
                  </p>
                )}
              </div>
            )}
            {!link.methods.otp && !link.methods.nafath && <p className="error-text">لا طريقةَ دخولٍ متاحة لهذا الرابط؛ راجِع من أرسله.</p>}
          </>
        )}

        {stage === 'view' && view && (
          <>
            <h2 style={{ marginTop: 0 }}>
              {view.templateName} <span className="hint">· {view.formTypeName}</span>
            </h2>
            <p className="hint">
              تاريخُ النموذج <span className="num">{view.formDate}</span>
              {view.revisionNo > 1 && <> · النسخة {view.revisionNo}</>}
              {view.signDeadline && view.purpose === 'SIGN' && (
                <>
                  {' '}
                  · يُوقَّع قبل <span className="num">{dateTimeText(view.signDeadline)}</span>
                </>
              )}
            </p>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>البند</th>
                  <th>القيمة</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {view.items.map((i) => (
                  <tr key={i.lineNo} data-testid="public-form-item">
                    <td className="num">{i.lineNo}</td>
                    <td>{i.label}</td>
                    <td>{itemValue(i)}</td>
                    <td>{i.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {view.signatures.length > 0 && (
              <ul style={{ fontSize: 12.5 }}>
                {view.signatures.map((s) => (
                  <li key={`${s.role}-${s.signedAt}`}>
                    {SIGNER_ROLE[s.role] ?? s.role}: {s.signerName} · {SIGNATURE_LEVEL[s.level] ?? s.level} · <span className="num">{dateTimeText(s.signedAt)}</span>
                  </li>
                ))}
              </ul>
            )}

            {view.purpose === 'FINAL_COPY' && view.seal && (
              <div className="card" data-testid="public-form-seal">
                <p style={{ fontSize: 12.5 }}>
                  رقمُ الختم <span className="num">{view.seal.no}</span> · وقتُ الختم <span className="num">{dateTimeText(view.seal.sealedAt)}</span>
                </p>
                <p style={{ fontSize: 12.5 }}>
                  البصمة <span className="num" style={{ wordBreak: 'break-all' }}>{view.seal.contentHash}</span>
                </p>
                <p className={view.seal.valid ? 'hint' : 'error-text'}>{view.seal.valid ? 'التحقّق: النسخةُ مطابقةٌ لما خُتم.' : 'التحقّق: النسخةُ لا تطابق ما خُتم.'}</p>
                <button className="btn btn-ghost" onClick={() => window.print()}>
                  طباعة
                </button>
              </div>
            )}

            {view.purpose === 'SUBSTITUTE_CONSENT' && (
              <div className="card" style={{ marginTop: 12 }} data-testid="public-form-substitute">
                {view.substitute ? (
                  <>
                    <p>
                      طُلب أن يستلم <strong>{view.substitute.name}</strong> (<span className="num">{view.substitute.mobileMasked}</span>) هذا النموذجَ نيابةً عنك ويوقّعه.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>
                        أوافق
                      </button>
                      <button className="btn btn-ghost" disabled={busy} onClick={() => decide(false)}>
                        أرفض
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="hint">لا طلبَ ينتظر موافقتك الآن.</p>
                )}
              </div>
            )}

            {view.purpose === 'SIGN' && !objecting && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> اطّلعتُ على النموذج وأقرّ بما فيه
                </label>
                <SignaturePad onChange={setDrawing} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-primary" disabled={busy || !ack || !drawing} onClick={sign}>
                    أقرّ وأوقّع
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setObjecting(true)}>
                    لديّ اعتراض
                  </button>
                </div>
              </div>
            )}
            {view.purpose === 'SIGN' && objecting && (
              <div style={{ marginTop: 12 }}>
                <div className="field">
                  <label>ما اعتراضُك؟</label>
                  <textarea aria-label="ما اعتراضُك؟" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className="field">
                  <label>صورة (اختيارية)</label>
                  <input aria-label="صورةُ الاعتراض" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy || !note.trim()} onClick={object}>
                    إرسالُ الاعتراض
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setObjecting(false)}>
                    رجوع
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {stage === 'signed' && (
          <p className="hint" data-testid="public-form-done">
            وُقّع النموذج وخُتم.{' '}
            {finalCopy === 'SENT'
              ? 'وأُرسل رابطُ النسخة النهائية إلى جوال المستأجر المسجَّل.'
              : finalCopy === 'NONE'
                ? 'ولا جوالَ صالحاً في بطاقة المستأجر لرابط النسخة النهائية؛ اطلبه ممّن أرسل النموذج.'
                : 'وتعذّر إرسالُ رابط النسخة النهائية؛ اطلبه ممّن أرسل النموذج.'}
          </p>
        )}
        {stage === 'approved' && (
          <p className="hint" data-testid="public-form-done">
            سُجّلت موافقتُك، ويصل البديلَ رابطُ التوقيع على جواله، وتصلك النسخةُ النهائية حين يوقّع.
          </p>
        )}
        {stage === 'rejected' && (
          <p className="hint" data-testid="public-form-done">
            سُجّل رفضُك، ويبقى التوقيعُ لك برابطك.
          </p>
        )}
        {stage === 'objected' && (
          <p className="hint" data-testid="public-form-done">
            سُجّل اعتراضُك، ويصلك ردٌّ بنسخةٍ معدّلة قبل انقضاء المدّة.
          </p>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
