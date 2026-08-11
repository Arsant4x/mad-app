import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { convertQuote, deleteQuote, listQuotes, type DerivedQuoteStatus, type Quote } from '../../api/quotes';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { QuoteModal } from './QuoteModal';

const STATUS_META: Record<DerivedQuoteStatus, { label: string; badgeClass: string }> = {
  DRAFT: { label: 'مسودة', badgeClass: 'draft' },
  SENT: { label: 'مرسَل', badgeClass: 'due' },
  CONVERTED: { label: 'محوَّل', badgeClass: 'paid' },
  EXPIRED: { label: 'منتهٍ', badgeClass: 'overdue' },
};

/**
 * عروض الأسعار (4.9): وثيقة تفاوض تتحوّل فاتورةً بنقرة — بلا إعادة إدخال.
 * زر التحويل يعطَّل بسببٍ ظاهر للمنتهي والمحوَّل، ورسائل الخادم تُعرض نصاً.
 */
export function QuotesPage() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; quote: Quote } | null>(null);
  const [converting, setConverting] = useState<Quote | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setQuotes(await listQuotes());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((x) => x.no.toLowerCase().includes(q) || x.customer.name.toLowerCase().includes(q));
  }, [quotes, search]);

  /** لماذا لا يُحوَّل هذا العرض الآن؟ null = قابل للتحويل. */
  function convertBlockReason(q: Quote): string | null {
    if (q.derivedStatus === 'CONVERTED') return `حُوِّل إلى ${q.convertedInvoice?.no ?? 'فاتورة'}`;
    if (q.derivedStatus === 'EXPIRED') return `انتهى بتاريخ ${q.validUntil.slice(0, 10)}`;
    return null;
  }

  async function confirmConvert() {
    if (!converting) return;
    setBusy(true);
    setError(null);
    try {
      const { invoice } = await convertQuote(converting.id);
      setConverting(null);
      // عند النجاح: مباشرةً إلى شاشة الفواتير على الفاتورة المُنشأة.
      navigate(`/invoices?highlight=${invoice.id}`);
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر التحويل');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setError(null);
    try {
      await deleteQuote(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر حذف العرض');
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">عروض الأسعار</div>
          <div className="page-sub">عرضٌ يوافق عليه العميل يصير فاتورةً بنقرة — بأسعاره المتفق عليها</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + عرض سعر جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بالرقم أو اسم العميل..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>الرقم</th>
              <th>العميل</th>
              <th>الإصدار</th>
              <th>الصلاحية حتى</th>
              <th>الإجمالي</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">لا عروض أسعار مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((q) => {
              const meta = badgeOf(STATUS_META, q.derivedStatus);
              const blockReason = convertBlockReason(q);
              return (
                <tr key={q.id}>
                  <td className="num">{q.no}</td>
                  <td>{q.customer.name}</td>
                  <td className="num">{dfmt(q.issueDate)}</td>
                  <td className="num">{dfmt(q.validUntil)}</td>
                  <td className="num">{fmt(Number(q.total))}</td>
                  <td>
                    <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                    {q.derivedStatus === 'CONVERTED' && q.convertedInvoice && <div className="hint num">{q.convertedInvoice.no}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {blockReason ? (
                      <button className="btn btn-ghost btn-sm" disabled title={blockReason}>
                        {blockReason}
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConverting(q)}>
                        ⇐ تحويل إلى فاتورة
                      </button>
                    )}
                    <RowMenu
                      actions={[
                        ...(q.derivedStatus === 'DRAFT' || q.derivedStatus === 'SENT'
                          ? [{ label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', quote: q }) }]
                          : []),
                        { label: '🗑 حذف', onClick: () => setPendingDelete(q), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <QuoteModal
          editing={modal.mode === 'edit' ? modal.quote : null}
          onCancel={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await reload();
          }}
        />
      )}

      {converting && (
        <ConfirmModal
          title="تحويل العرض إلى فاتورة"
          body={`إصدار فاتورة للعميل «${converting.customer.name}» بإجمالي ${fmt(Number(converting.total))} بأسعار العرض المتفق عليها؟ ستُرحَّل الفاتورة محاسبياً فور الإنشاء.`}
          confirmLabel="تحويل"
          onCancel={() => setConverting(null)}
          onConfirm={confirmConvert}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="حذف عرض السعر"
          body={error ?? `حذف العرض ${pendingDelete.no}؟`}
          confirmLabel="حذف"
          onCancel={() => {
            setPendingDelete(null);
            setError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
