import { badgeOf } from '../../lib/statusBadge';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClaim, payClaim, waiveClaim, type ClaimKind, type ClaimStatus, type Contract, type DeclaredChargeTaxTreatment, listClaimAttachments, uploadClaimAttachment, claimAttachmentDownloadUrl, deleteClaimAttachment, type ClaimAttachment } from '../../api/contracts';
import { dfmt, fmt, today } from '../../lib/format';
import { num0, round2 } from '../../lib/money';
import { CHARGE_TREATMENT_LABEL, CLAIM_TREATMENT_OPTIONS } from './chargeTaxMeta';
import i18n from '../../i18n';

const KIND_LABEL: Record<ClaimKind, string> = {
  get MAINTENANCE() { return i18n.t('contracts.claims.kind.maintenance'); },
  get UTILITIES() { return i18n.t('contracts.claims.kind.utilities'); },
  get LATE_FEE() { return i18n.t('contracts.claims.kind.late_fee'); },
  get DAMAGE() { return i18n.t('contracts.claims.kind.damage'); },
  get OTHER() { return i18n.t('contracts.claims.kind.other'); },
  get FEE() { return i18n.t('contracts.claims.kind.fee'); },
};

const STATUS_META: Record<ClaimStatus, { label: string; badgeClass: string }> = {
  OPEN: { get label() { return i18n.t('contracts.claims.status.open'); }, badgeClass: 'due' },
  PAID: { get label() { return i18n.t('contracts.claims.status.paid'); }, badgeClass: 'paid' },
  WAIVED: { get label() { return i18n.t('contracts.claims.status.waived'); }, badgeClass: 'draft' },
};

// Service fee claims are raised by fee lines with their installments, never by hand, so they are not offered here.
type ManualClaimKind = Exclude<ClaimKind, 'FEE'>;
const KINDS = (Object.keys(KIND_LABEL) as ClaimKind[]).filter((k): k is ManualClaimKind => k !== 'FEE');

/**
 * Claims on the tenant: repairs they caused, utilities they left, late fees.
 *
 * A claim is owed from the moment it is raised, so the list leads with the
 * outstanding total — that figure is what the landlord chases, and it is also
 * what a held deposit can be applied against.
 */
export function ClaimsSection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [waivingId, setWaivingId] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ClaimAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function openAttachments(claimId: string) {
    if (attachFor === claimId) {
      setAttachFor(null);
      return;
    }
    setAttachFor(claimId);
    setAttachments(await listClaimAttachments(claimId));
  }

  async function handleUpload(file: File) {
    if (!attachFor) return;
    setUploading(true);
    try {
      await uploadClaimAttachment(attachFor, file);
      setAttachments(await listClaimAttachments(attachFor));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('contracts.claims.upload_failed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<ManualClaimKind>('MAINTENANCE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [issuedAt, setIssuedAt] = useState(today());
  // Every claim declares its tax treatment, taxable by default; on-behalf amounts need evidence.
  const [treatment, setTreatment] = useState<DeclaredChargeTaxTreatment>('TAXABLE_SERVICE');
  const [evidence, setEvidence] = useState('');

  // The open claims total comes from the server with the contract; read as a number only to decide what to show.
  const outstanding = num0(contract.claimsOutstanding);

  function fail(e: unknown) {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.claims.action_failed')));
  }

  async function run(action: () => Promise<Contract>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await action());
      after?.();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          {t('contracts.claims.title', { n: contract.claims.length })}{outstanding > 0 && <span className="hint">{t('contracts.claims.outstanding', { amount: fmt(contract.claimsOutstanding ?? 0) })}</span>}
        </span>
        {contract.status !== 'CANCELLED' && (
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? t('contracts.claims.cancel') : t('contracts.claims.add')}
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {adding && (
        <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>{t('contracts.claims.kind_label')}</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as ManualClaimKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('contracts.claims.amount')}</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t('contracts.claims.description')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('contracts.claims.description_placeholder')} />
          </div>
          <div className="field">
            <label>{t('contracts.claims.issued_at')}</label>
            <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="claim-treatment">{t('contracts.claims.treatment')}</label>
            <select id="claim-treatment" value={treatment} onChange={(e) => setTreatment(e.target.value as DeclaredChargeTaxTreatment)}>
              {CLAIM_TREATMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {CHARGE_TREATMENT_LABEL[opt]}
                </option>
              ))}
            </select>
            {treatment === 'TAXABLE_SERVICE' && <p className="hint">{t('contracts.claims.taxable_hint')}</p>}
            {treatment === 'COMPENSATION' && <p className="hint">{t('contracts.claims.compensation_hint')}</p>}
          </div>
          {treatment === 'ON_BEHALF' && (
            <div className="field">
              <label htmlFor="claim-evidence">{t('contracts.claims.evidence')}</label>
              <input id="claim-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder={t('contracts.claims.evidence_placeholder')} />
              <p className="hint">{t('contracts.claims.on_behalf_hint')}</p>
            </div>
          )}
          {/* Says where it lands, because "claim" doesn't tell the user it is
              recognized as income the moment it's raised. */}
          <p className="hint">{t('contracts.claims.recorded_hint')}</p>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button
              className="btn btn-primary"
              disabled={busy || !(Number(amount) > 0) || !description.trim() || (treatment === 'ON_BEHALF' && !evidence.trim())}
              onClick={() =>
                run(
                  () =>
                    createClaim(contract.id, {
                      kind,
                      amount: Number(amount),
                      description: description.trim(),
                      issuedAt,
                      taxTreatment: treatment,
                      ...(treatment === 'ON_BEHALF' ? { onBehalfEvidence: evidence.trim() } : {}),
                    }),
                  () => {
                    setAdding(false);
                    setAmount('');
                    setDescription('');
                    setEvidence('');
                    setTreatment('TAXABLE_SERVICE');
                  },
                )
              }
            >
              {t('contracts.claims.save')}
            </button>
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>{t('contracts.claims.kind_label')}</th>
            <th>{t('contracts.claims.description')}</th>
            <th>{t('contracts.claims.amount')}</th>
            <th>{t('contracts.claims.col_date')}</th>
            <th>{t('contracts.claims.col_status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {contract.claims.length === 0 && (
            <tr>
              <td colSpan={6}>
                <div className="empty-state">{t('contracts.claims.empty')}</div>
              </td>
            </tr>
          )}
          {contract.claims.map((c) => (
            <tr key={c.id}>
              <td>
                {KIND_LABEL[c.kind]}
                <div className="hint">{CHARGE_TREATMENT_LABEL[c.taxTreatment]}</div>
              </td>
              <td>{c.description}</td>
              <td className="num">
                {fmt(round2(num0(c.amount) + num0(c.taxAmount)))}
                {num0(c.taxAmount) > 0 && <div className="hint">{t('contracts.claims.tax_part', { amount: fmt(c.taxAmount) })}</div>}
              </td>
              <td className="num">{dfmt(c.issuedAt)}</td>
              <td>
                <span className={`badge ${badgeOf(STATUS_META, c.status).badgeClass}`}>{badgeOf(STATUS_META, c.status).label}</span>
                {c.status === 'WAIVED' && c.waiveReason && <div className="hint">{c.waiveReason}</div>}
                {c.settledAt && <div className="hint">{dfmt(c.settledAt)}</div>}
              </td>
              <td>
                {c.status === 'OPEN' && (
                  <>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => payClaim(contract.id, c.id, today()))}>
                      {t('contracts.claims.collect')}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setWaivingId(waivingId === c.id ? null : c.id);
                        setWaiveReason('');
                        setError(null);
                      }}
                    >
                      {t('contracts.claims.waive')}
                    </button>
                  </>
                )}
                <button className="btn btn-ghost" onClick={() => openAttachments(c.id)}>
                  {t('contracts.claims.attachments')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {waivingId && (
        <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
          <div className="field">
            <label>{t('contracts.claims.waive_reason')}</label>
            <input value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} placeholder={t('contracts.claims.waive_reason_placeholder')} />
            {/* Written off, not deleted — the ledger shows both that it was
                raised and that it was dropped. */}
            <p className="hint">{t('contracts.claims.waive_hint')}</p>
          </div>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button className="btn btn-ghost" onClick={() => setWaivingId(null)}>
              {t('contracts.claims.back')}
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !waiveReason.trim()}
              onClick={() =>
                run(
                  () => waiveClaim(contract.id, waivingId, { waivedAt: today(), reason: waiveReason.trim() }),
                  () => setWaivingId(null),
                )
              }
            >
              {t('contracts.claims.confirm_waive')}
            </button>
          </div>
        </div>
      )}
      {attachFor && (
        <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b>{t('contracts.claims.attachments_title')}</b>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', marginInlineStart: 'auto' }}>
              {uploading ? t('contracts.claims.uploading') : t('contracts.claims.attach')}
              <input ref={fileRef} type="file" style={{ display: 'none' }} disabled={uploading} onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            </label>
          </div>
          {/* Claim attachments go to the regular store and there is no store for tenant IDs (regulation 2289 art. 28/14), so the limit is stated where the upload happens. */}
          <p className="warn-text" style={{ margin: '8px 0' }}>{t('contracts.claims.id_warning')}</p>
          {attachments.length === 0 && <div className="empty-state">{t('contracts.claims.attachments_empty')}</div>}
          {attachments.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{a.filename}</span>
              <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{t('contracts.claims.size_kb', { n: Math.ceil(a.size / 1024) })}</span>
              <button className="btn btn-ghost btn-sm" onClick={async () => window.open((await claimAttachmentDownloadUrl(a.id)).url, '_blank')}>
                {t('contracts.claims.download')}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    await deleteClaimAttachment(a.id);
                    setAttachments(await listClaimAttachments(attachFor));
                  } catch (e) {
                    const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
                    setError(d?.message ?? t('contracts.claims.delete_failed'));
                  }
                }}
              >
                {t('contracts.claims.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
