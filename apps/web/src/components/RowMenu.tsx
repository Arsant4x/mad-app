import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface RowMenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/**
 * A module level record of the one open menu on the whole page.
 *
 * A `document` listener is not enough: `toggle` calls `stopPropagation()`, which is required because
 * React 19 attaches its listener at the app root and flushes discrete events synchronously inside the
 * original dispatch, so a `document` listener added on open would see the opening click and close the
 * menu at once. That same stop meant a click on another row's button never reached `document`, the
 * first menu stayed open and two menus overlapped at the same z-index, on every list screen.
 *
 * So closing is explicit: whoever opens closes the previous one, without relying on event propagation
 * that another line stops on purpose.
 */
let closeOpenMenu: (() => void) | null = null;

/** The "⋮" per-row action menu used across list screens, matching the
 * original mockup's rowMenuBtn()/openRowMenu() behavior. */
export function RowMenu({ actions }: { actions: (RowMenuAction | '-')[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const close = useCallback(() => {
    setOpen(false);
    if (closeOpenMenu === close) closeOpenMenu = null;
  }, []);

  /** Places the menu from the button itself; called on open and on every scroll. */
  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const mw = 170;
    let left = rect.right - mw;
    if (left < 8) left = 8;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
    setPos({ top: rect.bottom + 4, left });
  }, []);

  useEffect(() => {
    if (!open) return;

    function onDocClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      close();
    }

    /**
     * The menu is `position:fixed` with coordinates once taken only on open, so scrolling moved the row
     * and left the menu hanging over another row. The coordinates are now taken from the button on every
     * scroll, so the menu stays on its row.
     *
     * `capture: true` is required: scrolling may happen inside a scrollable container rather than the
     * window, and `scroll` does not bubble, so without capture it is never heard.
     *
     * When the button leaves the screen entirely the menu closes: a menu with no visible row is worse
     * than none.
     */
    let frame = 0;
    function reposition() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = btnRef.current?.getBoundingClientRect();
        if (!rect) return;
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          close();
          return;
        }
        place();
      });
    }

    document.addEventListener('click', onDocClick);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [open, close, place]);

  /** Do not leave the record pointing at a menu that was unmounted (navigation or rerender). */
  useEffect(() => () => {
    if (closeOpenMenu === close) closeOpenMenu = null;
  }, [close]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      close();
      return;
    }
    closeOpenMenu?.(); // close the other row's menu before opening this one
    closeOpenMenu = close;
    place();
    setOpen(true);
  }

  return (
    <>
      <button ref={btnRef} className="menu-btn" title={t('common.row_menu.options')} onClick={toggle}>
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
                  close();
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
