import { useMemo, useState } from 'react';
import type { Purchase } from '../../api/purchases';
import type { Supplier } from '../../api/suppliers';
import { dfmt, fmt } from '../../lib/format';
import { purchaseStatus } from './purchaseStatus';

export function SupplierDetailModal({ supplier, purchases, onClose }: { supplier: Supplier; purchases: Purchase[]; onClose: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const allForSupplier = useMemo(() => purchases.filter((p) => p.supplierId === supplier.id), [purchases, supplier.id]);
  const filtered = useMemo(
    () =>
      allForSupplier
        .filter((p) => (!from || p.date.slice(0, 10) >= from) && (!to || p.date.slice(0, 10) <= to))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [allForSupplier, from, to],
  );

  // إشعارُ المورّد الدائن يخفّض ما فُوتر — بإشارته (المبالغُ مخزَّنةٌ موجبةً والنوعُ يحمل الاتجاه).
  const totalBilled = filtered.reduce((s, p) => s + (p.docType === 'SUPPLIER_CREDIT_NOTE' ? -1 : 1) * Number(p.total), 0);
  // المسدَّدُ من تخصيصات سندات الصرف كما يحسبه الخادم (ق-٨٧٢) — لا من علَمٍ على الصفّ.
  const totalPaid = filtered.reduce((s, p) => s + Number(p.allocated), 0);
  const totalDue = totalBilled - totalPaid;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{supplier.name}</div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>الرقم الضريبي</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {supplier.vatNumber || '—'}
            </p>
          </div>
          <div className="field">
            <label>الجوال</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {supplier.phone || '—'}
            </p>
          </div>
        </div>

        <div className="two-col" style={{ marginBottom: 10 }}>
          <div className="field">
            <label>من تاريخ</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>إلى تاريخ</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {(from || to) && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: 10 }}
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            ✕ إظهار كل الفواتير
          </button>
        )}

        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
          <div className="kpi-card neu">
            <div className="kpi-label">إجمالي فواتير الشراء</div>
            <div className="kpi-value num">{fmt(totalBilled)} ر.س</div>
            <div className="kpi-delta">
              {filtered.length} من {allForSupplier.length} فاتورة
            </div>
          </div>
          <div className="kpi-card pos">
            <div className="kpi-label">المسدَّد</div>
            <div className="kpi-value num">{fmt(totalPaid)} ر.س</div>
          </div>
          <div className={`kpi-card ${totalDue > 0 ? 'neg' : 'pos'}`}>
            <div className="kpi-label">المتبقي غير المسدَّد</div>
            <div className="kpi-value num">{fmt(totalDue)} ر.س</div>
          </div>
        </div>

        <div className="card-title" style={{ marginBottom: 10 }}>
          سجل فواتير الشراء ({filtered.length})
        </div>
        <table>
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>الفئة</th>
              <th>الحالة</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">لا توجد فواتير من هذا المورد بهذه الفترة</div>
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const status = purchaseStatus(p);
              return (
                <tr key={p.id}>
                  <td className="num">{p.no}</td>
                  <td className="num">{dfmt(p.date)}</td>
                  <td>{p.category || '—'}</td>
                  <td>
                    <span className={`badge ${status.badgeClass}`}>{status.label}</span>
                  </td>
                  <td className="num">{fmt(p.total)}</td>
                </tr>
              );
            })}
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
