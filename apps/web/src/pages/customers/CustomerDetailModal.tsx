import type { Customer } from '../../api/customers';
import type { Invoice } from '../../api/invoices';
import { dfmt, fmt } from '../../lib/format';
import { STATUS_META } from '../invoices/statusMeta';

export function CustomerDetailModal({ customer, invoices, onClose }: { customer: Customer; invoices: Invoice[]; onClose: () => void }) {
  const customerInvoices = invoices.filter((v) => v.customerId === customer.id).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  const totalBilled = customerInvoices.reduce((s, v) => s + Number(v.total), 0);
  const totalPaid = customerInvoices.filter((v) => v.status === 'PAID').reduce((s, v) => s + Number(v.total), 0);
  const balance = customerInvoices.filter((v) => v.status !== 'PAID').reduce((s, v) => s + Number(v.total), 0);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{customer.name}</div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>الرقم الضريبي</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {customer.vatNumber || '—'}
            </p>
          </div>
          <div className="field">
            <label>الجوال</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {customer.phone || '—'}
            </p>
          </div>
        </div>

        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
          <div className="kpi-card neu">
            <div className="kpi-label">إجمالي الفواتير المصدَرة</div>
            <div className="kpi-value num">{fmt(totalBilled)} ر.س</div>
            <div className="kpi-delta">{customerInvoices.length} فاتورة</div>
          </div>
          <div className="kpi-card pos">
            <div className="kpi-label">المُحصَّل</div>
            <div className="kpi-value num">{fmt(totalPaid)} ر.س</div>
          </div>
          <div className={`kpi-card ${balance > 0 ? 'neg' : 'pos'}`}>
            <div className="kpi-label">الرصيد المستحق</div>
            <div className="kpi-value num">{fmt(balance)} ر.س</div>
          </div>
        </div>

        <div className="card-title" style={{ marginBottom: 10 }}>
          سجل الفواتير ({customerInvoices.length})
        </div>
        <table>
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {customerInvoices.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">لا توجد فواتير لهذا العميل بعد</div>
                </td>
              </tr>
            )}
            {customerInvoices.map((v) => (
              <tr key={v.id}>
                <td className="num">{v.no}</td>
                <td className="num">{dfmt(v.issueDate)}</td>
                <td>
                  <span className={`badge ${STATUS_META[v.status].badgeClass}`}>{STATUS_META[v.status].label}</span>
                </td>
                <td className="num">{fmt(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
