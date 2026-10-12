import { useTranslation } from 'react-i18next';

/**
 * Shared pager for server-paginated lists. Rendered only when there is more
 * than one page — a list that fits on one page shouldn't grow chrome.
 * The arrows are part of each language's text, so they point along the reading direction.
 */
export function Pager({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (page: number) => void }) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;
  return (
    <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 10 }}>
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('common.pager.previous')}
      </button>
      <span style={{ alignSelf: 'center' }}>
        {t('common.pager.summary', { page, pages: pageCount, total })}
      </span>
      <button className="btn btn-ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        {t('common.pager.next')}
      </button>
    </div>
  );
}
