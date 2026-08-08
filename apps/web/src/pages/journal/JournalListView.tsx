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
  onDelete,
}: {
  entries: JournalEntry[];
  search: string;
  onSearch: (q: string) => void;
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
  onNew: () => void;
  onDelete: (entry: JournalEntry) => void;
}) {
  return (
    <div className="subview active">
      <div className="topbar">
        <div>
          <div className="page-title">القيود اليومية</div>
          <div className="page-sub">سجل كافة القيود المرحّلة إلى الأستاذ العام</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={onNew}>
            + قيد جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بالبيان أو رقم القيد..." value={search} onChange={(e) => onSearch(e.target.value)} />
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
              <th>رقم القيد</th>
              <th>التاريخ</th>
              <th>البيان</th>
              <th>المدين</th>
              <th>الدائن</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">لا توجد قيود مطابقة</div>
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
                      آلي
                    </span>
                  )}
                </td>
                <td className="num">{fmt(j.totalDebit)}</td>
                <td className="num">{fmt(j.totalCredit)}</td>
                <td>
                  <span className="badge paid">مرحّل</span>
                </td>
                <td>
                  <RowMenu actions={[{ label: '🗑 حذف', onClick: () => onDelete(j), danger: true }]} />
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
