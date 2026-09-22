import { useEffect, useMemo, useState } from 'react';
import { listPayments, reversePayment, type Payment } from '../../api/payments';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt, fmt } from '../../lib/format';
import { num0 } from '../../lib/money';
import { PaymentModal } from './PaymentModal';

/**
 * سندات القبض (4.5).
 *
 * لا تعديل ولا حذف في هذه الشاشة عمداً — سندٌ مرحَّل يُصحَّح بسند عكسي وحده،
 * بنفس منطق حراسة القيود والفواتير.
 */
export function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setPayments(await listPayments());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => p.no.toLowerCase().includes(q) || p.customer.name.toLowerCase().includes(q) || (p.reference ?? '').toLowerCase().includes(q));
  }, [payments, search]);


  async function confirmReverse() {
    if (!reversing) return;
    setError(null);
    try {
      await reversePayment(reversing.id, `عكس السند ${reversing.no}`);
      setReversing(null);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر عكس السند');
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">سندات القبض</div>
          <div className="page-sub">تحصيلٌ يُوزَّع على الفواتير — والمتبقي يُحسب من التوزيع لا من حقل محفوظ</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + سند قبض
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث برقم السند أو العميل أو المرجع..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th>السند</th>
              <th>التاريخ</th>
              <th>العميل</th>
              <th>المبلغ</th>
              <th>المخصَّص</th>
              <th>الفواتير</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">لا سندات مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const isReversal = !!p.reversesId;
              // المخصَّصُ وغيرُ المخصَّص يصلان من الخادم (`ق-١٢٤٣`)؛ غيرُ المخصَّص يُقرأ رقماً لقرار الإظهار وحدَه.
              const onAccount = num0(p.unallocated);
              return (
                <tr key={p.id}>
                  <td className="num">
                    {p.no}
                    {isReversal && <span className="badge overdue" style={{ marginRight: 6 }}>عكسي</span>}
                  </td>
                  <td className="num">{dfmt(p.date)}</td>
                  <td>{p.customer.name}</td>
                  <td className="num">{fmt(Number(p.amount))}</td>
                  <td className="num">
                    {fmt(p.allocatedTotal)}
                    {Math.abs(onAccount) > 0.005 && <div className="hint">على الحساب: {fmt(p.unallocated)}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.allocations.map((a) => (
                      <div key={a.id} className="num">
                        {a.invoice.no} — {fmt(Number(a.amount))}
                      </div>
                    ))}
                    {p.allocations.length === 0 && <span className="hint">غير موزَّع</span>}
                    {/* ④A1: سندٌ أصدر فاتورةَ دفعةٍ مقدَّمة — يُقرأ من الخادم؛ ولا عكسَ له (الخادمُ يرفضه مسمّىً). */}
                    {p.prepaymentInvoice && (
                      <div className="hint num" data-testid="prepayment-invoice">
                        دفعة مقدَّمة {p.prepaymentInvoice.no} — {fmt(p.prepaymentInvoice.total)}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!isReversal && !p.prepaymentInvoice && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setReversing(p)}>
                        ↩ عكس
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <PaymentModal
          onCancel={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await reload();
          }}
        />
      )}

      {reversing && (
        <ConfirmModal
          title="عكس سند القبض"
          body={`إصدار سند عكسي للسند ${reversing.no} بمبلغ ${fmt(Number(reversing.amount))}؟ سيُرحَّل قيدٌ مضاد، وتعود الفواتير المخصَّصة إلى حالتها السابقة. السند الأصلي يبقى في السجل.`}
          confirmLabel="عكس السند"
          onCancel={() => setReversing(null)}
          onConfirm={confirmReverse}
        />
      )}
    </div>
  );
}
