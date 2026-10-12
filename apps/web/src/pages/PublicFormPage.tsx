import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import i18n from '../i18n';
import { apiErrorMessage } from '../lib/apiError';
import { dateTimeText } from './forms/formItems';
import { SIGNATURE_LEVEL, SIGNER_ROLE } from './forms/formStatus';

const NAFATH_POLL_MS = 3000;

type Stage = 'loading' | 'closed' | 'login' | 'view' | 'signed' | 'objected' | 'approved' | 'rejected';

/** An item's value as read: a number, yes/no, or text. */
function itemValue(i: FormPublicView['items'][number]): string {
  if (i.number !== null) return `${i.number}${i.unit ? ` ${i.unit}` : ''}`;
  if (i.bool !== null) return i.bool ? i18n.t('public_form.yes') : i18n.t('public_form.no');
  return i.text ?? '';
}

/**
 * The form page for the tenant: the end customer, with no account. Before signing in
 * nothing of the form shows (no name, amount or business), only the ways to sign in:
 * a six digit code to the registered mobile (five minutes, three attempts) or Nafath
 * when required. Then the tenant reviews and signs by drawing, or objects with a note
 * and a photo. The final copy is a link opened the same way, with the seal number,
 * its fingerprint and the verification result.
 */
export function PublicFormPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams<{ token: string }>();
  const [stage, setStage] = useState<Stage>('loading');
  const [link, setLink] = useState<FormLinkOpen | null>(null);
  const [otp, setOtp] = useState<FormOtpIssued | null>(null);
  const [code, setCode] = useState('');
  const [nafathCode, setNafathCode] = useState<string | null>(null);
  // A substitute on a Nafath form: the code session is kept here to go with Nafath; it does not open the form alone.
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

  const provider = link?.identityProvider ?? t('public_form.nafath');

  const sendCode = () => run(async () => setOtp(await requestFormOtp(token)), t('public_form.err_send_code'));
  const checkCode = () =>
    run(async () => {
      if (!otp) return;
      const s = await verifyFormOtp(token, otp.challengeId, code.trim());
      if (link?.nafathAfterOtp) {
        setOtpStep(s.session);
        return;
      }
      await enter(s.session);
    }, t('public_form.err_check_code'));

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
          setError(apiErrorMessage(e, t('public_form.err_nafath_incomplete')));
        }
      }, NAFATH_POLL_MS);
    }, t('public_form.err_nafath_start'));

  const sign = () =>
    run(async () => {
      if (!session || !drawing) return;
      const r = await signPublicForm(token, session, drawing);
      setFinalCopy(r.finalCopy);
      setStage('signed');
    }, t('public_form.err_sign'));

  const decide = (approve: boolean) =>
    run(async () => {
      if (!session) return;
      await decidePublicSubstitute(token, session, approve);
      setStage(approve ? 'approved' : 'rejected');
    }, t('public_form.err_decide'));

  const object = () =>
    run(async () => {
      if (!session) return;
      await objectPublicForm(token, session, note.trim(), photo);
      setStage('objected');
    }, t('public_form.err_object'));

  return (
    <div className="login-screen" style={{ alignItems: 'flex-start', overflowY: 'auto' }}>
      <div className="login-card" style={{ maxWidth: 720, width: '100%' }} data-testid="public-form-page">
        {stage === 'loading' && <p className="hint">{t('public_form.loading')}</p>}

        {stage === 'closed' && <p className="error-text">{t('public_form.closed')}</p>}

        {stage === 'login' && link && (
          <>
            <h2 style={{ marginTop: 0 }}>
              {link.purpose === 'FINAL_COPY'
                ? t('public_form.heading_final_copy')
                : link.purpose === 'SUBSTITUTE_CONSENT'
                  ? t('public_form.heading_substitute')
                  : t('public_form.heading_sign')}
            </h2>
            <p className="hint">{link.nafathAfterOtp ? t('public_form.enter_code_then_nafath') : t('public_form.enter_first')}</p>
            {link.nafathAfterOtp && otpStep && <p className="hint">{t('public_form.mobile_verified', { provider })}</p>}
            {link.methods.otp && !otpStep && (
              <div style={{ marginBottom: 12 }}>
                {!otp ? (
                  <button className="btn btn-primary" disabled={busy} onClick={sendCode}>
                    {t('public_form.send_code')}
                  </button>
                ) : (
                  <>
                    <p className="hint">
                      {t('public_form.code_sent_to')} <span className="num">{otp.mobileMasked}</span>
                      {t('public_form.code_valid')}
                    </p>
                    <div className="field">
                      <label>{t('public_form.code')}</label>
                      <input aria-label={t('public_form.code')} className="num" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={checkCode}>
                        {t('public_form.sign_in')}
                      </button>
                      <button className="btn btn-ghost" disabled={busy} onClick={sendCode}>
                        {t('public_form.new_code')}
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
                    {t('public_form.verify_via', { provider })}
                  </button>
                ) : (
                  <p className="hint">
                    {t('public_form.nafath_pick', { provider })} <strong className="num">{nafathCode}</strong>
                    {t('public_form.nafath_wait')}
                  </p>
                )}
              </div>
            )}
            {!link.methods.otp && !link.methods.nafath && <p className="error-text">{t('public_form.no_method')}</p>}
          </>
        )}

        {stage === 'view' && view && (
          <>
            <h2 style={{ marginTop: 0 }}>
              {view.templateName} <span className="hint">· {view.formTypeName}</span>
            </h2>
            <p className="hint">
              {t('public_form.form_date')} <span className="num">{view.formDate}</span>
              {view.revisionNo > 1 && (
                <>
                  {' '}
                  {t('public_form.revision', { n: view.revisionNo })}
                </>
              )}
              {view.signDeadline && view.purpose === 'SIGN' && (
                <>
                  {' '}
                  {t('public_form.sign_before')} <span className="num">{dateTimeText(view.signDeadline)}</span>
                </>
              )}
            </p>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('public_form.col_item')}</th>
                  <th>{t('public_form.col_value')}</th>
                  <th>{t('public_form.col_note')}</th>
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
                  {t('public_form.seal_no')} <span className="num">{view.seal.no}</span> · {t('public_form.seal_time')} <span className="num">{dateTimeText(view.seal.sealedAt)}</span>
                </p>
                <p style={{ fontSize: 12.5 }}>
                  {t('public_form.fingerprint')} <span className="num" style={{ wordBreak: 'break-all' }}>{view.seal.contentHash}</span>
                </p>
                <p className={view.seal.valid ? 'hint' : 'error-text'}>{view.seal.valid ? t('public_form.seal_valid') : t('public_form.seal_invalid')}</p>
                <button className="btn btn-ghost" onClick={() => window.print()}>
                  {t('public_form.print')}
                </button>
              </div>
            )}

            {view.purpose === 'SUBSTITUTE_CONSENT' && (
              <div className="card" style={{ marginTop: 12 }} data-testid="public-form-substitute">
                {view.substitute ? (
                  <>
                    <p>
                      {t('public_form.substitute_asked')} <strong>{view.substitute.name}</strong> (<span className="num">{view.substitute.mobileMasked}</span>) {t('public_form.substitute_on_behalf')}
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>
                        {t('public_form.approve')}
                      </button>
                      <button className="btn btn-ghost" disabled={busy} onClick={() => decide(false)}>
                        {t('public_form.reject')}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="hint">{t('public_form.no_request')}</p>
                )}
              </div>
            )}

            {view.purpose === 'SIGN' && !objecting && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {t('public_form.ack')}
                </label>
                <SignaturePad onChange={setDrawing} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-primary" disabled={busy || !ack || !drawing} onClick={sign}>
                    {t('public_form.sign')}
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setObjecting(true)}>
                    {t('public_form.have_objection')}
                  </button>
                </div>
              </div>
            )}
            {view.purpose === 'SIGN' && objecting && (
              <div style={{ marginTop: 12 }}>
                <div className="field">
                  <label>{t('public_form.objection')}</label>
                  <textarea aria-label={t('public_form.objection')} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className="field">
                  <label>{t('public_form.photo_optional')}</label>
                  <input aria-label={t('public_form.objection_photo')} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy || !note.trim()} onClick={object}>
                    {t('public_form.send_objection')}
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setObjecting(false)}>
                    {t('public_form.back')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {stage === 'signed' && (
          <p className="hint" data-testid="public-form-done">
            {t('public_form.signed')}{' '}
            {finalCopy === 'SENT'
              ? t('public_form.final_sent')
              : finalCopy === 'NONE'
                ? t('public_form.final_no_mobile')
                : t('public_form.final_failed')}
          </p>
        )}
        {stage === 'approved' && (
          <p className="hint" data-testid="public-form-done">
            {t('public_form.approved')}
          </p>
        )}
        {stage === 'rejected' && (
          <p className="hint" data-testid="public-form-done">
            {t('public_form.rejected')}
          </p>
        )}
        {stage === 'objected' && (
          <p className="hint" data-testid="public-form-done">
            {t('public_form.objected')}
          </p>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
