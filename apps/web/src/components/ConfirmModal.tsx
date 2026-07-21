/** In-app confirm dialog — not window.confirm(): a native confirm() blocks
 * the whole tab/renderer on some setups (including this app's own browser
 * automation tests), and it can't be styled to match the rest of the app. */
export function ConfirmModal({
  title,
  body,
  confirmLabel = 'تأكيد',
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
