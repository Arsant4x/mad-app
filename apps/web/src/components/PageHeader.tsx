import type { ReactNode } from 'react';
import type { Count } from '../api/wire';

/**
 * رأسُ الصفحة — النمط الخامس (الجولة ٢ §٨).
 *
 * - **فعلٌ أساسيّ واحد** يحمل `grant` ولا يُرسم بلا `can(screen, action)` (القاعدة ⑤):
 *   إخفاءُ الزرّ عرضٌ لا منع — الخادمُ هو المانع، والزرُّ يُقرأ من منحةٍ أرسلها.
 * - **الحبرُ** (`btn-issue`) لما في `ISSUE_ACTIONS` وحده (و-٤) — لا يُشتقّ من نصّ الزرّ.
 * - **سطرُ العدّ** «N من M» يقرأ `total` من الخادم لا `items.length`.
 */
export const ISSUE_ACTIONS: readonly string[] = ['invoices:issue'];

export interface HeaderAction {
  /** `شاشة:فعل` كما يرسلها الخادم في `/me/permissions`. */
  grant: `${string}:${string}`;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function actionClass(grant: string): string {
  return ISSUE_ACTIONS.includes(grant) ? 'btn btn-issue' : 'btn btn-primary';
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** عددُ المعروض وعددُ الكلّ — من الخادم. `undefined` أثناء التحميل فيُرسم هيكل. */
  count?: { shown: Count; total: Count };
  primary?: HeaderAction;
  secondary?: HeaderAction[];
  /** دالّةُ الصلاحيات من `usePermissions()` — تُمرَّر لا تُستدعى هنا، ليبقى المكوّن بلا سياق. */
  can: (screen: string, action: string) => boolean;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, count, primary, secondary = [], can, children }: PageHeaderProps) {
  const allowed = (a: HeaderAction) => {
    const [screen, action] = a.grant.split(':');
    return can(screen, action);
  };
  return (
    <header className="rz-pagehead">
      <div className="rz-pagehead__titles">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <div className="page-sub">{subtitle}</div> : null}
        <div className="rz-pagehead__count" data-count={count ? 'ready' : 'loading'}>
          {count ? (
            <>
              <span className="num">{count.shown}</span> من <span className="num">{count.total}</span>
            </>
          ) : (
            <span className="rz-skeleton__inline" aria-busy="true" />
          )}
        </div>
      </div>
      <div className="rz-pagehead__actions">
        {secondary.filter(allowed).map((a) => (
          <button key={a.grant + a.label} type="button" className="btn btn-ghost" disabled={a.disabled} onClick={a.onClick} data-grant={a.grant}>
            {a.label}
          </button>
        ))}
        {primary && allowed(primary) ? (
          <button type="button" className={actionClass(primary.grant)} disabled={primary.disabled} onClick={primary.onClick} data-grant={primary.grant}>
            {primary.label}
          </button>
        ) : null}
      </div>
      {children}
    </header>
  );
}
