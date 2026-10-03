import { useState } from 'react';
import {
  recordDeposit,
  settleDeposit,
  type Contract,
  type ContractDeposit,
  type DeclaredChargeTaxTreatment,
  type DeductionKind,
  type DepositHolder,
  type DepositType,
} from '../../api/contracts';
import { fmt, dfmt } from '../../lib/format';
import { num0, round2 } from '../../lib/money';
import { CHARGE_TREATMENT_LABEL, DEDUCTION_TREATMENT_OPTIONS } from './chargeTaxMeta';

const TYPE_LABEL: Record<DepositType, string> = {
  RENT: 'تأمين إيجار',
  FACILITY: 'تأمين منشأة',
};

const HOLDER_LABEL: Record<DepositHolder, string> = {
  COMPANY: 'لدى الشركة',
  EJAR: 'محجوز لدى إيجار',
};

const KIND_LABEL: Record<DeductionKind, string> = {
  UNPAID_RENT: 'إيجار متأخر',
  DAMAGE: 'أضرار',
  UTILITIES: 'فواتير خدمات',
  CLEANING: 'نظافة',
  OTHER: 'أخرى',
};

const KINDS = Object.keys(KIND_LABEL) as DeductionKind[];

/** ⚖️ والمعاملةُ الضريبية لما يُسأل عنه (السؤال ٤١٤ · ق-١٦٠٠): المرافقُ خاضعةٌ افتراضاً، و«أخرى» بلا افتراض. */
type DeductionRow = { kind: DeductionKind; amount: string; reason: string; treatment: DeclaredChargeTaxTreatment | ''; evidence: string };

/** المعاملةُ الأولى لنوعٍ يُختار له — المرافقُ «خاضعة» افتراضاً، و«أخرى» فارغةٌ حتى تُختار. */
const initialTreatment = (kind: DeductionKind): DeclaredChargeTaxTreatment | '' => (kind === 'UTILITIES' ? 'TAXABLE_SERVICE' : '');

/** يحتاج البندُ اختياراً لم يقع (أو إثباتَ نيابة) قبل الإرسال؟ */
const rowIncomplete = (r: DeductionRow) =>
  Number(r.amount) > 0 && (!r.reason.trim() || (DEDUCTION_TREATMENT_OPTIONS[r.kind] !== null && !r.treatment) || (r.treatment === 'ON_BEHALF' && !r.evidence.trim()));

/**
 * Deposits on a contract, and settling them.
 *
 * The holder is the field that matters most here and it is shown on every row:
 * a deposit blocked on Ejar never entered the company's books, so "settling" it
 * only records what the platform released — the rest goes from Ejar straight to
 * the tenant. Showing both kinds in one list without the distinction would
 * misrepresent what the company actually holds.
 */
export function DepositsSection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const [adding, setAdding] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [type, setType] = useState<DepositType>('RENT');
  const [holder, setHolder] = useState<DepositHolder>('COMPANY');
  const [amount, setAmount] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const [settledAt, setSettledAt] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<DeductionRow[]>([]);

  // المحجوزُ لدى المنشأة يصل من الخادم مع العقد (`ق-١٢٤٣`) — يُقرأ رقماً لقرار الإظهار وحدَه.
  const heldTotal = num0(contract.depositsHeld);

  function fail(e: unknown) {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إتمام العملية'));
  }

  async function submitDeposit() {
    setError(null);
    setBusy(true);
    try {
      const updated = await recordDeposit(contract.id, {
        type,
        holder,
        amount: Number(amount),
        receivedAt,
        note: note.trim() || undefined,
      });
      onChanged(updated);
      setAdding(false);
      setAmount('');
      setNote('');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function submitSettlement(deposit: ContractDeposit) {
    setError(null);
    setBusy(true);
    try {
      const updated = await settleDeposit(contract.id, deposit.id, {
        settledAt,
        deductions: rows
          // A blank row is a user who opened one and changed their mind, not a
          // zero deduction — dropped rather than rejected.
          .filter((r) => Number(r.amount) > 0)
          .map((r) => ({
            kind: r.kind,
            amount: Number(r.amount),
            reason: r.reason.trim(),
            ...(DEDUCTION_TREATMENT_OPTIONS[r.kind] && r.treatment ? { taxTreatment: r.treatment } : {}),
            ...(r.treatment === 'ON_BEHALF' ? { onBehalfEvidence: r.evidence.trim() } : {}),
          })),
      });
      onChanged(updated);
      setSettlingId(null);
      setRows([]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const deducted = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          التأمينات ({contract.deposits.length}){heldTotal > 0 && <span className="hint"> — محتجز لدى الشركة: {fmt(contract.depositsHeld ?? 0)}</span>}
        </span>
        {contract.status !== 'CANCELLED' && (
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? 'إلغاء' : '+ تسجيل تأمين'}
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {adding && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>النوع</label>
              <select value={type} onChange={(e) => setType(e.target.value as DepositType)}>
                {(Object.keys(TYPE_LABEL) as DepositType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>الجهة الحائزة</label>
              <select value={holder} onChange={(e) => setHolder(e.target.value as DepositHolder)}>
                {(Object.keys(HOLDER_LABEL) as DepositHolder[]).map((h) => (
                  <option key={h} value={h}>
                    {HOLDER_LABEL[h]}
                  </option>
                ))}
              </select>
              {/* The single most consequential field on this form. */}
              <p className="hint">
                {holder === 'EJAR'
                  ? 'المبلغ محجوز لدى منصة إيجار ولم تستلمه الشركة — لن يُرحَّل للنقدية ولا للالتزامات.'
                  : 'المبلغ استلمته الشركة — يُرحَّل مديناً للنقدية ودائناً لحساب تأمينات المستأجرين.'}
              </p>
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label>المبلغ</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label>التاريخ</label>
              <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>ملاحظة</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="رقم سند القبض أو مرجع إيجار" />
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={submitDeposit}>
              حفظ
            </button>
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>النوع</th>
            <th>الجهة الحائزة</th>
            <th>المبلغ</th>
            <th>التاريخ</th>
            <th>الحالة</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {contract.deposits.length === 0 && (
            <tr>
              <td colSpan={6}>
                <div className="empty-state">لا توجد تأمينات مسجَّلة</div>
              </td>
            </tr>
          )}
          {contract.deposits.map((d) => (
            <tr key={d.id}>
              <td>{TYPE_LABEL[d.type]}</td>
              <td>
                <span className={`badge ${d.holder === 'EJAR' ? 'due' : ''}`}>{HOLDER_LABEL[d.holder]}</span>
              </td>
              <td className="num">{fmt(d.amount)}</td>
              <td className="num">{dfmt(d.receivedAt)}</td>
              <td>
                {d.status === 'HELD' ? (
                  <span className="badge">محتجز</span>
                ) : (
                  <>
                    <span className="badge paid">مسوّى</span>
                    <div className="hint">
                      رُدّ {fmt(d.refundAmount ?? 0)}
                      {d.deductions.length > 0 && ` — خُصم ${d.deductions.length} بند`}
                    </div>
                    {d.deductions.map((x) => (
                      <div key={x.id} className="hint">
                        {KIND_LABEL[x.kind]}: {fmt(x.amount)} — {x.reason}
                        {x.taxTreatment && ` (${CHARGE_TREATMENT_LABEL[x.taxTreatment]}${num0(x.baseTax) > 0 ? `، منها ضريبة ${fmt(x.baseTax)}` : ''})`}
                      </div>
                    ))}
                  </>
                )}
              </td>
              <td>
                {d.status === 'HELD' && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setSettlingId(settlingId === d.id ? null : d.id);
                      setRows([]);
                      setError(null);
                    }}
                  >
                    تسوية
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {settlingId &&
        (() => {
          const deposit = contract.deposits.find((d) => d.id === settlingId)!;
          const held = Number(deposit.amount);
          const refund = round2(held - deducted);
          const over = deducted > held;

          return (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>
                تسوية {TYPE_LABEL[deposit.type]} — {fmt(held)}
              </div>
              {deposit.holder === 'EJAR' && (
                <p className="hint">
                  هذا التأمين محجوز لدى منصة إيجار: ما يُخصَم لصالح الشركة فقط هو ما يُرحَّل، والمتبقي يُعاد للمستأجر من المنصة مباشرة.
                </p>
              )}

              <div className="field">
                <label>تاريخ التسوية</label>
                <input type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
              </div>

              {rows.map((r, i) => (
                <div className="two-col" key={i}>
                  <div className="field">
                    <label>البند</label>
                    <select
                      value={r.kind}
                      onChange={(e) => {
                        const kind = e.target.value as DeductionKind;
                        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, kind, treatment: initialTreatment(kind), evidence: '' } : x)));
                      }}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>المبلغ</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.amount}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>السبب</label>
                    <input
                      value={r.reason}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))}
                      placeholder="يظهر للمستأجر — اذكر السبب بوضوح"
                    />
                  </div>
                  {r.kind === 'CLEANING' && <p className="hint" style={{ gridColumn: '1 / -1' }}>النظافةُ خدمةٌ خاضعة: الضريبةُ ١٥٪ من المبلغ المخصوم نفسِه، وتدخل الإقرار.</p>}
                  {DEDUCTION_TREATMENT_OPTIONS[r.kind] && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor={`deduction-treatment-${i}`}>المعاملة الضريبية</label>
                      <select
                        id={`deduction-treatment-${i}`}
                        value={r.treatment}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, treatment: e.target.value as DeclaredChargeTaxTreatment | '' } : x)))}
                      >
                        {r.kind === 'OTHER' && <option value="">— اختر —</option>}
                        {DEDUCTION_TREATMENT_OPTIONS[r.kind]!.map((t) => (
                          <option key={t} value={t}>
                            {CHARGE_TREATMENT_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {r.treatment === 'ON_BEHALF' && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor={`deduction-evidence-${i}`}>ما يثبت النيابة</label>
                      <input
                        id={`deduction-evidence-${i}`}
                        value={r.evidence}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, evidence: e.target.value } : x)))}
                        placeholder="مثال: عدّادُ الماء باسم المستأجر"
                      />
                    </div>
                  )}
                </div>
              ))}

              <button className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { kind: 'DAMAGE', amount: '', reason: '', treatment: '', evidence: '' }])}>
                + بند خصم
              </button>

              <p className="hint" style={{ color: over ? 'var(--rose)' : undefined }}>
                {over ? `الخصومات (${fmt(deducted)}) تتجاوز مبلغ التأمين` : `المبلغ المُعاد للمستأجر: ${fmt(refund)}`}
              </p>

              <div className="modal-foot">
                <button className="btn btn-ghost" onClick={() => setSettlingId(null)}>
                  إلغاء
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || over || rows.some(rowIncomplete)}
                  onClick={() => submitSettlement(deposit)}
                >
                  تأكيد التسوية
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
