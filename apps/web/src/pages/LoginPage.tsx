import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { apiClient, setAccessToken } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { MfaCard } from '../components/MfaCard';
import { setLanguage } from '../i18n';
import i18n from '../i18n';

type Mode = 'login' | 'register' | 'forgot';

/**
 * The SaaS front door: sign in, self-register with a trial, or start a
 * password reset — one card, three modes, so the visitor never leaves the
 * page to change their mind.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { user, bootLoading, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** العاملُ الثاني (`ق-١٣١٨` · ⑨A1) — لا يظهر حتى يطلبه الخادم. */
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  // A platform account that must turn the second factor on first gets a short enrolment-only session.
  const [enrolling, setEnrolling] = useState(false);
  const [enrolledCodes, setEnrolledCodes] = useState<string[] | null>(null);

  if (!bootLoading && user) return <Navigate to="/" replace />;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  function leaveEnrolment(enrolled: boolean) {
    setAccessToken(null);
    setEnrolling(false);
    setEnrolledCodes(null);
    setInfo(null);
    setMfaCode('');
    if (enrolled) setMfaNeeded(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username, password, mfaCode);
      } else if (mode === 'register') {
        await register(orgName, username, password, email);
      } else {
        // Deliberately fire-and-forget: the server answers the same whether
        // the account exists or not, and so does this message.
        await apiClient.post('/auth/forgot-password', { username });
        setInfo(t('forgot_sent'));
      }
    } catch (e) {
      // Prefer the server's message — it's already localized to the language
      // this client asked for (see api/client.ts's Accept-Language header).
      const data = (e as { response?: { data?: { message?: string | string[]; mfaRequired?: boolean; mfaEnrolmentRequired?: boolean; enrolmentToken?: string } } })?.response?.data;
      const message = Array.isArray(data?.message) ? data.message.join(' — ') : data?.message;
      // ⑨A1 (`ق-١٣١٨`): الخادمُ يقول «يلزم رمز» — **فيُعرض الحقلُ ولا يُخمّن المستخدم**.
      if (data?.mfaRequired) setMfaNeeded(true);
      if (data?.mfaEnrolmentRequired && data.enrolmentToken) {
        setAccessToken(data.enrolmentToken);
        setEnrolling(true);
        setInfo(message ?? null);
        return;
      }
      setError(message ?? t('login_error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  if (enrolling) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>{t('app_name')}</h1>
          {enrolledCodes ? (
            <>
              <p className="error-text">{t('common.mfa.save_codes')}</p>
              <p className="num" style={{ fontSize: 13, lineHeight: 1.9 }}>{enrolledCodes.join(' · ')}</p>
              <button type="button" onClick={() => leaveEnrolment(true)}>
                {t('common.mfa.continue_to_sign_in')}
              </button>
            </>
          ) : (
            <>
              {info && <p className="hint">{info}</p>}
              <MfaCard
                onEnrolled={(codes) => {
                  // The enrolment session ends with the change; signing in with a code comes next.
                  setAccessToken(null);
                  setEnrolledCodes(codes);
                }}
              />
              <button type="button" className="link-btn" onClick={() => leaveEnrolment(false)}>
                {t('common.mfa.cancel_enrolment')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>{t('app_name')}</h1>
        <h2>{mode === 'login' ? t('login_title') : mode === 'register' ? t('register_title') : t('forgot_title')}</h2>

        {mode === 'register' && (
          <label>
            {t('register_org')}
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} autoFocus />
          </label>
        )}

        <label>
          {t('login_username')}
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={mode !== 'register'} />
        </label>

        {mode !== 'forgot' && (
          <label>
            {t('login_password')}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}

        {mode === 'login' && mfaNeeded && (
          <label>
            {t('login_mfa_code')}
            {/* `inputMode` رقميّ: يُفتح لوحُ الأرقام على الجوال — والرمزُ يُنسخ من التطبيق. */}
            <input inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} autoFocus />
            <span className="hint">{t('login_mfa_hint')}</span>
          </label>
        )}

        {mode === 'register' && (
          <label>
            {t('register_email')}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}

        {mode === 'register' && <p className="hint">{t('register_trial_hint')}</p>}
        {mode === 'forgot' && <p className="hint">{t('forgot_hint')}</p>}

        {error && <p className="error-text">{error}</p>}
        {info && <p className="hint" style={{ color: 'var(--emerald, #0a7d55)' }}>{info}</p>}

        <button type="submit" disabled={submitting}>
          {mode === 'login' ? t('login_submit') : mode === 'register' ? t('register_submit') : t('forgot_submit')}
        </button>

        {mode === 'login' ? (
          <>
            <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
              {t('login_forgot_link')}
            </button>
            <button type="button" className="link-btn" onClick={() => switchMode('register')}>
              {t('login_register_link')}
            </button>
          </>
        ) : (
          <button type="button" className="link-btn" onClick={() => switchMode('login')}>
            {t('register_back')}
          </button>
        )}

        <button type="button" className="link-btn" onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}>
          {t('language_toggle')}
        </button>
      </form>
    </div>
  );
}
