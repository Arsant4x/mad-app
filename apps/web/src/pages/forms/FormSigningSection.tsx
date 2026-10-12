import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  contractFormDeviceLink,
  contractFormEvents,
  contractFormObjectionPhoto,
  contractFormSignatureImage,
  paperSignContractForm,
  requestContractFormSubstitute,
  resendContractFormLink,
  reviseContractForm,
  sendContractForm,
  type FormDeviceLink,
  type FormInstance,
  type FormSigningEvent,
  type PaperAuthorityFields,
  type RepresentativeFields,
} from '../../api/forms';
import { SignaturePad } from '../../components/SignaturePad';
import { apiErrorMessage } from '../../lib/apiError';
import { AUTHORITY_TYPE, EVENT_LABEL, SIGNATURE_CHANNEL, SIGNATURE_LEVEL, SIGNER_ROLE } from './formStatus';
import { dateTimeText, type FormContractRef } from './formItems';

/** Opens an image or paper fetched with the session in a new window (sensitive storage has no signed links). */
async function openBlob(load: () => Promise<Blob>) {
  const blob = await load();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * The signing flow in a form record: staff sign and send the link to the
 * tenant's mobile (or to a legal entity's representative with their authority),
 * resend the link, open a link on their own device with the party present, sign
 * on paper as witness, and answer an objection with a revised copy. Sealing is
 * never requested by hand: it happens when the party signs. Sending, paper and
 * staff device are "review"; the revised copy is "record".
 */
export function FormSigningSection({
  contract,
  record,
  canRecord,
  canReview,
  beforeSend,
  onChanged,
  onRevised,
}: {
  contract: FormContractRef;
  record: FormInstance;
  canRecord: boolean;
  canReview: boolean;
  /** Saves unsaved values before signing so only what is on screen is signed; returns false when that fails. */
  beforeSend: () => Promise<boolean>;
  onChanged: (updated: FormInstance) => void;
  onRevised: (created: FormInstance) => void;
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<'send' | 'paper' | 'substitute' | null>(null);
  const [events, setEvents] = useState<FormSigningEvent[] | null>(null);
  const [device, setDevice] = useState<FormDeviceLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const status = record.status;
  const sent = status !== 'DRAFT';

  useEffect(() => {
    setEvents(null);
  }, [record.id, record.status]);

  async function run(fn: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(apiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  const loadEvents = () => run(async () => setEvents(await contractFormEvents(contract.id, record.id)), t('forms.signing.events_failed'));
  const resend = () =>
    run(async () => {
      const r = await resendContractFormLink(contract.id, record.id);
      onChanged(r.form);
      setNotice(r.delivery === 'SENT' ? t('forms.signing.resend_sent') : t('forms.signing.resend_not_sent'));
    }, t('forms.signing.resend_failed'));
  const deviceLink = () =>
    run(async () => {
      const link = await contractFormDeviceLink(contract.id, record.id);
      setDevice(link);
      window.open(link.url, '_blank', 'noopener');
    }, t('forms.signing.device_failed'));
  const revise = () => run(async () => onRevised(await reviseContractForm(contract.id, record.id)), t('forms.signing.revise_failed'));

  return (
    <div className="card" style={{ marginTop: 10 }} data-testid="form-signing-section">
      <div className="card-title">{t('forms.signing.title')}</div>

      {sent && record.signDeadline && (
        <p style={{ fontSize: 12.5 }}>
          {t('forms.signing.sent')} <span className="num">{record.sentAt ? dateTimeText(record.sentAt) : ''}</span> · {t('forms.signing.expires')}{' '}
          <span className="num">{dateTimeText(record.signDeadline)}</span> · {t('forms.signing.revision')} <span className="num">{record.revisionNo}</span>
          {record.nafathRequired && t('forms.signing.nafath_required')}
        </p>
      )}
      {!sent && <p className="hint">{t('forms.signing.draft_hint')}</p>}

      {record.signatures.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t('forms.signing.col_signer')}</th>
              <th>{t('forms.signing.col_name')}</th>
              <th>{t('forms.signing.col_level')}</th>
              <th>{t('forms.signing.col_channel')}</th>
              <th>{t('forms.signing.col_time')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {record.signatures.map((s) => (
              <tr key={s.id} data-testid="form-signature-row">
                <td>{SIGNER_ROLE[s.role] ?? s.role}</td>
                <td>
                  {s.signerName}
                  {s.mobileMasked && <div className="hint num">{s.mobileMasked}</div>}
                  {s.authorityType && (
                    <div className="hint">
                      {AUTHORITY_TYPE[s.authorityType] ?? s.authorityType} <span className="num">{s.authorityRef}</span> ·{' '}
                      {s.authorityVerification === 'VERIFIED' ? t('forms.signing.authority_verified') : t('forms.signing.authority_unverified')}
                    </div>
                  )}
                  {s.witnessUserName && <div className="hint">{t('forms.signing.witnessed_by', { name: s.witnessUserName })}</div>}
                </td>
                <td>{SIGNATURE_LEVEL[s.level] ?? s.level}</td>
                <td>{SIGNATURE_CHANNEL[s.channel] ?? s.channel}</td>
                <td className="num">{dateTimeText(s.signedAt)}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => run(() => openBlob(() => contractFormSignatureImage(contract.id, record.id, s.id)), t('forms.signing.open_signature_failed'))}
                  >
                    {t('forms.signing.view')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {record.objection && (
        <div className="error-text" style={{ marginTop: 8 }} data-testid="form-objection">
          {t('forms.signing.objection_by', { name: record.objection.byName })}
          {record.objection.mobileMasked ? ` (${record.objection.mobileMasked})` : ''} {t('forms.signing.objection_at')}{' '}
          <span className="num">{dateTimeText(record.objection.objectedAt)}</span>:{' '}
          {record.objection.note}
          {record.objection.hasPhoto && (
            <button className="btn btn-ghost btn-sm" onClick={() => run(() => openBlob(() => contractFormObjectionPhoto(contract.id, record.id)), t('forms.signing.open_photo_failed'))}>
              {t('forms.signing.objection_photo')}
            </button>
          )}
        </div>
      )}
      {status === 'EXPIRED' && <p className="error-text">{t('forms.signing.expired_note')}</p>}
      {status === 'DISPUTED' && <p className="error-text">{t('forms.signing.disputed_note')}</p>}

      {device && (
        <p className="hint" data-testid="form-device-link">
          {t('forms.signing.device_opened')} <span className="num">{dateTimeText(device.expiresAt)}</span>
          {t('forms.signing.device_then')}
        </p>
      )}
      {notice && <p className="hint">{notice}</p>}
      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {status === 'DRAFT' && canReview && (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => setDialog('send')}>
              {t('forms.signing.sign_and_send')}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setDialog('paper')}>
              {t('forms.signing.paper_sign')}
            </button>
          </>
        )}
        {status === 'AWAITING_SIGNATURE' && canReview && (
          <>
            <button className="btn btn-ghost" disabled={busy} onClick={resend}>
              {t('forms.signing.resend')}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={deviceLink}>
              {t('forms.signing.sign_on_device')}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setDialog('paper')}>
              {t('forms.signing.paper_sign')}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setDialog('substitute')}>
              {t('forms.signing.substitute')}
            </button>
          </>
        )}
        {status === 'OBJECTED' && canRecord && (
          <button className="btn btn-primary" disabled={busy} onClick={revise}>
            {t('forms.signing.revise')}
          </button>
        )}
        {sent && (
          <button className="btn btn-ghost" disabled={busy} onClick={loadEvents}>
            {t('forms.signing.events')}
          </button>
        )}
      </div>

      {events && (
        <ul style={{ fontSize: 12.5, marginTop: 8 }} data-testid="form-events">
          {events.length === 0 && <li>{t('forms.signing.no_events')}</li>}
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="num">{dateTimeText(e.at)}</span> · {t('forms.signing.revision')} <span className="num">{e.revisionNo}</span> · {EVENT_LABEL[e.kind] ?? e.kind} · {e.actor}
              {e.recipientMasked && <span className="num"> · {e.recipientMasked}</span>}
              {e.note && ` · ${e.note}`}
            </li>
          ))}
        </ul>
      )}

      {dialog === 'send' && (
        <SendDialog
          busy={busy}
          onCancel={() => setDialog(null)}
          onSubmit={(drawing, rep, doc) =>
            run(async () => {
              if (!(await beforeSend())) return;
              const r = await sendContractForm(contract.id, record.id, drawing, rep, doc);
              setDialog(null);
              onChanged(r.form);
              setNotice(r.delivery === 'SENT' ? t('forms.signing.send_sent') : t('forms.signing.send_not_sent'));
            }, t('forms.signing.send_failed'))
          }
        />
      )}
      {dialog === 'substitute' && (
        <SubstituteDialog
          busy={busy}
          nafathRequired={record.nafathRequired}
          onCancel={() => setDialog(null)}
          onSubmit={(body) =>
            run(async () => {
              const r = await requestContractFormSubstitute(contract.id, record.id, body);
              setDialog(null);
              onChanged(r.form);
              setNotice(r.delivery === 'SENT' ? t('forms.signing.substitute_sent') : t('forms.signing.substitute_not_sent'));
            }, t('forms.signing.substitute_failed'))
          }
        />
      )}
      {dialog === 'paper' && (
        <PaperDialog
          needsDrawing={status === 'DRAFT'}
          busy={busy}
          onCancel={() => setDialog(null)}
          onSubmit={(paper, drawing, signerName, authority, doc, designatedSigned) =>
            run(async () => {
              if (status === 'DRAFT' && !(await beforeSend())) return;
              const r = designatedSigned
                ? await paperSignContractForm(contract.id, record.id, paper, drawing, '', null, null, true)
                : authority
                  ? await paperSignContractForm(contract.id, record.id, paper, drawing, signerName, authority, doc)
                  : await paperSignContractForm(contract.id, record.id, paper, drawing, signerName);
              setDialog(null);
              onChanged(r.form);
              setNotice(
                r.finalCopy === 'SENT'
                  ? t('forms.signing.paper_final_sent')
                  : r.finalCopy === 'NONE'
                    ? t('forms.signing.paper_final_none')
                    : t('forms.signing.paper_final_failed'),
              );
            }, t('forms.signing.paper_failed'))
          }
        />
      )}
    </div>
  );
}

/** Staff signature then sending, with representative fields when the tenant is a legal entity. */
function SendDialog({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (drawing: Blob, rep: RepresentativeFields | null, doc: File | null) => void;
}) {
  const { t } = useTranslation();
  const [drawing, setDrawing] = useState<Blob | null>(null);
  const [legal, setLegal] = useState(false);
  const [rep, setRep] = useState<RepresentativeFields>({ name: '', mobile: '', authorityType: 'CR_MANAGER', authorityRef: '', nationalId: '' });
  const [doc, setDoc] = useState<File | null>(null);
  const repReady = !legal || (rep.name.trim() && rep.mobile.trim() && rep.authorityRef.trim());
  const refLabel = rep.authorityType === 'CR_MANAGER' ? t('forms.signing.cr_number') : t('forms.signing.poa_number');
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }} role="dialog" aria-label={t('forms.signing.sign_and_send')}>
        <div className="modal-head">
          <div className="modal-title">{t('forms.signing.send_title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <p className="hint">{t('forms.signing.send_hint')}</p>
        <SignaturePad onChange={setDrawing} label={t('forms.signing.staff_signature')} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> {t('forms.signing.legal_entity_signs')}
        </label>
        {legal && (
          <div className="two-col">
            <div className="field">
              <label>{t('forms.signing.rep_name')}</label>
              <input aria-label={t('forms.signing.rep_name')} value={rep.name} onChange={(e) => setRep({ ...rep, name: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('forms.signing.rep_mobile')}</label>
              <input aria-label={t('forms.signing.rep_mobile')} className="num" inputMode="tel" value={rep.mobile} onChange={(e) => setRep({ ...rep, mobile: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('forms.signing.capacity')}</label>
              <select value={rep.authorityType} onChange={(e) => setRep({ ...rep, authorityType: e.target.value as RepresentativeFields['authorityType'] })}>
                <option value="CR_MANAGER">{AUTHORITY_TYPE.CR_MANAGER}</option>
                <option value="NAJIZ_POA">{AUTHORITY_TYPE.NAJIZ_POA}</option>
              </select>
            </div>
            <div className="field">
              <label>{refLabel}</label>
              <input aria-label={refLabel} className="num" value={rep.authorityRef} onChange={(e) => setRep({ ...rep, authorityRef: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('forms.signing.rep_national_id_label')}</label>
              <input aria-label={t('forms.signing.rep_national_id')} className="num" value={rep.nationalId ?? ''} onChange={(e) => setRep({ ...rep, nationalId: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('forms.signing.authority_doc_label')}</label>
              <input aria-label={t('forms.signing.authority_doc')} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        )}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('forms.common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy || !drawing || !repReady} onClick={() => drawing && onSubmit(drawing, legal ? rep : null, legal ? doc : null)}>
            {t('forms.signing.sign_and_send')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Request for a substitute recipient: staff enter the substitute's name and
 * mobile, and the tenant approves from their own mobile with their code; the code
 * never passes through staff.
 */
function SubstituteDialog({
  busy,
  nafathRequired,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  nafathRequired: boolean;
  onCancel: () => void;
  onSubmit: (body: { name: string; mobile: string; nationalId?: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  // The substitute's national id only when the form requires Nafath: they enter with the code, then Nafath with that id.
  const [nationalId, setNationalId] = useState('');
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }} role="dialog" aria-label={t('forms.signing.substitute')}>
        <div className="modal-head">
          <div className="modal-title">{t('forms.signing.substitute_title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <p className="hint">{t('forms.signing.substitute_hint')}</p>
        <div className="field">
          <label>{t('forms.signing.substitute_name')}</label>
          <input aria-label={t('forms.signing.substitute_name')} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('forms.signing.substitute_mobile')}</label>
          <input aria-label={t('forms.signing.substitute_mobile')} className="num" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </div>
        {nafathRequired && (
          <div className="field">
            <label>{t('forms.signing.substitute_national_id_label')}</label>
            <input aria-label={t('forms.signing.substitute_national_id')} className="num" inputMode="numeric" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>
        )}
        <p className="hint">{t('forms.signing.substitute_consent', { nafath: nafathRequired ? t('forms.signing.substitute_consent_nafath') : '' })}</p>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('forms.common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !name.trim() || !mobile.trim() || (nafathRequired && !nationalId.trim())}
            onClick={() => onSubmit(nafathRequired ? { name: name.trim(), mobile: mobile.trim(), nationalId: nationalId.trim() } : { name: name.trim(), mobile: mobile.trim() })}
          >
            {t('forms.signing.substitute_submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Paper signing: a photo of the signed paper witnessed by staff, plus the staff
 * drawing when staff have not signed yet. A legal entity signs through its
 * representative, and the signer is chosen explicitly, never inferred: the
 * representative designated at sending, or another signer by name, authority
 * type and number.
 */
function PaperDialog({
  needsDrawing,
  busy,
  onCancel,
  onSubmit,
}: {
  needsDrawing: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (paper: File, drawing: Blob | null, signerName: string, authority: PaperAuthorityFields | null, doc: File | null, designatedSigned: boolean) => void;
}) {
  const { t } = useTranslation();
  const [paper, setPaper] = useState<File | null>(null);
  const [drawing, setDrawing] = useState<Blob | null>(null);
  const [signerName, setSignerName] = useState('');
  const [legal, setLegal] = useState(false);
  // Who signed for the company: no preset, staff choose.
  const [signer, setSigner] = useState<'designated' | 'other' | null>(null);
  const [authority, setAuthority] = useState<PaperAuthorityFields>({ authorityType: 'CR_MANAGER', authorityRef: '' });
  const [doc, setDoc] = useState<File | null>(null);
  const repReady = !legal || signer === 'designated' || (signer === 'other' && signerName.trim() && authority.authorityRef.trim());
  const otherSigner = legal && signer === 'other';
  const refLabel = authority.authorityType === 'CR_MANAGER' ? t('forms.signing.cr_number') : t('forms.signing.poa_number');
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }} role="dialog" aria-label={t('forms.signing.paper_sign')}>
        <div className="modal-head">
          <div className="modal-title">{t('forms.signing.paper_title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <p className="hint">{t('forms.signing.paper_hint')}</p>
        <div className="field">
          <label>{t('forms.signing.paper_photo')}</label>
          <input type="file" aria-label={t('forms.signing.paper_photo')} accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setPaper(e.target.files?.[0] ?? null)} />
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> {t('forms.signing.legal_entity_signed')}
        </label>
        {legal && (
          <div role="radiogroup" aria-label={t('forms.signing.who_signed')} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" name="paper-signer" checked={signer === 'designated'} onChange={() => setSigner('designated')} /> {t('forms.signing.designated_signed')}
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" name="paper-signer" checked={signer === 'other'} onChange={() => setSigner('other')} /> {t('forms.signing.other_signed')}
            </label>
          </div>
        )}
        {(!legal || otherSigner) && (
          <div className="field">
            <label>{legal ? t('forms.signing.signer_for_entity') : t('forms.signing.signer_by_hand_label')}</label>
            <input aria-label={t('forms.signing.signer_by_hand')} value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </div>
        )}
        {otherSigner && (
          <div className="two-col">
            <div className="field">
              <label>{t('forms.signing.capacity')}</label>
              <select
                aria-label={t('forms.signing.signer_capacity')}
                value={authority.authorityType}
                onChange={(e) => setAuthority({ ...authority, authorityType: e.target.value as PaperAuthorityFields['authorityType'] })}
              >
                <option value="CR_MANAGER">{AUTHORITY_TYPE.CR_MANAGER}</option>
                <option value="NAJIZ_POA">{AUTHORITY_TYPE.NAJIZ_POA}</option>
              </select>
            </div>
            <div className="field">
              <label>{refLabel}</label>
              <input aria-label={refLabel} className="num" value={authority.authorityRef} onChange={(e) => setAuthority({ ...authority, authorityRef: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('forms.signing.authority_doc_label')}</label>
              <input aria-label={t('forms.signing.authority_doc')} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        )}
        {needsDrawing && <SignaturePad onChange={setDrawing} label={t('forms.signing.staff_signature')} />}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('forms.common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !paper || (needsDrawing && !drawing) || !repReady}
            onClick={() =>
              paper && onSubmit(paper, drawing, legal && signer === 'designated' ? '' : signerName, otherSigner ? authority : null, otherSigner ? doc : null, legal && signer === 'designated')
            }
          >
            {t('forms.signing.upload_and_seal')}
          </button>
        </div>
      </div>
    </div>
  );
}
