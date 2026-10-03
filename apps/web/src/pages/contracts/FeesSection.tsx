import { useState } from 'react';
import { addContractFee, endContractFee, type Contract } from '../../api/contracts';
import { dfmt, fmt, today } from '../../lib/format';

/**
 * ⚖️ **بنودُ الرسوم فوق الإيجار** (السؤالان ٤٩ و٤١٣ · ق-١٦٠٠، بحكم صاحب المشروع: «بنودٌ على العقد تُفوتر مع القسط»).
 *
 * رسمٌ مسمّى (موقف · نظافة · خدمات) توريدٌ منفصلٌ خاضعٌ ١٥٪ ولو كان الإيجارُ سكنيّاً معفى: كلُّ قسطٍ يحلّ تُطالَب معه رسومُه
 * مطالبةً خاضعةً تظهر في «المطالبات» تُحصَّل أو تُسقَط. والبندُ يُنهى ولا يُحذف — فما طولب عنه يبقى.
 */
export function FeesSection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fees = contract.fees ?? [];

  async function run(action: () => Promise<Contract>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await action());
      after?.();
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إتمام العملية'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>بنود الرسوم ({fees.length})</span>
        {contract.status !== 'CANCELLED' && (
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? 'إلغاء' : '+ بند رسم'}
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {adding && (
        <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label htmlFor="fee-label">اسم الرسم</label>
              <input id="fee-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: موقف سيارة" />
            </div>
            <div className="field">
              <label htmlFor="fee-amount">المبلغ لكل قسط</label>
              <input id="fee-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="fee-from">يُطالَب ابتداءً من</label>
            <input id="fee-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <p className="hint">رسمٌ خاضعٌ للضريبة ١٥٪ فوق مبلغه ولو كان الإيجارُ معفى، ويُطالَب مع كلِّ قسطٍ يحلّ — وما حلّ منذ هذا التاريخ يُطالَب الآن.</p>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button
              className="btn btn-primary"
              disabled={busy || !label.trim() || !(Number(amount) > 0)}
              onClick={() =>
                run(
                  () => addContractFee(contract.id, { label: label.trim(), amount: Number(amount), effectiveFrom }),
                  () => {
                    setAdding(false);
                    setLabel('');
                    setAmount('');
                  },
                )
              }
            >
              حفظ البند
            </button>
          </div>
        </div>
      )}
      {fees.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>الرسم</th>
              <th>لكل قسط</th>
              <th>السريان</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id}>
                <td>{f.label}</td>
                <td className="num">{fmt(f.amount)}</td>
                <td className="num">
                  {dfmt(f.effectiveFrom)}
                  {f.endedAt ? ` — حتى ${dfmt(f.endedAt)}` : ''}
                </td>
                <td>
                  {!f.endedAt && contract.status !== 'CANCELLED' && (
                    <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => endContractFee(contract.id, f.id, { endedAt: today() }))}>
                      إنهاء
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
