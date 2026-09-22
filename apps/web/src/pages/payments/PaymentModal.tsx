import { useEffect, useMemo, useState } from 'react';
import { listBanks, type Bank } from '../../api/banks';
import { listBranches, type Branch } from '../../api/branches';
import { listCustomers, type Customer } from '../../api/customers';
import { createPayment, listOpenInvoices, UNALLOCATED_DECLARATION_MIN, type OpenInvoice, type PaymentMethod, type UnallocatedFate } from '../../api/payments';
import { dfmt, fmt, today } from '../../lib/format';
import { num0, round2 } from '../../lib/money';
import { lineTaxDraftError, lineTaxPayload, TAX_CATEGORY_OPTIONS, type DeclarableTaxCategory, type LineTaxDraft } from '../../lib/vat';
import { LineTaxPicker } from '../../components/LineTaxPicker';

/**
 * تسجيل سند قبض وتوزيعه على فواتير العميل المفتوحة.
 *
 * المتبقي المعروض لكل فاتورة يأتي **محسوباً من الخادم** (من التخصيصات)، ولا
 * تحسبه الشاشة من حقل مخزَّن — والتحقق النهائي على الخادم دائماً.
 */
export function PaymentModal({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => Promise<void> }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [open, setOpen] = useState<OpenInvoice[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [bankId, setBankId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  // ④A1: مصيرُ الفائض — يُسأل حين يظهر، ولا يُفترض (`ق-٨٩٨`)؛ والخادمُ يرفض المعلَنَ على الحساب بلا فواتيرَ تغطّيه.
  const [fate, setFate] = useState<UnallocatedFate | ''>('');
  // ④A1 (`ق-١٢٦٤`/②): فئةُ ما يُدفع مقدَّماً عنه — تُختار ولا تبدأ بقيمة (إيجارٌ سكنيٌّ معفى لا يُفوتَر بالنسبة الأساسية).
  const [prepaymentTax, setPrepaymentTax] = useState<LineTaxDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCustomers().then(setCustomers);
    listBranches().then(setBranches);
    listBanks().then(setBanks);
  }, []);

  useEffect(() => {
    setAlloc({});
    if (!customerId) {
      setOpen([]);
      return;
    }
    listOpenInvoices(customerId).then(setOpen);
  }, [customerId]);

  const allocatedSum = useMemo(() => Object.values(alloc).reduce((s, v) => s + (parseFloat(v) || 0), 0), [alloc]);
  const paymentAmount = parseFloat(amount) || 0;
  const unallocated = round2(paymentAmount - allocatedSum);

  /** توزيع تلقائي: الأقدم فالأقدم حتى ينفد المبلغ — يوفّر نقرات المحاسب. */
  function autoAllocate() {
    let left = paymentAmount;
    const next: Record<string, string> = {};
    for (const inv of open) {
      if (left <= 0) break;
      // ② المتبقّي يصل نصّاً (`ق-١٢٣٥`) — يُقرأ رقماً قبل المقارنة.
      const take = Math.min(left, num0(inv.remaining));
      if (take > 0) {
        next[inv.id] = String(round2(take));
        left = round2(left - take);
      }
    }
    setAlloc(next);
  }

  async function handleSave() {
    setError(null);
    if (!customerId || paymentAmount <= 0) {
      setError('العميل ومبلغ موجب مطلوبان.');
      return;
    }
    if (method === 'BANK' && !bankId) {
      setError('اختر الحساب البنكي للتحويل.');
      return;
    }
    if (allocatedSum - paymentAmount > 0.005) {
      setError('مجموع التخصيصات يتجاوز مبلغ السند.');
      return;
    }
    const mustDeclare = unallocated > UNALLOCATED_DECLARATION_MIN;
    if (mustDeclare && !fate) {
      setError(`في السند ${fmt(unallocated)} فوق المخصَّص — أعلن ما يكون: دفعةً مقدَّمة (تصدر لها فاتورة 386 الآن) أو مبلغاً على الحساب.`);
      return;
    }
    if (mustDeclare && fate === 'PREPAYMENT') {
      if (!prepaymentTax) {
        setError('الدفعة المقدَّمة تحمل فئة ما يُدفع عنه — اخترها (خاضع · صفر بسببه · معفى بسببه · خارج النطاق بسببه)؛ تُعلَن ولا تُفترض.');
        return;
      }
      const taxProblem = lineTaxDraftError(prepaymentTax);
      if (taxProblem) {
        setError(taxProblem);
        return;
      }
    }
    setSaving(true);
    try {
      await createPayment({
        customerId,
        branchId: branchId || undefined,
        date,
        amount: paymentAmount,
        method,
        bankId: bankId || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        allocations: Object.entries(alloc)
          .map(([invoiceId, v]) => ({ invoiceId, amount: parseFloat(v) || 0 }))
          .filter((a) => a.amount > 0),
        ...(mustDeclare && fate ? { unallocated: fate } : {}),
        ...(mustDeclare && fate === 'PREPAYMENT' && prepaymentTax ? { prepaymentTax: lineTaxPayload(prepaymentTax) } : {}),
      });
      await onSaved();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(d?.message) ? d.message.join(' — ') : (d?.message ?? 'تعذّر تسجيل السند'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-head">
          <div className="modal-title">سند قبض جديد</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="two-col">
          <div className="field">
            <label>العميل</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— اختر —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>الفرع (يحدّد الصندوق المستلِم)</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">— بلا فرع —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="two-col">
          <div className="field">
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>المبلغ</label>
            <input className="num" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="two-col">
          <div className="field">
            <label>طريقة القبض</label>
            <select
              value={method}
              onChange={(e) => {
                const next = e.target.value as PaymentMethod;
                setMethod(next);
                // الشبكةُ ذمّةٌ على المستحوذ (1251) لا نقدٌ في بنك — فلا بنكَ يُرسَل معها.
                if (next === 'CARD') setBankId('');
              }}
            >
              <option value="CASH">نقداً</option>
              <option value="BANK">تحويل بنكي</option>
              <option value="CARD">شبكة (جهاز البنك)</option>
            </select>
          </div>
          {method === 'CARD' ? (
            <div className="field">
              <label>الحساب</label>
              <div className="muted">مدينو شبكة المدفوعات (1251) حتى يحوّلها المستحوذ — تدخل البنك من «تسويات الشبكة»</div>
            </div>
          ) : (
            <div className="field">
              <label>{method === 'BANK' ? 'الحساب البنكي' : 'الصندوق المستلِم (اختياري)'}</label>
              <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
                <option value="">— بلا تحديد —</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="two-col">
          <div className="field">
            <label>المرجع (رقم الشيك/الحوالة)</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="field">
            <label>ملاحظات</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {customerId && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <b>توزيع السند على الفواتير المفتوحة</b>
              <button className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }} onClick={autoAllocate} disabled={paymentAmount <= 0}>
                توزيع تلقائي (الأقدم أولاً)
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>الفاتورة</th>
                  <th>التاريخ</th>
                  <th>الإجمالي</th>
                  <th>المتبقي</th>
                  <th>المخصَّص</th>
                </tr>
              </thead>
              <tbody>
                {open.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">لا فواتير مفتوحة لهذا العميل — ما يُقبض قبل التوريد دفعةٌ مقدَّمة تُصدَر لها فاتورة 386 بتاريخ السند</div>
                    </td>
                  </tr>
                )}
                {open.map((inv) => (
                  <tr key={inv.id}>
                    <td className="num">{inv.no}</td>
                    <td className="num">{dfmt(inv.issueDate)}</td>
                    <td className="num">{fmt(Number(inv.total))}</td>
                    <td className="num">{fmt(inv.remaining)}</td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        min="0"
                        max={inv.remaining}
                        value={alloc[inv.id] ?? ''}
                        onChange={(e) => setAlloc((a) => ({ ...a, [inv.id]: e.target.value }))}
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              المخصَّص: <b className="num">{fmt(allocatedSum)}</b> · غير المخصَّص:{' '}
              <b className="num" style={{ color: unallocated < 0 ? 'var(--rose)' : undefined }}>
                {fmt(unallocated)}
              </b>
            </p>
          </>
        )}
        {/* ④A1: فائضٌ فوق هللات التدوير يُعلَن مصيرُه — لا افتراضَ صامتاً. والخادمُ يرفض «على الحساب» بلا فواتيرَ مفتوحةٍ تغطّيه (م٥٣). */}
        {customerId && paymentAmount > 0 && unallocated > UNALLOCATED_DECLARATION_MIN && (
          <fieldset className="field" data-testid="unallocated-fate" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            <legend>ما مصيرُ {fmt(unallocated)} فوق المخصَّص؟</legend>
            <label style={{ display: 'block' }}>
              <input type="radio" name="unallocated-fate" value="PREPAYMENT" checked={fate === 'PREPAYMENT'} onChange={() => setFate('PREPAYMENT')} /> دفعة مقدَّمة — تصدر لها فاتورة دفعة مقدَّمة (386) بتاريخ السند وتُخصم من فاتورة التوريد لاحقاً
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" name="unallocated-fate" value="ON_ACCOUNT" checked={fate === 'ON_ACCOUNT'} onChange={() => setFate('ON_ACCOUNT')} /> على الحساب — يُخصَّص لاحقاً على فواتيرَ مفتوحةٍ قائمة تغطّيه
            </label>
            {fate === 'PREPAYMENT' && (
              <div className="field" data-testid="prepayment-tax" style={{ marginTop: 8 }}>
                <label>فئةُ ما يُدفع مقدَّماً عنه — تُعلَن ولا تُفترض (إيجارٌ سكنيّ معفى · خدمةٌ خاضعة · …)</label>
                {prepaymentTax ? (
                  <LineTaxPicker value={prepaymentTax} onChange={setPrepaymentTax} />
                ) : (
                  <select aria-label="فئة الدفعة المقدَّمة" value="" onChange={(e) => e.target.value && setPrepaymentTax({ taxCategory: e.target.value as DeclarableTaxCategory })}>
                    <option value="">— اختر الفئة —</option>
                    {TAX_CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </fieldset>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            تسجيل السند
          </button>
        </div>
      </div>
    </div>
  );
}
