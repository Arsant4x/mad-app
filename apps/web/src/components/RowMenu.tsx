import { useCallback, useEffect, useRef, useState } from 'react';

export interface RowMenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/**
 * سجلٌّ على مستوى الوحدة لقائمةٍ واحدة مفتوحة في الصفحة كلها.
 *
 * **لماذا لا يكفي مستمع `document`:** كل قائمة تحمل حالتها الخاصة، وكانت
 * تُغلق بمستمعٍ على `document`. لكن `toggle` يستدعي `stopPropagation()` —
 * وهو **لازم** لا زائد: React 19 يربط مستمعه بجذر التطبيق، والأحداث
 * المنفصلة (discrete) تُفرَّغ تزامنياً داخل الإرسال الأصلي نفسه، فيُضاف
 * مستمع `document` **قبل** أن يبلغه الحدثُ الفاتح فيغلق القائمة فور فتحها.
 *
 * والنتيجة أن الضغط على زرّ صفٍّ آخر كان يوقف الحدث عند الجذر، فلا يصل إلى
 * `document`، فلا تُغلق الأولى — **فتتراكب القائمتان بنفس z-index**. وهو
 * عطلٌ في مكوّنٍ تستعمله عشرون شاشة، فظهر «في كل الشاشات».
 *
 * فالإغلاق هنا **صريح**: من يفتح يُغلق سابقه بنفسه، بلا اعتمادٍ على انتشار
 * حدثٍ يوقفه سطرٌ آخر عمداً.
 */
let closeOpenMenu: (() => void) | null = null;

/** The "⋮" per-row action menu used across list screens, matching the
 * original mockup's rowMenuBtn()/openRowMenu() behavior. */
export function RowMenu({ actions }: { actions: (RowMenuAction | '-')[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const close = useCallback(() => {
    setOpen(false);
    if (closeOpenMenu === close) closeOpenMenu = null;
  }, []);

  /** يحسب موضع القائمة من الزر نفسه — تُستدعى عند الفتح **وعند كل تمرير**. */
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
     * القائمة `position:fixed` بإحداثيات كانت تُحسب **لحظة الفتح فقط** — فأي
     * تمرير يترك الصفَّ يتحرك والقائمةَ ثابتة، حتى تصير معلّقة فوق صفٍّ آخر
     * تماماً. تُعاد الآن الإحداثيات من الزر نفسه على كل تمرير، فتبقى ملتصقة
     * بصفّها.
     *
     * `capture: true` لازم: التمرير قد يقع داخل حاوية قابلة للتمرير لا على
     * النافذة، وحدث `scroll` **لا يصعد** — فبلا الالتقاط لا نسمع به.
     *
     * وإن خرج الزر من الشاشة تماماً تُغلق: قائمةٌ بلا صفٍّ مرئي تعليقٌ في
     * الفراغ، والإبقاء عليها أسوأ من إخفائها.
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

  /** لا تترك السجلّ يشير إلى قائمةٍ فُكّت من الشجرة (تنقّل أو إعادة رسم). */
  useEffect(() => () => {
    if (closeOpenMenu === close) closeOpenMenu = null;
  }, [close]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      close();
      return;
    }
    closeOpenMenu?.(); // ← تُغلق قائمة الصف الآخر قبل فتح هذه
    closeOpenMenu = close;
    place();
    setOpen(true);
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
