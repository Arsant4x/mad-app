import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { beginMfa, confirmMfa, disableMfa, getMfaStatus, type MfaStatus } from '../api/mfa';

/**
 * Two step sign in, on your own account.
 *
 * Protecting my account is my decision: no role grants or withholds it, and the identity comes from
 * the token. The secret and the recovery codes are shown once: no path returns them, and the screen
 * says so before the user closes it, so whoever closes it without copying starts again.
 *
 * Turning it on or off asks for the current password. After the change the server ends the access
 * token it was made with, and the API client renews the session on the next request. On the sign-in
 * screen `onEnrolled` takes the recovery codes instead, since that short session ends with the change.
 */
export function MfaCard({ onEnrolled }: { onEnrolled?: (recoveryCodes: string[]) => void } = {}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = code.trim().length >= 6 && password.length > 0;
  const passwordField = (
    <div className="field" style={{ maxWidth: 220 }}>
      <label htmlFor="mfa-current-password">{t('common.mfa.current_password')}</label>
      <input id="mfa-current-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
    </div>
  );

  async function reload() {
    setStatus(await getMfaStatus());
  }

  useEffect(() => {
    reload().catch(() => setStatus(null));
  }, []);

  function show(e: unknown) {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('common.mfa.request_failed')));
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
        {t('common.mfa.title')}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px' }}>
        {t('common.mfa.intro')}
        {status.required && t('common.mfa.required_suffix')}
      </p>

      {status.enrolled ? (
        <>
          <p style={{ fontSize: 12 }}>
            <span className="badge paid">{t('common.mfa.enabled')}</span>{t('common.mfa.recovery_left')}<span className="num">{status.recoveryCodesLeft}</span>
          </p>
          {status.recoveryCodesLeft <= 2 && <p className="error-text">{t('common.mfa.recovery_low')}</p>}
          <div className="field" style={{ maxWidth: 220 }}>
            <label>{t('common.mfa.code_to_disable')}</label>
            <input className="num" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {passwordField}
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy || !ready}
            onClick={() =>
              run(async () => {
                await disableMfa(code.trim(), password);
                setCode('');
                setPassword('');
                setCodes(null);
                setSecret(null);
                await reload();
              })
            }
          >
            {t('common.mfa.disable')}
          </button>
        </>
      ) : secret ? (
        <>
          <p style={{ fontSize: 12 }}>{t('common.mfa.add_key')}</p>
          <p className="num" style={{ fontSize: 14, letterSpacing: 1, wordBreak: 'break-all' }}>{secret}</p>
          {otpauth && <p style={{ fontSize: 10, color: 'var(--muted)', wordBreak: 'break-all' }}>{otpauth}</p>}
          <div className="field" style={{ maxWidth: 220 }}>
            <label>{t('common.mfa.code_from_app')}</label>
            <input className="num" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </div>
          {passwordField}
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !ready}
            onClick={() =>
              run(async () => {
                const done = await confirmMfa(code.trim(), password);
                setCode('');
                setPassword('');
                setSecret(null);
                if (onEnrolled) {
                  onEnrolled(done.recoveryCodes);
                  return;
                }
                setCodes(done.recoveryCodes);
                await reload();
              })
            }
          >
            {t('common.mfa.confirm')}
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
          {t('common.mfa.enable')}
        </button>
      )}

      {codes && (
        <div style={{ marginTop: 14 }}>
          <p className="error-text">{t('common.mfa.save_codes')}</p>
          <p className="num" style={{ fontSize: 13, lineHeight: 1.9 }}>{codes.join(' · ')}</p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
