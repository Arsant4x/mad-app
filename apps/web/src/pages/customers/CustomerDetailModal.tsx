import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useState } from 'react';
import { getCustomerSummary, type Customer, type CustomerSummary } from '../../api/customers';
import type { Invoice } from '../../api/invoices';
import { dfmt, fmt } from '../../lib/format';
import { num0 } from '../../lib/money';
import { STATUS_META } from '../invoices/statusMeta';
import { usePermissions } from '../../auth/PermissionsContext';
import { MarketingConsentPanel } from './MarketingConsentPanel';

/**
 * نافذةُ العميل — **الأرقامُ الثلاثة من الخادم** (`ق-١٢٤٣`): كانت تُجمع هنا من إجماليات الفواتير، فعُدّ
 * المقبوضُ من فواتيرَ ختمُها `PAID` وحدَها (المسدَّدُ جزئياً لا يُحسب) والرصيدُ من غير `PAID` بكامله.
 * صارت من `GET /customers/:id/summary`: المفوتَرُ صافياً، والمقبوضُ من التخصيصات، والرصيدُ من التعرّض.
 */
export function CustomerDetailModal({ customer, invoices, onClose }: { customer: Customer; invoices: Invoice[]; onClose: () => void }) {
  const customerInvoices = invoices.filter((v) => v.customerId === customer.id).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  const { can } = usePermissions();
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  // الملخّصُ رقمُ المنشأة كلِّها: يُرفض للمقيَّد بفرع (`ق-١٥٨١`)، فيُقال ذلك بدل «…» لا ينتهي.
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    getCustomerSummary(customer.id)
      .then(setSummary)
      .catch(() => setRefused(true));
  }, [customer.id]);
  const balance = num0(summary?.outstanding);

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

        {refused ? (
          <p className="hint" style={{ marginBottom: 16 }}>
            أرقامُ العميل في المنشأة كلِّها تُقرأ لمن يرى فروعَها كلَّها.
          </p>
        ) : (
          <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
            <div className="kpi-card neu">
              <div className="kpi-label">إجمالي الفواتير المصدَرة</div>
              <div className="kpi-value num">{summary ? `${fmt(summary.billed)} ر.س` : '…'}</div>
              <div className="kpi-delta">{customerInvoices.length} فاتورة</div>
            </div>
            <div className="kpi-card pos">
              <div className="kpi-label">المُحصَّل</div>
              <div className="kpi-value num">{summary ? `${fmt(summary.collected)} ر.س` : '…'}</div>
            </div>
            <div className={`kpi-card ${balance > 0 ? 'neg' : 'pos'}`}>
              <div className="kpi-label">الرصيد المستحق</div>
              <div className="kpi-value num">{summary ? `${fmt(summary.outstanding)} ر.س` : '…'}</div>
            </div>
          </div>
        )}

        {/* الموافقةُ التسويقية في بطاقة العميل — حيث ينظر التاجر إليه، لا في شاشةٍ مستقلة. */}
        <MarketingConsentPanel customerId={customer.id} canRecord={can('customers', 'record')} />

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
                <td className="num">
                  {v.no}
                  {/* Without this, a credit note reads as just another
                      invoice and the totals above look like they don't add up. */}
                  {v.docType !== 'INVOICE' && (
                    <span className={`badge ${v.docType === 'CREDIT_NOTE' ? 'overdue' : 'due'}`} style={{ marginInlineStart: 6 }}>
                      {v.docType === 'CREDIT_NOTE' ? 'إشعار دائن' : 'إشعار مدين'}
                    </span>
                  )}
                </td>
                <td className="num">{dfmt(v.issueDate)}</td>
                <td>
                  {v.docType === 'CREDIT_NOTE' ? (
                    <span className="badge">—</span>
                  ) : (
                    <span className={`badge ${badgeOf(STATUS_META, v.status).badgeClass}`}>{badgeOf(STATUS_META, v.status).label}</span>
                  )}
                </td>
                <td className="num">
                  {v.docType === 'CREDIT_NOTE' ? '−' : ''}
                  {fmt(v.total)}
                </td>
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
