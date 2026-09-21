import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../lib/apiError';
import type { Branch } from '../../api/branches';
import type { Customer, Invoice, InvoiceLineInput } from '../../api/invoices';
import type { NewCustomerKind } from '../../api/customers';
import { fmt, toLocalISODate, today } from '../../lib/format';
import { draftTaxOf, lineTaxDraftError, lineTaxPayload, rateForCategory, STANDARD_LINE_TAX, type LineTaxDraft } from '../../lib/vat';
import { LineTaxPicker } from '../../components/LineTaxPicker';
import i18n from '../../i18n';

/** ⑧ البندُ يحمل الفئةَ والسبب لا نسبةً تُختار (`ق-١٢١١`/③)؛ والنسبةُ للمعاينة تُقرأ من الفئة. */
export interface LineDraft {
  description: string;
  quantity: number;
  unitPrice: number;
  /** ④B1 — خصمٌ مبلغاً على السطر؛ صفرٌ غياباً. */
  discount: number;
  tax: LineTaxDraft;
}

/** ما يُرسَل للخادم: الوصفُ والكمّيةُ والسعرُ والفئةُ بسببها — بلا `taxRate` (الخادمُ يشتقّها). */
function lineDraftPayload(l: LineDraft): InvoiceLineInput {
  return { description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, ...(l.discount > 0 ? { discount: l.discount } : {}), ...lineTaxPayload(l.tax) };
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
      discount: Number(l.discount ?? 0),
      tax: draftTaxOf(l),
    }));
  }
  return [
    { description: 'اشتراك شهري — النظام المحاسبي', quantity: 1, unitPrice: 1200, discount: 0, tax: STANDARD_LINE_TAX },
    { description: 'تدريب فريق المحاسبة', quantity: 3, unitPrice: 450, discount: 0, tax: STANDARD_LINE_TAX },
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
  onSave: (data: { customerId: string; issueDate: string; issuedAt?: string; issuedOffsetMin?: number; dueDate: string; notes: string; branchId: string; lines: InvoiceLineInput[] }) => Promise<void>;
  onCreateCustomer: (name: string, kind: NewCustomerKind) => Promise<Customer>;
}) {
  const [customerInput, setCustomerInput] = useState(editing?.customer.name ?? '');
  // ②A1: عميلٌ جديد يُنشأ من هنا يحتاج صفتَه — الخادمُ يرفض بلا صفة، والشاشةُ تسألها بجانب الاسم.
  const [newCustomerKind, setNewCustomerKind] = useState<NewCustomerKind | ''>('');
  const [issueDate, setIssueDate] = useState(editing ? editing.issueDate.slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(editing ? editing.dueDate.slice(0, 10) : defaultDueDate());
  const [notes, setNotes] = useState(editing?.notes ?? DEFAULT_NOTES);
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() => initialLines(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // معاينةٌ بنسبةٍ مشتقّةٍ من الفئة — والمعتمَدُ ما يعيده الخادم بدالّة المجاميع الواحدة.
  const totals = useMemo(() => {
    // ④B1 — الصافي بعد خصم السطر، والضريبةُ منه (BT-131).
    const net = (l: LineDraft) => Math.max(0, l.quantity * l.unitPrice - (l.discount || 0));
    const subtotal = lines.reduce((s, l) => s + net(l), 0);
    const tax = lines.reduce((s, l) => s + net(l) * (rateForCategory(l.tax.taxCategory) / 100), 0);
    return { subtotal, tax, grand: subtotal + tax };
  }, [lines]);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { description: '', quantity: 1, unitPrice: 0, discount: 0, tax: STANDARD_LINE_TAX }]);
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
    // سببُ الفئة قبل الإرسال — بقواعد الخادم نفسِها كي لا يُفاجَأ التاجر بـ400 بعد أن أنشأ العميل.
    const taxProblem = lines.map((l, i) => ({ i, msg: lineTaxDraftError(l.tax) })).find((x) => x.msg);
    if (taxProblem) {
      setError(`البند ${taxProblem.i + 1}: ${taxProblem.msg}`);
      return;
    }

    setSaving(true);
    try {
      let customer = customers.find((c) => c.name === name);
      if (!customer) {
        if (!newCustomerKind) {
          setError('العميل جديد — اختر صفته (فرد · مؤسسة · شخص اعتباري) فهي ما يقرّر نوع الفاتورة');
          setSaving(false);
          return;
        }
        customer = await onCreateCustomer(name, newCustomerKind);
      }
      // فاتورةٌ مؤرَّخةٌ باليوم تحمل لحظةَ الجهاز وانحرافَه؛ والمؤرَّخة بيدٍ في يومٍ آخر
      // لا وقتَ معلوماً لها فلا يُخترَع (ق-١٨٥).
      const stamped = issueDate === today() ? { issuedAt: new Date().toISOString(), issuedOffsetMin: -new Date().getTimezoneOffset() } : {};
      await onSave({ customerId: customer.id, issueDate, dueDate, notes, branchId, lines: lines.map(lineDraftPayload), ...stamped });
    } catch (e) {
      setError(apiErrorMessage(e, i18n.t('err_invoice_save')));
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
                {customerInput.trim() && !customers.some((c) => c.name === customerInput.trim()) && (
                  <select aria-label="صفة العميل الجديد" value={newCustomerKind} onChange={(e) => setNewCustomerKind(e.target.value as NewCustomerKind | '')} style={{ marginTop: 6 }}>
                    <option value="">عميل جديد — اختر صفته</option>
                    <option value="NATURAL">فرد — فاتورة مبسّطة</option>
                    <option value="ESTABLISHMENT">مؤسسة فردية — فاتورة كاملة</option>
                    <option value="LEGAL_PERSON">شخص اعتباري — فاتورة كاملة</option>
                  </select>
                )}
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
                  <th style={{ width: 80 }}>الخصم</th>
                  <th style={{ width: 210 }}>الفئة الضريبية</th>
                  <th style={{ width: 55 }}>النسبة</th>
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
                      <input className="num" aria-label={`خصم البند ${i + 1}`} value={l.discount} onChange={(e) => updateLine(i, { discount: Math.max(0, parseFloat(e.target.value) || 0) })} />
                    </td>
                    <td>
                      <LineTaxPicker compact value={l.tax} onChange={(tax) => updateLine(i, { tax })} />
                    </td>
                    {/* النسبةُ تُقرأ من الفئة ولا تُدخَل — عمودٌ للقراءة كما في النموذج المُقرّ. */}
                    <td className="num">{rateForCategory(l.tax.taxCategory)}٪</td>
                    <td className="num line-total">{fmt(Math.max(0, l.quantity * l.unitPrice - (l.discount || 0)))}</td>
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
