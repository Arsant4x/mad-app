import { useState } from 'react';
import { recordKeyMoney, type Contract, type KeyMoneyDirection } from '../../api/contracts';
import { dfmt, fmt, today } from '../../lib/format';

const DIRECTION_LABEL: Record<KeyMoneyDirection, string> = {
  RECEIVED: 'مقبوض من المستأجر',
  PAID: 'مدفوع للحصول على الموقع',
};

/** Says where each direction lands, because "key money" alone doesn't tell the
 * user that one is income and the other an asset. */
const DIRECTION_EFFECT: Record<KeyMoneyDirection, string> = {
  RECEIVED: 'يُسجَّل نقداً وارداً ضمن إيرادات أخرى — غير مسترد، فهو ليس تأميناً.',
  PAID: 'يُسجَّل أصلاً في حساب «تقبيل وحقوق انتفاع» لا مصروفاً — منفعته تمتد طوال مدة الإيجار.',
};

/**
 * التقبيل — the third kind of money a lease can carry, alongside rent and
 * deposit. Unlike a deposit it is never refunded, and unlike rent it is paid
 * once for the right to the location itself.
 */
export function KeyMoneySection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState<KeyMoneyDirection>('RECEIVED');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      onChanged(await recordKeyMoney(contract.id, { direction, amount: Number(amount), paidAt, note: note.trim() || undefined }));
      setAdding(false);
      setAmount('');
      setNote('');
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر تسجيل التقبيل'));
    } finally {
      setBusy(false);
    }
  }

  // Nothing to show and nothing to add on a cancelled lease — keep the modal
  // from carrying an empty section for the common residential case.
  if (contract.keyMoney.length === 0 && contract.status === 'CANCELLED') return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>التقبيل ({contract.keyMoney.length})</span>
        {contract.status !== 'CANCELLED' && (
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? 'إلغاء' : '+ تسجيل تقبيل'}
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {adding && (
        <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>الاتجاه</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as KeyMoneyDirection)}>
                {(Object.keys(DIRECTION_LABEL) as KeyMoneyDirection[]).map((d) => (
                  <option key={d} value={d}>
                    {DIRECTION_LABEL[d]}
                  </option>
                ))}
              </select>
              <p className="hint">{DIRECTION_EFFECT[direction]}</p>
            </div>
            <div className="field">
              <label>المبلغ</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label>التاريخ</label>
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="field">
              <label>ملاحظة</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: تقبيل موقع تجاري" />
            </div>
          </div>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={submit}>
              حفظ
            </button>
          </div>
        </div>
      )}

      {contract.keyMoney.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>الاتجاه</th>
              <th>المبلغ</th>
              <th>التاريخ</th>
              <th>ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {contract.keyMoney.map((k) => (
              <tr key={k.id}>
                <td>
                  <span className={`badge ${k.direction === 'RECEIVED' ? 'paid' : 'due'}`}>{DIRECTION_LABEL[k.direction]}</span>
                </td>
                <td className="num">{fmt(k.amount)}</td>
                <td className="num">{dfmt(k.paidAt)}</td>
                <td>{k.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
