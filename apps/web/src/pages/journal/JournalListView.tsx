import { useTranslation } from 'react-i18next';
import type { JournalEntry } from '../../api/journal';
import { Pager } from '../../components/Pager';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';

export function JournalListView({
  entries,
  search,
  onSearch,
  page,
  pageCount,
  total,
  onPage,
  onNew,
  onReverse,
}: {
  entries: JournalEntry[];
  search: string;
  onSearch: (q: string) => void;
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
  onNew: () => void;
  /** A posted entry is reversed, never deleted. */
  onReverse: (entry: JournalEntry) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="subview active">
      <div className="topbar">
        <div>
          <div className="page-title">{t('journal.list.title')}</div>
          <div className="page-sub">{t('journal.list.sub')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={onNew}>
            {t('journal.list.new')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('journal.list.search')} value={search} onChange={(e) => onSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('journal.list.col_number')}</th>
              <th>{t('journal.list.col_date')}</th>
              <th>{t('journal.list.col_memo')}</th>
              <th>{t('journal.list.col_debit')}</th>
              <th>{t('journal.list.col_credit')}</th>
              <th>{t('journal.list.col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('journal.list.empty')}</div>
                </td>
              </tr>
            )}
            {entries.map((j) => (
              <tr key={j.id}>
                <td className="num">{j.no}</td>
                <td className="num">{dfmt(j.date)}</td>
                <td>
                  {j.memo}
                  {j.auto && (
                    <span className="type-tag type-eq" style={{ marginInlineStart: 8 }}>
                      {t('journal.list.auto')}
                    </span>
                  )}
                </td>
                <td className="num">{fmt(j.totalDebit)}</td>
                <td className="num">{fmt(j.totalCredit)}</td>
                <td>
                  {/* Status comes from the reversal links: reversed (and by which entry), a reversal (and of which), or posted. */}
                  {j.reversedBy ? (
                    <span className="badge overdue" title={t('journal.list.reversed_title', { no: j.reversedBy.no })}>
                      {t('journal.list.reversed', { no: j.reversedBy.no })}
                    </span>
                  ) : j.reversalOf ? (
                    <span className="badge" title={t('journal.list.reversal_title', { no: j.reversalOf.no })}>
                      {t('journal.list.reversal', { no: j.reversalOf.no })}
                    </span>
                  ) : (
                    <span className="badge paid">{t('journal.list.posted')}</span>
                  )}
                </td>
                <td>
                  {/* A posted entry is never deleted; an automatic one follows its document, and reversed or reversing entries are not reversed again. */}
                  {!j.auto && !j.reversedBy && !j.reversalOf && (
                    <RowMenu actions={[{ label: t('journal.list.reverse_action'), onClick: () => onReverse(j), danger: true }]} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageCount={pageCount} total={total} onPage={onPage} />
    </div>
  );
}
