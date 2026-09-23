import { useEffect, useMemo, useState } from 'react';
import { listBanks, type Bank } from '../../api/banks';
import { listBranches, type Branch } from '../../api/branches';
import type { Purchase } from '../../api/purchases';
import { createSupplierPayment, listOpenPurchases, type OpenPurchase, type SupplierPaymentInputMethod } from '../../api/supplierPayments';
import { dfmt, fmt, today } from '../../lib/format';
import { num0, round2 } from '../../lib/money';

/**
 * سندُ صرفٍ لمورّد وتوزيعُه على فواتير الشراء المفتوحة (`ق-٨٧١`) — مرآةُ نافذة سند القبض.
 *
 * يُفتح من فاتورةٍ بعينها: المورّدُ مثبَّت، والفاتورةُ مخصَّصةٌ ابتداءً بمتبقّيها — وما عداها من
 * فواتيره المفتوحة معروضٌ للتوزيع. المتبقّي لكل فاتورة **من الخادم** (من التخصيصات)، والتحقّقُ
 * النهائي على الخادم دائماً. **ولا درج هنا** — الصندوقُ أو البنك (`ق-٨٧٢`).
 */
export function SupplierPaymentModal({ purchase, onCancel, onSaved }: { purchase: Purchase; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [open, setOpen] = useState<OpenPurchase[]>([]);

  const [branchId, setBranchId] = useState(purchase.branchId ?? '');
  const [date, setDate] = useState(today());
  // ② المتبقّي يصل نصّاً بخانتين (`ق-١٢٣٥`) — يُقرأ رقماً مرّةً ثم يُملأ به الحقلان.
  const [amount, setAmount] = useState(String(round2(num0(purchase.remaining))));
  const [method, setMethod] = useState<SupplierPaymentInputMethod>('CASH');
  const [bankId, setBankId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({ [purchase.id]: String(round2(num0(purchase.remaining))) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBranches().then(setBranches);
    listBanks().then(setBanks);
    listOpenPurchases(purchase.supplierId).then(setOpen);
  }, [purchase.supplierId]);

  const allocatedSum = useMemo(() => Object.values(alloc).reduce((s, v) => s + (parseFloat(v) || 0), 0), [alloc]);
  const paymentAmount = parseFloat(amount) || 0;
  const unallocated = round2(paymentAmount - allocatedSum);

  /** توزيعٌ تلقائي: الأقدم فالأقدم حتى ينفد المبلغ. */
  function autoAllocate() {
    let left = paymentAmount;
    const next: Record<string, string> = {};
    for (const p of open) {
      if (left <= 0) break;
      const take = Math.min(left, num0(p.remaining));
      if (take > 0) {
        next[p.id] = String(round2(take));
        left = round2(left - take);
      }
    }
    setAlloc(next);
  }

  async function handleSave() {
    setError(null);
    if (paymentAmount <= 0) {
      setError('مبلغٌ موجب مطلوب.');
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
    setSaving(true);
    try {
      await createSupplierPayment({
        supplierId: purchase.supplierId,
        branchId: branchId || undefined,
        date,
        amount: paymentAmount,
        method,
        bankId: bankId || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        allocations: Object.entries(alloc)
          .map(([purchaseId, v]) => ({ purchaseId, amount: parseFloat(v) || 0 }))
          .filter((a) => a.amount > 0),
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
          <div className="modal-title">سند صرف — {purchase.supplier.name}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
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
            <label>طريقة السداد</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as SupplierPaymentInputMethod)}>
              <option value="CASH">نقداً</option>
              <option value="BANK">تحويل بنكي</option>
            </select>
          </div>
          <div className="field">
            <label>{method === 'BANK' ? 'الحساب البنكي' : 'الصندوق المسدِّد (اختياري)'}</label>
            <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">— بلا تحديد —</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="two-col">
          <div className="field">
            <label>الفرع</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">— بلا فرع —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>المرجع (رقم الشيك/الحوالة)</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>ملاحظات</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <b>توزيع السند على فواتير المورّد المفتوحة</b>
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
                  <div className="empty-state">لا فواتير مفتوحة لهذا المورّد — يمكن تسجيل السند على الحساب وتوزيعه لاحقاً</div>
                </td>
              </tr>
            )}
            {open.map((p) => (
              <tr key={p.id}>
                <td className="num">{p.no}</td>
                <td className="num">{dfmt(p.date)}</td>
                <td className="num">{fmt(Number(p.total))}</td>
                <td className="num">{fmt(p.remaining)}</td>
                <td>
                  <input
                    className="num"
                    type="number"
                    min="0"
                    max={p.remaining}
                    value={alloc[p.id] ?? ''}
                    onChange={(e) => setAlloc((a) => ({ ...a, [p.id]: e.target.value }))}
                    placeholder="0.00"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          المخصَّص: <b className="num">{fmt(allocatedSum)}</b> · غير المخصَّص (دفعة على الحساب):{' '}
          <b className="num" style={{ color: unallocated < 0 ? 'var(--rose)' : undefined }}>
            {fmt(unallocated)}
          </b>
        </p>

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
