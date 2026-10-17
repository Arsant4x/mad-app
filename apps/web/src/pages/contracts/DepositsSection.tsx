import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { usePermissions } from '../../auth/PermissionsContext';
import { fmt, dfmt } from '../../lib/format';
import { num0, round2 } from '../../lib/money';
import i18n from '../../i18n';
import { CHARGE_TREATMENT_LABEL, DEDUCTION_TREATMENT_OPTIONS } from './chargeTaxMeta';

const TYPE_LABEL: Record<DepositType, string> = {
  get RENT() { return i18n.t('contracts.deposits.type.rent'); },
  get FACILITY() { return i18n.t('contracts.deposits.type.facility'); },
};

const HOLDER_LABEL: Record<DepositHolder, string> = {
  get COMPANY() { return i18n.t('contracts.deposits.holder.company'); },
  get EJAR() { return i18n.t('contracts.deposits.holder.ejar'); },
};

const KIND_LABEL: Record<DeductionKind, string> = {
  get UNPAID_RENT() { return i18n.t('contracts.deposits.kind.unpaid_rent'); },
  get DAMAGE() { return i18n.t('contracts.deposits.kind.damage'); },
  get UTILITIES() { return i18n.t('contracts.deposits.kind.utilities'); },
  get CLEANING() { return i18n.t('contracts.deposits.kind.cleaning'); },
  get OTHER() { return i18n.t('contracts.deposits.kind.other'); },
};

const KINDS = Object.keys(KIND_LABEL) as DeductionKind[];

/** The tax treatment for the kinds that ask for one: utilities are taxable by default, "other" has no default. */
type DeductionRow = { kind: DeductionKind; amount: string; reason: string; treatment: DeclaredChargeTaxTreatment | ''; evidence: string };

/** The initial treatment for a kind that asks for one: utilities start taxable, "other" stays empty until chosen. */
const initialTreatment = (kind: DeductionKind): DeclaredChargeTaxTreatment | '' => (kind === 'UTILITIES' ? 'TAXABLE_SERVICE' : '');

/** Does the row still need a choice (or proof of payment on behalf) before it can be sent? */
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
  const { t } = useTranslation();
  const { can } = usePermissions();
  // Receiving a deposit records, settling it reviews.
  const canRecord = can('contracts', 'record');
  const canSettle = can('contracts', 'review');
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

  // The amount held by the company comes from the server with the contract; read as a number only to decide what to show.
  const heldTotal = num0(contract.depositsHeld);

  function fail(e: unknown) {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.deposits.action_failed')));
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
          {t('contracts.deposits.title', { n: contract.deposits.length })}{heldTotal > 0 && <span className="hint">{t('contracts.deposits.held_total', { amount: fmt(contract.depositsHeld ?? 0) })}</span>}
        </span>
        {canRecord && contract.status !== 'CANCELLED' && (
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? t('contracts.deposits.cancel') : t('contracts.deposits.add')}
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {canRecord && adding && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>{t('contracts.deposits.type_label')}</label>
              <select value={type} onChange={(e) => setType(e.target.value as DepositType)}>
                {(Object.keys(TYPE_LABEL) as DepositType[]).map((dt) => (
                  <option key={dt} value={dt}>
                    {TYPE_LABEL[dt]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('contracts.deposits.holder_label')}</label>
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
                  ? t('contracts.deposits.holder_ejar_hint')
                  : t('contracts.deposits.holder_company_hint')}
              </p>
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label>{t('contracts.deposits.amount')}</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('contracts.deposits.date')}</label>
              <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t('contracts.deposits.note')}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('contracts.deposits.note_placeholder')} />
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={submitDeposit}>
              {t('contracts.deposits.save')}
            </button>
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>{t('contracts.deposits.type_label')}</th>
            <th>{t('contracts.deposits.holder_label')}</th>
            <th>{t('contracts.deposits.amount')}</th>
            <th>{t('contracts.deposits.date')}</th>
            <th>{t('contracts.deposits.col_status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {contract.deposits.length === 0 && (
            <tr>
              <td colSpan={6}>
                <div className="empty-state">{t('contracts.deposits.empty')}</div>
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
                  <span className="badge">{t('contracts.deposits.status_held')}</span>
                ) : (
                  <>
                    <span className="badge paid">{t('contracts.deposits.status_settled')}</span>
                    <div className="hint">
                      {t('contracts.deposits.refunded', { amount: fmt(d.refundAmount ?? 0) })}
                      {d.deductions.length > 0 && t('contracts.deposits.deducted_lines', { n: d.deductions.length })}
                    </div>
                    {d.deductions.map((x) => (
                      <div key={x.id} className="hint">
                        {KIND_LABEL[x.kind]}: {fmt(x.amount)} — {x.reason}
                        {x.taxTreatment && t('contracts.deposits.treatment_paren', { label: CHARGE_TREATMENT_LABEL[x.taxTreatment], tax: num0(x.baseTax) > 0 ? t('contracts.deposits.tax_part', { amount: fmt(x.baseTax) }) : '' })}
                      </div>
                    ))}
                  </>
                )}
              </td>
              <td>
                {canSettle && d.status === 'HELD' && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setSettlingId(settlingId === d.id ? null : d.id);
                      setRows([]);
                      setError(null);
                    }}
                  >
                    {t('contracts.deposits.settle')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canSettle &&
        settlingId &&
        (() => {
          const deposit = contract.deposits.find((d) => d.id === settlingId)!;
          const held = Number(deposit.amount);
          const refund = round2(held - deducted);
          const over = deducted > held;

          return (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>
                {t('contracts.deposits.settle_title', { type: TYPE_LABEL[deposit.type], amount: fmt(held) })}
              </div>
              {deposit.holder === 'EJAR' && (
                <p className="hint">
                  {t('contracts.deposits.settle_ejar_hint')}
                </p>
              )}

              <div className="field">
                <label>{t('contracts.deposits.settled_at')}</label>
                <input type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
              </div>

              {rows.map((r, i) => (
                <div className="two-col" key={i}>
                  <div className="field">
                    <label>{t('contracts.deposits.line')}</label>
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
                    <label>{t('contracts.deposits.amount')}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.amount}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('contracts.deposits.reason')}</label>
                    <input
                      value={r.reason}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))}
                      placeholder={t('contracts.deposits.reason_placeholder')}
                    />
                  </div>
                  {r.kind === 'CLEANING' && <p className="hint" style={{ gridColumn: '1 / -1' }}>{t('contracts.deposits.cleaning_hint')}</p>}
                  {DEDUCTION_TREATMENT_OPTIONS[r.kind] && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor={`deduction-treatment-${i}`}>{t('contracts.deposits.treatment')}</label>
                      <select
                        id={`deduction-treatment-${i}`}
                        value={r.treatment}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, treatment: e.target.value as DeclaredChargeTaxTreatment | '' } : x)))}
                      >
                        {r.kind === 'OTHER' && <option value="">{t('contracts.lessor.choose')}</option>}
                        {DEDUCTION_TREATMENT_OPTIONS[r.kind]!.map((opt) => (
                          <option key={opt} value={opt}>
                            {CHARGE_TREATMENT_LABEL[opt]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {r.treatment === 'ON_BEHALF' && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor={`deduction-evidence-${i}`}>{t('contracts.deposits.evidence')}</label>
                      <input
                        id={`deduction-evidence-${i}`}
                        value={r.evidence}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, evidence: e.target.value } : x)))}
                        placeholder={t('contracts.deposits.evidence_placeholder')}
                      />
                    </div>
                  )}
                </div>
              ))}

              <button className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { kind: 'DAMAGE', amount: '', reason: '', treatment: '', evidence: '' }])}>
                {t('contracts.deposits.add_line')}
              </button>

              <p className="hint" style={{ color: over ? 'var(--rose)' : undefined }}>
                {over ? t('contracts.deposits.over', { amount: fmt(deducted) }) : t('contracts.deposits.refund', { amount: fmt(refund) })}
              </p>

              <div className="modal-foot">
                <button className="btn btn-ghost" onClick={() => setSettlingId(null)}>
                  {t('contracts.deposits.cancel')}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || over || rows.some(rowIncomplete)}
                  onClick={() => submitSettlement(deposit)}
                >
                  {t('contracts.deposits.confirm_settle')}
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
