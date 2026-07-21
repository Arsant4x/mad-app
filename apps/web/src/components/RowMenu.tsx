import { useEffect, useRef, useState } from 'react';

export interface RowMenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** The "⋮" per-row action menu used across list screens, matching the
 * original mockup's rowMenuBtn()/openRowMenu() behavior. */
export function RowMenu({ actions }: { actions: (RowMenuAction | '-')[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const mw = 170;
      let left = rect.right - mw;
      if (left < 8) left = 8;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
      setPos({ top: rect.bottom + 4, left });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button ref={btnRef} className="menu-btn" title="خيارات" onClick={toggle}>
        ⋮
      </button>
      {open && (
        <div ref={menuRef} className="action-menu" style={{ top: pos.top, left: pos.left }}>
          {actions.map((a, i) =>
            a === '-' ? (
              <hr key={i} />
            ) : (
              <button
                key={i}
                className={a.danger ? 'danger' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  a.onClick();
                }}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
