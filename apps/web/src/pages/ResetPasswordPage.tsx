import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';

/** The server's minimum for a new password; its other rules come back as its message. */
const MIN_PASSWORD_LENGTH = 12;

/** Lands here from the emailed reset link (?token=…). One field, one job. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      const message = Array.isArray(data?.message) ? data.message.join(' — ') : data?.message;
      setError(message ?? t('reset_error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>{t('app_name')}</h1>
        <h2>{t('reset_title')}</h2>

        {done ? (
          <>
            <p className="hint" style={{ color: 'var(--emerald, #0a7d55)' }}>{t('reset_success')}</p>
            <Link to="/login" className="link-btn">
              {t('login_title')}
            </Link>
          </>
        ) : (
          <>
            <label>
              {t('reset_password_label')}
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={submitting || [...password].length < MIN_PASSWORD_LENGTH || !token}>
              {t('reset_submit')}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
