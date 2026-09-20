import { useEffect, type ReactNode } from 'react';

/**
 * اللوحةُ الجانبية — النمط السادس (الجولة ٢ §٩).
 *
 * تفتح على صفٍّ وتعرض ما لم يدخل الجدولَ من أعمدةٍ أولاً، ثم التبويبات.
 * الأرقام: 440px عند 1280 · تغطّي العرضَ عند 768 · ورقةٌ كاملة عند 375 (في `index.css`).
 * `Esc` يغلق إلا أثناء طلبٍ جارٍ (`busy`)، والتركيزُ يعود إلى ما فتحها بإغلاقها.
 */
export interface SidePanelProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  tabs?: { key: string; label: string }[];
  activeTab?: string;
  onTab?: (key: string) => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function SidePanel({ open, title, subtitle, onClose, busy = false, tabs, activeTab, onTab, footer, children }: SidePanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="rz-panel__backdrop" onClick={busy ? undefined : onClose} />
      <aside className="rz-panel" role="dialog" aria-modal="true" aria-busy={busy}>
        <div className="rz-panel__head">
          <div>
            <div className="rz-panel__title">{title}</div>
            {subtitle ? <div className="rz-panel__sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="modal-close" aria-label="إغلاق" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>
        {tabs && tabs.length ? (
          <div className="tabs rz-panel__tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={t.key === activeTab} className={`tab ${t.key === activeTab ? 'active' : ''}`} onClick={() => onTab?.(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="rz-panel__body">{children}</div>
        {footer ? <div className="rz-panel__foot">{footer}</div> : null}
      </aside>
    </>
  );
}
