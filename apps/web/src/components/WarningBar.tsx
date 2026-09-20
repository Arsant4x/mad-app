import type { ReactNode } from 'react';

/**
 * شريطُ تحذيرٍ تحت رأس الصفحة — النمط الخامس (الجولة ٢ §٨).
 * نغمةٌ ونصٌّ وفعلٌ واحد؛ ارتفاعه 36px؛ ولا يُخفى ما نقص: **الناقصُ جزئياً يُسمّى بعدده**.
 */
export function WarningBar({ tone = 'warn', children, action }: { tone?: 'warn' | 'bad' | 'info'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`rz-warnbar rz-warnbar--${tone}`} role="status">
      <span className="rz-warnbar__text">{children}</span>
      {action ? <span className="rz-warnbar__action">{action}</span> : null}
    </div>
  );
}
