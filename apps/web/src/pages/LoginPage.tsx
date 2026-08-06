import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { setLanguage } from '../i18n';
import i18n from '../i18n';

export function LoginPage() {
  const { t } = useTranslation();
  const { user, bootLoading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!bootLoading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (e) {
      // Prefer the server's message — it's already localized to the language
      // this client asked for (see api/client.ts's Accept-Language header), and
      // it distinguishes a frozen/stopped account from bad credentials. The
      // generic string is only a fallback for a network-level failure that
      // never reached the server.
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      const message = Array.isArray(data?.message) ? data.message.join(' — ') : data?.message;
      setError(message ?? t('login_error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>{t('app_name')}</h1>
        <h2>{t('login_title')}</h2>
        <label>
          {t('login_username')}
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          {t('login_password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting}>
          {t('login_submit')}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
        >
          {t('language_toggle')}
        </button>
      </form>
    </div>
  );
}
