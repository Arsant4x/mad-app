import { useMemo, useState } from 'react';
import type { Branch } from '../../api/branches';
import type { Customer, Invoice } from '../../api/invoices';
import { fmt, toLocalISODate, today } from '../../lib/format';
import i18n from '../../i18n';

interface LineDraft {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

const DEFAULT_NOTES = 'يتم سداد المبلغ خلال 30 يوماً من تاريخ الإصدار. تُضاف غرامة تأخير بنسبة 1.5٪ شهرياً على المبالغ المتأخرة.';

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toLocalISODate(d);
}

function initialLines(editing: Invoice | null): LineDraft[] {
  if (editing) {
    return editing.lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      taxRate: Number(l.taxRate),
    }));
  }
  return [
    { description: 'اشتراك شهري — النظام المحاسبي', quantity: 1, unitPrice: 1200, taxRate: 15 },
    { description: 'تدريب فريق المحاسبة', quantity: 3, unitPrice: 450, taxRate: 15 },
  ];
}

export function InvoiceBuilderView({
  customers,
  editing,
  nextNumberHint,
  branches,
  onCancel,
  onSave,
  onCreateCustomer,
}: {
  customers: Customer[];
  branches: Branch[];
  editing: Invoice | null;
  nextNumberHint: string;
  onCancel: () => void;
  onSave: (data: { customerId: string; issueDate: string; dueDate: string; notes: string; branchId: string; lines: LineDraft[] }) => Promise<void>;
  onCreateCustomer: (name: string) => Promise<Customer>;
}) {
  const [customerInput, setCustomerInput] = useState(editing?.customer.name ?? '');
  const [issueDate, setIssueDate] = useState(editing ? editing.issueDate.slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(editing ? editing.dueDate.slice(0, 10) : defaultDueDate());
  const [notes, setNotes] = useState(editing?.notes ?? DEFAULT_NOTES);
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() => initialLines(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const tax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / 100), 0);
    return { subtotal, tax, grand: subtotal + tax };
  }, [lines]);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { description: '', quantity: 1, unitPrice: 0, taxRate: 15 }]);
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    setError(null);
    const name = customerInput.trim();
    if (!name) {
      setError(i18n.t('err_customer_name_first'));
      return;
    }
    if (lines.length === 0 || lines.some((l) => !l.description.trim())) {
      setError(i18n.t('err_invoice_line_desc'));
      return;
    }

    setSaving(true);
    try {
      let customer = customers.find((c) => c.name === name);
      if (!customer) customer = await onCreateCustomer(name);
      await onSave({ customerId: customer.id, issueDate, dueDate, notes, branchId, lines });
    } catch {
      setError(i18n.t('err_invoice_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{editing ? 'تعديل فاتورة' : 'إنشاء فاتورة'}</div>
          <div className="page-sub">سيتم ترحيلها تلقائياً إلى الذمم المدينة عند الإصدار</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديلات' : 'إصدار الفاتورة'}
          </button>
        </div>
      </div>

      <div className="builder-grid">
        <div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>
              بيانات الفاتورة
            </div>
            <div className="two-col">
              <div className="field">
                <label>العميل</label>
                <input list="inv-customer-suggestions" value={customerInput} onChange={(e) => setCustomerInput(e.target.value)} placeholder="اكتب للبحث عن العميل..." />
                <datalist id="inv-customer-suggestions">
                  {customers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>رقم الفاتورة</label>
                <input className="num" readOnly value={editing?.no ?? nextNumberHint} />
              </div>
              <div className="field">
                <label>تاريخ الإصدار</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="field">
                <label>تاريخ الاستحقاق</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            {/* Only shown once branches exist — a single-location business
                should never be asked to pick one. */}
            {branches.length > 0 && (
              <div className="field">
                <label>الفرع</label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">— على مستوى الشركة —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>
              بنود الفاتورة
            </div>
            <table className="line-items">
              <thead>
                <tr>
                  <th>الوصف</th>
                  <th style={{ width: 55 }}>الكمية</th>
                  <th style={{ width: 95 }}>السعر</th>
                  <th style={{ width: 80 }}>الضريبة</th>
                  <th style={{ width: 100 }}>الإجمالي</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                    </td>
                    <td>
                      <input className="num" value={l.quantity} onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <input className="num" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <select value={l.taxRate} onChange={(e) => updateLine(i, { taxRate: parseFloat(e.target.value) })}>
                        <option value={15}>15٪</option>
                        <option value={0}>0٪ (معفى)</option>
                      </select>
                    </td>
                    <td className="num line-total">{fmt(l.quantity * l.unitPrice)}</td>
                    <td>
                      {lines.length > 1 && (
                        <button className="remove-line" onClick={() => removeLine(i)}>
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-line" onClick={addLine}>
              + إضافة بند جديد
            </button>
          </div>

          <div className="card">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>ملاحظات</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
        </div>

        <div>
          <div className="totals-card">
            <div className="t-row">
              <span>المجموع الفرعي</span>
              <span className="num">{fmt(totals.subtotal)}</span>
            </div>
            <div className="t-row">
              <span>ضريبة القيمة المضافة</span>
              <span className="num">{fmt(totals.tax)}</span>
            </div>
            <div className="t-row grand">
              <span>الإجمالي المستحق</span>
              <span className="num">{fmt(totals.grand)} ر.س</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
