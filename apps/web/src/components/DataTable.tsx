import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Page } from '../api/page';
import type { Resource } from '../hooks/useResource';
import { EmptyBlock, ErrorBlock, ForbiddenBlock, SkeletonRows } from './ResourceView';
import { WarningBar } from './WarningBar';
import { Pager } from './Pager';

/**
 * الجدولُ — النمط الأول (الجولة ٢ §٤) على القواعد الخمس.
 *
 * - يقبل **`Resource<Page<T>>`** ولا يقبل `rows: T[]` (④): مصفوفةٌ كاملة لا تدخل بخطأ نوع.
 * - لا `reduce` فيه (①) — مجموعُ الأعمدة مكوّنٌ آخر.
 * - الحالاتُ الستّ من `Resource` (②) — لا تُستنتج من `items.length`.
 * - **الأعمدةُ بالقياس لا بالتقدير**: يقرأ عرضَ حاويته ويجمع `minWidth` بترتيب الأولوية،
 *   ويعرض ما يدخل ويحيل الباقي إلى اللوحة — **ولا تمريرَ أفقيّاً في أيّ مقاس**.
 *   المقيس على العقود (الخطّ الفعليّ · 13.5px · حشوة 12): عشرةُ أعمدة = 1,154px؛
 *   القشرةُ تعطي 970/740/347 ⇒ 8/5/سطران (الجولة ٢ «لحكمك ٢»).
 * - دون `STACK_BELOW` يصير الصفُّ **مصفوفاً بسطرين** (قرار المالك: عند 375 لا تمرير) —
 *   وهذا ينسخ «يمرّر أفقياً» في المرجع القديم (`docs/ui/reference/six-patterns-spec.md` ك-٧).
 */
export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  kind?: 'text' | 'id' | 'date' | 'money' | 'qty' | 'status';
  /** مقيسٌ لا مقدَّر — أعرضُ محتوىً واقعيّ لهذا العمود بالخطّ الفعليّ. */
  minWidth: number;
  /** ١ يبقى في كل مقاس · ٢ يبقى حين يتّسع · ٣ آخرُ ما يدخل. */
  priority: 1 | 2 | 3;
  /** موضعُه في الصفّ المصفوف عند الضيق — وإلا فاللوحة. */
  stack?: 'line1' | 'line2';
}

export interface RowAction<T> {
  grant: `${string}:${string}`;
  label: string;
  onClick: (row: T) => void;
  tone?: 'default' | 'danger';
}

export interface DataTableProps<T> {
  r: Resource<Page<T>>;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** اسمُ ما في الجدول بصيغة الجمع — للرسائل: «تعذّر جلب العقود». */
  what: string;
  onRow?: (row: T) => void;
  onPage: (page: number) => void;
  actions?: RowAction<T>[];
  can: (screen: string, action: string) => boolean;
  empty: { headline: string; hint: string; action?: ReactNode; term: string; clear: () => void };
  /** ما يُكتب في الشريط حين تكون الحالة «ناقص جزئياً» — يسمّي ما نقص. */
  partialMessage?: (failedCount: number) => ReactNode;
  /** أدنى عرضٍ يبقى معه الجدولُ جدولاً — دونه يُصفَّف. */
  stackBelow?: number;
}

/** الحدُّ الذي يصير تحته الصفُّ مصفوفاً بسطرين. 375 ⇒ محتوى 347؛ 768 ⇒ 740 يبقى جدولاً. */
export const STACK_BELOW = 520;

/** يقسم الأعمدةَ إلى ظاهرةٍ ومُحالةٍ للوحة بحسب عرضٍ مقيس — دالّةٌ نقيّة تُختبر وحدها. */
export function fitColumns<T>(columns: Column<T>[], width: number): { visible: Column<T>[]; toPanel: Column<T>[] } {
  const ordered = [...columns].map((c, i) => ({ c, i })).sort((a, b) => a.c.priority - b.c.priority || a.i - b.i);
  const visibleKeys = new Set<string>();
  let used = 0;
  for (const { c } of ordered) {
    if (used + c.minWidth <= width) {
      visibleKeys.add(c.key);
      used += c.minWidth;
    }
  }
  return { visible: columns.filter((c) => visibleKeys.has(c.key)), toPanel: columns.filter((c) => !visibleKeys.has(c.key)) };
}

function useContainerWidth(): [RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function DataTable<T>({ r, columns, rowKey, what, onRow, onPage, actions = [], can, empty, partialMessage, stackBelow = STACK_BELOW }: DataTableProps<T>) {
  const [ref, width] = useContainerWidth();
  const layout = useMemo(() => {
    // بلا تخطيطٍ بعد (أو في jsdom حيث لا تخطيطَ أصلاً) لا حكمَ على العرض — جدولٌ كامل.
    if (width === null || width === 0) return { mode: 'table' as const, visible: columns, toPanel: [] as Column<T>[] };
    if (width < stackBelow) {
      const line1 = columns.filter((c) => c.stack === 'line1');
      const line2 = columns.filter((c) => c.stack === 'line2');
      return { mode: 'stack' as const, visible: [...line1, ...line2], toPanel: columns.filter((c) => !c.stack), line1, line2 };
    }
    const fit = fitColumns(columns, width);
    return { mode: 'table' as const, ...fit };
  }, [columns, width, stackBelow]);

  const allowedActions = actions.filter((a) => {
    const [screen, action] = a.grant.split(':');
    return can(screen, action);
  });

  const columnsNote =
    layout.toPanel.length > 0 ? (
      <div className="rz-table__note" data-hidden-columns={layout.toPanel.length}>
        <span className="num">{layout.visible.length}</span> من <span className="num">{columns.length}</span> عموداً · الباقي في التفاصيل
      </div>
    ) : null;

  const renderRows = (page: Page<T>) => {
    if (layout.mode === 'stack') {
      const { line1 = [], line2 = [] } = layout;
      return (
        <div className="rz-stack" data-mode="stack">
          {page.items.map((row) => (
            <div key={rowKey(row)} className="rz-stack__row" role={onRow ? 'button' : undefined} tabIndex={onRow ? 0 : undefined} onClick={onRow ? () => onRow(row) : undefined}>
              <div className="rz-stack__line">
                {line1.map((c) => (
                  <span key={c.key} className={`rz-stack__cell rz-stack__cell--${c.kind ?? 'text'}`}>
                    {c.cell(row)}
                  </span>
                ))}
              </div>
              <div className="rz-stack__line rz-stack__line--2">
                {line2.map((c) => (
                  <span key={c.key} className={`rz-stack__cell rz-stack__cell--${c.kind ?? 'text'}`}>
                    <span className="rz-stack__lbl">{c.header}</span> {c.cell(row)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <table className="rz-table" data-mode="table">
        <thead>
          <tr>
            {layout.visible.map((c) => (
              <th key={c.key} className={c.kind === 'money' || c.kind === 'qty' ? 'num' : undefined} style={{ minWidth: c.minWidth }}>
                {c.header}
              </th>
            ))}
            {allowedActions.length ? <th aria-label="أفعال" /> : null}
          </tr>
        </thead>
        <tbody>
          {page.items.map((row) => (
            <tr key={rowKey(row)} className={onRow ? 'rz-table__row--click' : undefined} onClick={onRow ? () => onRow(row) : undefined}>
              {layout.visible.map((c) => (
                <td key={c.key} className={c.kind === 'money' || c.kind === 'qty' ? 'num' : undefined}>
                  {c.cell(row)}
                </td>
              ))}
              {allowedActions.length ? (
                <td className="rz-table__actions" onClick={(e) => e.stopPropagation()}>
                  {allowedActions.map((a) => (
                    <button key={a.grant + a.label} type="button" className={`btn btn-sm ${a.tone === 'danger' ? 'btn-ghost' : ''}`} data-grant={a.grant} onClick={() => a.onClick(row)}>
                      {a.label}
                    </button>
                  ))}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const header = (
    <div className="rz-table__head" aria-hidden="true">
      {layout.mode === 'table'
        ? layout.visible.map((c) => (
            <span key={c.key} style={{ minWidth: c.minWidth }}>
              {c.header}
            </span>
          ))
        : null}
    </div>
  );

  let body: ReactNode;
  switch (r.status) {
    case 'loading':
      body = (
        <>
          {header}
          <SkeletonRows rows={25} height={32} />
        </>
      );
      break;
    case 'error':
      body = (
        <>
          {header}
          <ErrorBlock error={r.error} retry={r.retry} what={what} />
        </>
      );
      break;
    case 'forbidden':
      body = <ForbiddenBlock error={r.error} grantedBy={r.grantedBy} what={what} />;
      break;
    case 'empty':
      body = <EmptyBlock filtered={r.filtered} firstTime={{ headline: empty.headline, hint: empty.hint, action: empty.action }} afterSearch={{ term: empty.term, clear: empty.clear }} />;
      break;
    case 'partial':
      body = (
        <>
          <WarningBar tone="warn" action={<button type="button" className="btn btn-sm" onClick={r.retry}>أعد المحاولة</button>}>
            {partialMessage ? partialMessage(r.failed.length) : <>تعذّر جلب جزءٍ من {what} — المعروضُ صحيح وبعضُ الأعمدة ناقص (<span className="num">{r.failed.length}</span>)</>}
          </WarningBar>
          {columnsNote}
          {renderRows(r.data)}
          <Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={onPage} />
        </>
      );
      break;
    case 'ready':
      body = (
        <>
          {columnsNote}
          {renderRows(r.data)}
          <Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={onPage} />
        </>
      );
      break;
  }

  return (
    <div ref={ref} className="rz-table-wrap" data-status={r.status} data-layout={layout.mode}>
      {body}
    </div>
  );
}
