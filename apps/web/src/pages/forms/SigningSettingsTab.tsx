import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFormSigningSettings, updateFormSigningSettings, type FormSigningSettings } from '../../api/forms';
import { useAuth } from '../../auth/AuthContext';
import { apiErrorMessage } from '../../lib/apiError';
import { CurrencyMark } from '../../components/currency/Money';

/**
 * Signing settings.
 *
 * The actor is the company owner; others see but do not edit, and the server
 * rejects their writes (403). A signing period per company template type
 * (default seven days), with reminders at its midpoint and one day before it ends.
 * The Nafath threshold applies to the whole contract value in the company
 * currency: above it the tenant signs only through Nafath, below it Nafath is
 * optional, and empty requires nothing.
 */
export function SigningSettingsTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwner = user?.actorType === 'COMPANY';
  const [settings, setSettings] = useState<FormSigningSettings | null>(null);
  const [threshold, setThreshold] = useState('');
  const [periods, setPeriods] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function adopt(s: FormSigningSettings) {
    setSettings(s);
    setThreshold(s.nafathThreshold === null ? '' : String(Number(s.nafathThreshold)));
    setPeriods(Object.fromEntries(s.types.map((x) => [x.formTypeId, String(x.signPeriodDays)])));
  }

  useEffect(() => {
    getFormSigningSettings()
      .then(adopt)
      .catch((e) => setError(apiErrorMessage(e, t('forms.signing_settings.load_failed'))));
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const value = threshold.trim();
      const changed = settings.types.filter((x) => periods[x.formTypeId] !== String(x.signPeriodDays));
      adopt(
        await updateFormSigningSettings({
          nafathThreshold: value === '' ? null : Number(value),
          periods: changed.map((x) => ({ formTypeId: x.formTypeId, signPeriodDays: Number(periods[x.formTypeId]) })),
        }),
      );
      setSaved(true);
    } catch (e) {
      setError(apiErrorMessage(e, t('forms.signing_settings.save_failed')));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return error ? <p className="error-text">{error}</p> : null;

  return (
    <div className="card" data-testid="signing-settings">
      <div className="card-title">{t('forms.signing_settings.title')}</div>
      <p className="hint">{t('forms.signing_settings.intro')}</p>

      {error && <p className="error-text">{error}</p>}
      {saved && <p className="hint">{t('forms.signing_settings.saved')}</p>}

      <table>
        <thead>
          <tr>
            <th>{t('forms.signing_settings.col_type')}</th>
            <th>{t('forms.signing_settings.col_period')}</th>
          </tr>
        </thead>
        <tbody>
          {settings.types.length === 0 && (
            <tr>
              <td colSpan={2}>
                <div className="empty-state">{t('forms.signing_settings.empty')}</div>
              </td>
            </tr>
          )}
          {settings.types.map((x) => (
            <tr key={x.formTypeId}>
              <td>
                {x.name}
                {x.isDefault && <div className="hint">{t('forms.signing_settings.default')}</div>}
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="num"
                  aria-label={t('forms.signing_settings.period_aria', { name: x.name })}
                  value={periods[x.formTypeId] ?? ''}
                  disabled={!isOwner || busy}
                  onChange={(e) => setPeriods((p) => ({ ...p, [x.formTypeId]: e.target.value }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="nafath-threshold">
          {t('forms.signing_settings.threshold_label')} (<CurrencyMark code={settings.currency} />)
        </label>
        <input
          id="nafath-threshold"
          type="number"
          min={0}
          step="0.01"
          className="num"
          aria-label={t('forms.signing_settings.threshold_aria')}
          placeholder={t('forms.signing_settings.threshold_placeholder')}
          value={threshold}
          disabled={!isOwner || busy}
          onChange={(e) => setThreshold(e.target.value)}
        />
        <div className="hint">{t('forms.signing_settings.threshold_hint')}</div>
      </div>

      {isOwner ? (
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {t('forms.signing_settings.save')}
        </button>
      ) : (
        <p className="hint">{t('forms.signing_settings.owner_only')}</p>
      )}
    </div>
  );
}
