import { useEffect, useState } from 'react';
import {
  createNetworkSettlement,
  getOpenNetworkReceipts,
  listNetworkSettlements,
  voidNetworkSettlement,
  type Bank,
  type NetworkSettlement,
  type NetworkSettlementList,
  type OpenNetworkReceipts,
} from '../../api/banks';
import { fmt, today } from '../../lib/format';
import { round2 } from '../../lib/money';

/**
 * تسويةُ الشبكة `1251` (`ق-١٢٦١` ج — ⑦A2): سنداتُ القبض بالشبكة في مدًى تُطالب بها تسويةٌ واحدة، الإجماليُّ من
 * الدفتر، والعمولةُ وضريبتُها من إشعار المستحوذ، والصافي يدخل البنك. **الشاشةُ تقرأ ولا تحسب** (`ق-١٢٤٣`):
 * الإجماليُّ والمفتوحُ ومطابقةُ الدفتر من الخادم؛ والصافي المعروض قبل الإرسال تلميحٌ يعيد الخادمُ حسابَه.
 */
const STATUS_LABEL: Record<NetworkSettlement['status'], { text: string; cls: string }> = {
  POSTED: { text: 'مرحَّلة', cls: 'badge paid' },
  VOID: { text: 'ملغاة', cls: 'badge' },
};

export function NetworkSettlementsPanel({ banks, onClose }: { banks: Bank[]; onClose: () => void }) {
  const [data, setData] = useState<NetworkSettlementList | null>(null);
  const [open, setOpen] = useState<OpenNetworkReceipts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ bankId: banks[0]?.id ?? '', date: today(), periodFrom: '', periodTo: '', fee: '', feeVat: '', memo: '' });

  const fail = (e: unknown, fallback: string) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback);

  async function load() {
    setError(null);
    try {
      setData(await listNetworkSettlements());
    } catch (e) {
      fail(e, 'تعذّر تحميل التسويات');
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!form.periodFrom || !form.periodTo) {
      setOpen(null);
      return;
    }
    getOpenNetworkReceipts({ from: form.periodFrom, to: form.periodTo })
      .then(setOpen)
      .catch((e) => fail(e, 'تعذّر قراءة المفتوح'));
  }, [form.periodFrom, form.periodTo]);

  const fee = Number(form.fee || 0);
  const feeVat = Number(form.feeVat || 0);
  const gross = open ? Number(open.gross) : 0;
  const netHint = open ? round2(gross - fee - feeVat) : null;
  const canSubmit = form.bankId && form.date && form.periodFrom && form.periodTo && open && open.receipts.length > 0 && fee >= 0 && feeVat >= 0;

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      const created = await createNetworkSettlement({
        bankId: form.bankId,
        date: form.date,
        periodFrom: form.periodFrom,
        periodTo: form.periodTo,
        feeAmount: fee,
        feeVatAmount: feeVat,
        memo: form.memo.trim() || undefined,
      });
      setNotice(`رُحّلت التسوية ${created.no} بقيد ${created.entryNo} — إجماليٌّ ${fmt(created.grossAmount)} وصافٍ ${fmt(created.netAmount)} إلى البنك.`);
      setForm({ ...form, fee: '', feeVat: '', memo: '' });
      setOpen(null);
      await load();
    } catch (e) {
      fail(e, 'تعذّر ترحيل التسوية');
    }
  }

  async function voidOne(s: NetworkSettlement) {
    setError(null);
    setNotice(null);
    try {
      const voided = await voidNetworkSettlement(s.id);
      setNotice(`أُلغيت التسوية ${s.no} بقيد عكسٍ ${voided.voidEntryNo} — عادت السندات إلى المفتوح.`);
      await load();
    } catch (e) {
      fail(e, 'تعذّر إلغاء التسوية');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>تسويات الشبكة (1251)</h3>
          <button className="btn secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
        <div className="muted" style={{ marginBottom: 10 }}>
          بيعُ الشبكة ذمّةٌ على المستحوذ في 1251 حتى يحوّل؛ التسويةُ تطالب بسندات مدًى فتدخل البنكَ صافيةً وتُثبت العمولةَ وضريبتَها في شهرهما.
        </div>

        {error && <div className="error-text">{error}</div>}
        {notice && <div className="muted" data-testid="settlement-notice">{notice}</div>}

        {data && (
          <div className="toolbar" style={{ gap: 16, flexWrap: 'wrap' }}>
            <span data-testid="network-ledger">
              على الشبكة بالدفتر (1251): <strong>{fmt(data.summary.ledger)}</strong>
            </span>
            <span>
              سنداتٌ مفتوحة: <strong>{data.summary.openCount}</strong> بمجموع <strong>{fmt(data.summary.open)}</strong>
            </span>
            {data.summary.matched ? (
              <span className="badge paid">الدفترُ والسنداتُ متطابقان</span>
            ) : (
              <span className="badge draft" data-testid="network-gap">
                فرقٌ بين الدفتر والسندات — سطرٌ على 1251 بلا سند أو قيدٌ يدويّ
              </span>
            )}
          </div>
        )}

        <div className="card">
          <strong>تسويةٌ جديدة</strong>
          <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label htmlFor="ns-bank">البنك</label>
              <select id="ns-bank" value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>
                <option value="">— اختر بنكاً —</option>
                {banks
                  .filter((b) => !b.archived)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ns-date">تاريخ التحويل</label>
              <input id="ns-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ns-from">سندات من</label>
              <input id="ns-from" type="date" value={form.periodFrom} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ns-to">إلى</label>
              <input id="ns-to" type="date" value={form.periodTo} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 130 }}>
              <label htmlFor="ns-fee">العمولة</label>
              <input id="ns-fee" type="number" min="0" step="0.01" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 130 }}>
              <label htmlFor="ns-fee-vat">ضريبة العمولة</label>
              <input id="ns-fee-vat" type="number" min="0" step="0.01" value={form.feeVat} onChange={(e) => setForm({ ...form, feeVat: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 220 }}>
              <label htmlFor="ns-memo">البيان</label>
              <input id="ns-memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
            <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
              رحِّل التسوية
            </button>
          </div>
          {open && (
            <div className="muted" data-testid="open-hint" style={{ marginTop: 8 }}>
              في المدى: <strong>{open.receipts.length}</strong> سنداً بإجماليٍّ <strong>{fmt(open.gross)}</strong>
              {netHint !== null && (
                <>
                  {' '}· الصافي المتوقَّع إلى البنك: <strong>{fmt(String(netHint))}</strong>
                </>
              )}
              {open.receipts.length === 0 && ' — لا سنداتٍ مفتوحة في هذا المدى'}
            </div>
          )}
        </div>

        {data && (
          <div className="card" style={{ padding: 0, marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>التحويل</th>
                  <th>المدى</th>
                  <th>البنك</th>
                  <th>الإجمالي</th>
                  <th>العمولة + ضريبتها</th>
                  <th>الصافي</th>
                  <th>السندات</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state">لا تسويات بعد</div>
                    </td>
                  </tr>
                )}
                {data.items.map((s) => (
                  <tr key={s.id} data-testid="settlement-row">
                    <td className="num">{s.no}</td>
                    <td className="num">{s.date}</td>
                    <td className="num">
                      {s.periodFrom} → {s.periodTo}
                    </td>
                    <td>{s.bank.name}</td>
                    <td className="num">{fmt(s.grossAmount)}</td>
                    <td className="num">
                      {fmt(s.feeAmount)} + {fmt(s.feeVatAmount)}
                    </td>
                    <td className="num">{fmt(s.netAmount)}</td>
                    <td className="num">{s.receiptCount}</td>
                    <td>
                      <span className={STATUS_LABEL[s.status].cls}>{STATUS_LABEL[s.status].text}</span>
                    </td>
                    <td>
                      {s.status === 'POSTED' && (
                        <button className="btn link" onClick={() => voidOne(s)}>
                          ↩ ألغِ (عكس)
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
