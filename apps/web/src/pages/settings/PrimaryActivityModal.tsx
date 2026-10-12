import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { previewPrimaryActivity, setPrimaryActivity, type Activity, type ScreenChangePreview } from '../../api/activities';
import { usePermissions } from '../../auth/PermissionsContext';
import { apiErrorMessage } from '../../lib/apiError';

/**
 * Confirms a change of the primary activity, naming what will disappear before it happens.
 *
 * Why a dialog and not a button: the primary activity changes what every employee
 * sees. One click that hides four screens without showing which ones lets the
 * owner discover the effect from an employee's complaint, not from their own decision.
 *
 * The server enforces it: `PATCH /activities/primary` refuses without `confirmed`,
 * so the interface has to show the preview.
 *
 * The list comes from the server, not from here: deriving it in the interface
 * would be a second copy of the map that drifts at the first change, and the
 * owner would see an effect other than the real one.
 */
export function PrimaryActivityModal({
  activity,
  onDone,
  onCancel,
}: {
  /** `null` means undo: turn filtering off and bring every screen back. */
  activity: Activity | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { refresh } = usePermissions();
  const [preview, setPreview] = useState<ScreenChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    previewPrimaryActivity(activity?.id ?? null)
      .then(setPreview)
      .catch((e) => setError(apiErrorMessage(e, t('settings.primary_activity.err_preview'))));
  }, [activity]);

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      await setPrimaryActivity(activity?.id ?? null);
      // Permissions are read live, so the screens change at once without signing in again.
      refresh();
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, t('settings.primary_activity.err_apply')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('settings.primary_activity.aria_label')}>
        <div className="modal-head">
          <div className="modal-title">
            {activity ? t('settings.primary_activity.title_make', { name: activity.name }) : t('settings.primary_activity.title_clear')}
          </div>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {!preview && !error && <p>{t('settings.primary_activity.computing')}</p>}

        {preview && (
          <>
            {preview.willHide.length === 0 && preview.willShow.length === 0 && (
              <p className="muted" data-testid="primary-no-change">{t('settings.primary_activity.no_change')}</p>
            )}

            {preview.willHide.length > 0 && (
              <div className="field">
                {/* By name, not by count: "4 screens will be hidden" does not let the owner
                  * judge; one of them may be where half the staff work. */}
                <label className="error" data-testid="will-hide-count">
                  {t('settings.primary_activity.will_hide', { n: preview.willHide.length })}
                </label>
                <ul data-testid="will-hide">
                  {preview.willHide.map((s) => (
                    <li key={s.screen} data-testid={`hide-${s.screen}`}>{s.label}</li>
                  ))}
                </ul>
                <p className="hint">
                  {t('settings.primary_activity.data_note_before')}
                  <strong>{t('settings.primary_activity.data_note_strong')}</strong>
                  {t('settings.primary_activity.data_note_after')}
                </p>
              </div>
            )}

            {preview.willShow.length > 0 && (
              <div className="field">
                <label data-testid="will-show-count">{t('settings.primary_activity.will_show', { n: preview.willShow.length })}</label>
                <ul data-testid="will-show">
                  {preview.willShow.map((s) => (
                    <li key={s.screen} data-testid={`show-${s.screen}`}>{s.label}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="muted">
              {t('settings.primary_activity.screens_available', { from: preview.currentCount, to: preview.nextCount })}
            </p>

            <div className="modal-actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={apply} data-testid="primary-confirm">
                {t('settings.primary_activity.confirm')}
              </button>
              <button type="button" onClick={onCancel} disabled={saving}>{t('settings.primary_activity.cancel')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
