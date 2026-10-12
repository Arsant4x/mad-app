import { useTranslation } from 'react-i18next';

/** In-app confirm dialog — not window.confirm(): a native confirm() blocks
 * the whole tab/renderer on some setups (including this app's own browser
 * automation tests), and it can't be styled to match the rest of the app. */
export function ConfirmModal({
  title,
  body,
  confirmLabel,
  hideCancel = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  /** For dialogs that only acknowledge something — offering "Cancel" beside
   * "OK" implies a choice that isn't there. */
  hideCancel?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--charcoal)' }}>{body}</p>
        <div className="modal-foot">
          {!hideCancel && (
            <button className="btn btn-ghost" onClick={onCancel}>
              {t('common.confirm.cancel')}
            </button>
          )}
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel ?? t('common.confirm.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
