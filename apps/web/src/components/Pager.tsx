/**
 * Shared pager for server-paginated lists. Rendered only when there is more
 * than one page — a list that fits on one page shouldn't grow chrome.
 * RTL note: «السابق» points right (→) and «التالي» points left (←), matching
 * the reading direction the rest of the UI already follows.
 */
export function Pager({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 10 }}>
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        → السابق
      </button>
      <span style={{ alignSelf: 'center' }}>
        صفحة {page} من {pageCount} — الإجمالي: {total}
      </span>
      <button className="btn btn-ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        التالي ←
      </button>
    </div>
  );
}
