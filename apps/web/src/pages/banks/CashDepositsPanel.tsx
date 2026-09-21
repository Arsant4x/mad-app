import { useEffect, useState } from 'react';
import { createCashDeposit, listCashDeposits, voidCashDeposit, type Bank, type CashDeposit, type CashDepositList } from '../../api/banks';
import { listCashDrawers, type CashDrawer } from '../../api/cashDrawers';
import { fmt } from '../../lib/format';

/**
 * إيداعاتُ الأدراج في البنوك عبر «نقدٍ في الطريق» `1190` (`ق-١٢٦١` ج — ⑦A3): الإيداعُ يخرج من الدرج إلى الطريق،
 * ويؤكّده سطرُ كشف البنك من لوحة التسوية، والإلغاءُ عكسٌ قبل التأكيد وحدَه.
 * **الشاشةُ تقرأ ولا تحسب** (`ق-١٢٤٣`): رصيدُ الطريق ومجموعُ المستندات ومطابقتُهما من الخادم؛ ورفضُ ما يفوق الدرجَ
 * يقوله الخادمُ بالرصيد المسمّى.
 */
const STATUS_LABEL: Record<CashDeposit['status'], { text: string; cls: string }> = {
  IN_TRANSIT: { text: 'في الطريق', cls: 'badge draft' },
  CONFIRMED: { text: 'مؤكَّد', cls: 'badge paid' },
  VOID: { text: 'ملغى', cls: 'badge' },
};

const today = () => new Date().toISOString().slice(0, 10);

export function CashDepositsPanel({ banks, onClose }: { banks: Bank[]; onClose: () => void }) {
  const [data, setData] = useState<CashDepositList | null>(null);
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{ drawerId: string; bankId: string; amount: string; date: string; memo: string }>({
    drawerId: '',
    bankId: banks[0]?.id ?? '',
    amount: '',
    date: today(),
    memo: '',
  });

  const fail = (e: unknown, fallback: string) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback);

  async function load() {
    setError(null);
    try {
      setData(await listCashDeposits());
    } catch (e) {
      fail(e, 'تعذّر تحميل الإيداعات');
    }
  }
  useEffect(() => {
    listCashDrawers().then(setDrawers).catch(() => {});
    load();
  }, []);

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      const created = await createCashDeposit({
        drawerId: form.drawerId,
        bankId: form.bankId,
        amount: Number(form.amount),
        date: form.date,
        memo: form.memo.trim() || undefined,
      });
      setNotice(`أُنشئ الإيداع ${created.no} بقيد ${created.entryNo} — يُؤكَّد من التسوية البنكية حين يظهر في الكشف.`);
      setForm({ ...form, amount: '', memo: '' });
      await load();
    } catch (e) {
      fail(e, 'تعذّر إنشاء الإيداع');
    }
  }

  async function voidOne(d: CashDeposit) {
    setError(null);
    setNotice(null);
    try {
      const voided = await voidCashDeposit(d.id);
      setNotice(`أُلغي الإيداع ${d.no} بقيد عكسٍ ${voided.voidEntryNo} — عاد النقد إلى الدرج.`);
      await load();
    } catch (e) {
      fail(e, 'تعذّر إلغاء الإيداع');
    }
  }

  const canSubmit = form.drawerId && form.bankId && Number(form.amount) > 0 && form.date;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>إيداعات الأدراج في البنوك</h3>
          <button className="btn secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
        <div className="muted" style={{ marginBottom: 10 }}>
          الإيداعُ يخرج من الدرج إلى «نقدٍ في الطريق» 1190، ويؤكّده سطرُ كشف البنك من التسوية البنكية بمبلغه نفسِه.
        </div>

        {error && <div className="error-text">{error}</div>}
        {notice && <div className="muted" data-testid="deposit-notice">{notice}</div>}

        <div className="card">
          <strong>إيداعٌ جديد</strong>
          <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label htmlFor="dep-drawer">الدرج</label>
              <select id="dep-drawer" value={form.drawerId} onChange={(e) => setForm({ ...form, drawerId: e.target.value })}>
                <option value="">— اختر درجاً —</option>
                {drawers
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {fmt(d.account.balance)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label htmlFor="dep-bank">البنك</label>
              <select id="dep-bank" value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>
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
            <div className="field" style={{ margin: 0, minWidth: 140 }}>
              <label htmlFor="dep-amount">المبلغ</label>
              <input id="dep-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="dep-date">التاريخ</label>
              <input id="dep-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 240 }}>
              <label htmlFor="dep-memo">البيان</label>
              <input id="dep-memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
            <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
              أودِع
            </button>
          </div>
        </div>

        {data && (
          <>
            <div className="toolbar" style={{ gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
              <span data-testid="in-transit-ledger">
                في الطريق بالدفتر (1190): <strong>{fmt(data.inTransit.ledger)}</strong>
              </span>
              <span>
                مستنداتٌ مفتوحة: <strong>{fmt(data.inTransit.documents)}</strong>
              </span>
              {data.inTransit.matched ? (
                <span className="badge paid">الدفترُ والمستنداتُ متطابقان</span>
              ) : (
                <span className="badge draft" data-testid="in-transit-gap">
                  فرقٌ بين الدفتر والمستندات — قيدٌ يدويّ على 1190 أو إيداعٌ سبق البناء
                </span>
              )}
            </div>

            <div className="card" style={{ padding: 0, marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>التاريخ</th>
                    <th>الدرج</th>
                    <th>البنك</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">لا إيداعات بعد</div>
                      </td>
                    </tr>
                  )}
                  {data.items.map((d) => (
                    <tr key={d.id} data-testid="deposit-row">
                      <td className="num">{d.no}</td>
                      <td className="num">{d.date}</td>
                      <td>{d.drawer.name}</td>
                      <td>{d.bank.name}</td>
                      <td className="num">{fmt(d.amount)}</td>
                      <td>
                        <span className={STATUS_LABEL[d.status].cls}>{STATUS_LABEL[d.status].text}</span>
                      </td>
                      <td>
                        {d.status === 'IN_TRANSIT' && (
                          <button className="btn link" onClick={() => voidOne(d)}>
                            ↩ ألغِ (عكس)
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
