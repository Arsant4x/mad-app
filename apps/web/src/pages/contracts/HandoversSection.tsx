import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createHandover, deleteHandover, signHandover, updateHandover, type Contract, type ContractHandover, type HandoverItemInput, type HandoverType, type ItemCondition, listHandoverPhotos, uploadHandoverPhoto, openHandoverPhoto, deleteHandoverPhoto, type HandoverPhoto } from '../../api/contracts';
import { dfmt, today } from '../../lib/format';
import i18n from '../../i18n';
import { formatDateTime } from '../../i18n/format';

const TYPE_LABEL: Record<HandoverType, string> = {
  get DELIVERY() { return i18n.t('contracts.handovers.type.delivery'); },
  get RECEIPT() { return i18n.t('contracts.handovers.type.receipt'); },
};

const CONDITION_LABEL: Record<ItemCondition, string> = {
  get GOOD() { return i18n.t('contracts.handovers.condition.good'); },
  get FAIR() { return i18n.t('contracts.handovers.condition.fair'); },
  get DAMAGED() { return i18n.t('contracts.handovers.condition.damaged'); },
  get MISSING() { return i18n.t('contracts.handovers.condition.missing'); },
};

const CONDITION_BADGE: Record<ItemCondition, string> = {
  GOOD: 'paid',
  FAIR: 'due',
  DAMAGED: 'overdue',
  MISSING: 'overdue',
};

const CONDITIONS = Object.keys(CONDITION_LABEL) as ItemCondition[];

/** Rooms and fittings a Saudi residential handover almost always covers —
 * offered as a starting point so the form isn't built from nothing each time.
 * Translation keys; the chosen text becomes the item label. */
const SUGGESTED_ITEMS = [
  'contracts.handovers.suggested.kitchen',
  'contracts.handovers.suggested.bathrooms',
  'contracts.handovers.suggested.air_conditioners',
  'contracts.handovers.suggested.doors_windows',
  'contracts.handovers.suggested.paint',
  'contracts.handovers.suggested.meters',
];

/**
 * The condition-of-unit form, at handover and at return.
 *
 * A signed form shows no edit controls at all — the server refuses the change
 * anyway, and offering a button that always fails would suggest the record is
 * negotiable when its whole purpose is that it isn't.
 */
export function HandoversSection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState('');
  // The photo count is read from the server when signing opens (photos may be
  // uploaded after the contract loaded) and shown with how long they are kept.
  // No acknowledgement from the employee: the contract clause covers handover,
  // return and an empty unit.
  const [signPhotoCount, setSignPhotoCount] = useState(0);
  const [photosFor, setPhotosFor] = useState<string | null>(null);
  const [photos, setPhotos] = useState<HandoverPhoto[]>([]);
  const [photoItemId, setPhotoItemId] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);

  async function togglePhotos(handoverId: string) {
    if (photosFor === handoverId) {
      setPhotosFor(null);
      return;
    }
    setPhotosFor(handoverId);
    setPhotoItemId('');
    setPhotos(await listHandoverPhotos(handoverId));
  }

  async function toggleSigning(h: ContractHandover) {
    if (signingId === h.id) {
      setSigningId(null);
      return;
    }
    setSignPhotoCount(h.photos?.length ?? 0);
    setSigningId(h.id);
    setSignPhotoCount((await listHandoverPhotos(h.id)).length);
  }

  async function handlePhotoUpload(file: File) {
    if (!photosFor) return;
    setPhotoUploading(true);
    try {
      await uploadHandoverPhoto(photosFor, file, { itemId: photoItemId || undefined });
      setPhotos(await listHandoverPhotos(photosFor));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('contracts.handovers.photo_upload_failed'));
    } finally {
      setPhotoUploading(false);
      if (photoFileRef.current) photoFileRef.current.value = '';
    }
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<HandoverType>('DELIVERY');
  const [date, setDate] = useState(today());
  const [electricityMeter, setElectricityMeter] = useState('');
  const [waterMeter, setWaterMeter] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<HandoverItemInput[]>([]);

  function resetForm() {
    setDate(today());
    setElectricityMeter('');
    setWaterMeter('');
    setNotes('');
    setItems([]);
  }

  function loadForEdit(h: ContractHandover) {
    setEditingId(h.id);
    setAdding(false);
    setType(h.type);
    setDate(h.date.slice(0, 10));
    setElectricityMeter(h.electricityMeter ?? '');
    setWaterMeter(h.waterMeter ?? '');
    setNotes(h.notes ?? '');
    setItems(h.items.map((i) => ({ label: i.label, condition: i.condition, note: i.note ?? undefined })));
  }

  async function run(action: () => Promise<Contract>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await action());
      after?.();
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.handovers.action_failed')));
    } finally {
      setBusy(false);
    }
  }

  const editing = adding || editingId !== null;
  const payload = {
    date,
    electricityMeter: electricityMeter.trim(),
    waterMeter: waterMeter.trim(),
    notes: notes.trim(),
    items: items.filter((i) => i.label.trim()),
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{t('contracts.handovers.title', { n: contract.handovers.length })}</span>
        {contract.status !== 'CANCELLED' && !editing && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              resetForm();
              setAdding(true);
            }}
          >
            {t('contracts.handovers.new')}
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {editing && (
        <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>{t('contracts.handovers.type_label')}</label>
              <select value={type} onChange={(e) => setType(e.target.value as HandoverType)} disabled={editingId !== null}>
                {(Object.keys(TYPE_LABEL) as HandoverType[]).map((ht) => (
                  <option key={ht} value={ht}>
                    {TYPE_LABEL[ht]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('contracts.handovers.date')}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label>{t('contracts.handovers.electricity_meter')}</label>
              <input className="num" value={electricityMeter} onChange={(e) => setElectricityMeter(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('contracts.handovers.water_meter')}</label>
              <input className="num" value={waterMeter} onChange={(e) => setWaterMeter(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>{t('contracts.handovers.items')}</label>
            {items.map((it, i) => (
              <div className="two-col" key={i} style={{ marginBottom: 4 }}>
                <input
                  value={it.label}
                  onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder={t('contracts.handovers.item')}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={it.condition}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, condition: e.target.value as ItemCondition } : x)))}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {CONDITION_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <button className="menu-btn" title={t('contracts.handovers.remove_item')} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
                <input
                  style={{ gridColumn: '1 / -1' }}
                  value={it.note ?? ''}
                  onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                  placeholder={t('contracts.handovers.note_optional')}
                />
              </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <button className="btn btn-ghost" onClick={() => setItems((xs) => [...xs, { label: '', condition: 'GOOD' }])}>
                {t('contracts.handovers.add_item')}
              </button>
              {SUGGESTED_ITEMS.map((k) => t(k)).filter((s) => !items.some((i) => i.label === s)).map((s) => (
                <button key={s} className="chip" onClick={() => setItems((xs) => [...xs, { label: s, condition: 'GOOD' }])}>
                  + {s}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{t('contracts.handovers.notes')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setAdding(false);
                setEditingId(null);
              }}
            >
              {t('contracts.handovers.back')}
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => (editingId ? updateHandover(contract.id, editingId, payload) : createHandover(contract.id, { type, ...payload })),
                  () => {
                    setAdding(false);
                    setEditingId(null);
                  },
                )
              }
            >
              {t('contracts.handovers.save_draft')}
            </button>
          </div>
        </div>
      )}

      {contract.handovers.length === 0 && !editing && <div className="empty-state">{t('contracts.handovers.empty')}</div>}

      {contract.handovers.map((h) => (
        <div className="card" key={h.id} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <strong style={{ fontSize: 12.5 }}>{TYPE_LABEL[h.type]}</strong>{' '}
              <span className={`badge ${h.status === 'SIGNED' ? 'paid' : 'draft'}`}>{h.status === 'SIGNED' ? t('contracts.handovers.status_signed') : t('contracts.handovers.status_draft')}</span>
              <div className="hint">
                {dfmt(h.date)}
                {h.electricityMeter && t('contracts.handovers.electricity_reading', { value: h.electricityMeter })}
                {h.waterMeter && t('contracts.handovers.water_reading', { value: h.waterMeter })}
              </div>
              {h.status === 'SIGNED' && (
                // The stamp is the evidence — shown to the second, and always
                // beside who signed.
                <div className="hint">
                  {t('contracts.handovers.signed_by', { name: h.signedBy, date: formatDateTime(h.signedAt!) })}{' '}
                  <button className="btn btn-ghost btn-sm" onClick={() => togglePhotos(h.id)}>{t('contracts.handovers.photos')}</button>
                </div>
              )}
              {h.status === 'SIGNED' && h.photoNoticeYears !== null && (
                <div className="hint">{t('contracts.handovers.photo_retention', { years: h.photoNoticeYears })}</div>
              )}
            </div>
            {h.status === 'DRAFT' && !editing && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost" onClick={() => loadForEdit(h)}>
                  {t('contracts.handovers.edit')}
                </button>
                <button className="btn btn-ghost" onClick={() => togglePhotos(h.id)}>
                  {t('contracts.handovers.photos')}
                </button>
                <button className="btn btn-ghost" onClick={() => toggleSigning(h)}>
                  {t('contracts.handovers.sign')}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--rose)' }}
                  disabled={busy}
                  onClick={() => run(() => deleteHandover(contract.id, h.id))}
                >
                  {t('contracts.handovers.delete')}
                </button>
              </div>
            )}
          </div>

          {h.items.length > 0 && (
            <table>
              <tbody>
                {h.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.label}</td>
                    <td>
                      <span className={`badge ${CONDITION_BADGE[i.condition]}`}>{CONDITION_LABEL[i.condition]}</span>
                    </td>
                    <td>{i.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {h.notes && <p className="hint">{h.notes}</p>}

          {photosFor === h.id && (
            <div className="card" style={{ background: '#faf9f5', marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b>{t('contracts.handovers.photos_title')}</b>
                {h.status !== 'SIGNED' && (
                  <>
                    <select value={photoItemId} onChange={(e) => setPhotoItemId(e.target.value)} style={{ maxWidth: 200 }}>
                      <option value="">{t('contracts.handovers.whole_form')}</option>
                      {h.items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {t('contracts.handovers.item_option', { label: it.label })}
                        </option>
                      ))}
                    </select>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                      {photoUploading ? t('contracts.handovers.uploading') : t('contracts.handovers.add_photo')}
                      <input ref={photoFileRef} type="file" accept="image/*" style={{ display: 'none' }} disabled={photoUploading} onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
                    </label>
                  </>
                )}
                {h.status === 'SIGNED' && <span className="hint">{t('contracts.handovers.signed_photos_locked')}</span>}
              </div>
              {/* What must not be photographed, the basis for photographing here, and what is needed when the tenant is living in the unit. */}
              {h.status !== 'SIGNED' && (
                <p className="hint" style={{ marginTop: 6 }}>
                  {t('contracts.handovers.photo_rules')}
                </p>
              )}
              {photos.length === 0 && <div className="empty-state">{t('contracts.handovers.no_photos')}</div>}
              {photos.map((ph) => (
                <div key={ph.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>
                    {ph.filename}
                    {ph.itemId && <span className="hint"> — {h.items.find((it) => it.id === ph.itemId)?.label ?? t('contracts.handovers.item')}</span>}
                    {ph.note && <span className="hint"> · {ph.note}</span>}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => void openHandoverPhoto(ph.id)}>
                    {t('contracts.handovers.view')}
                  </button>
                  {h.status !== 'SIGNED' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={async () => {
                        try {
                          await deleteHandoverPhoto(ph.id);
                          setPhotos(await listHandoverPhotos(h.id));
                        } catch (e2) {
                          const d = (e2 as { response?: { data?: { message?: string } } })?.response?.data;
                          setError(d?.message ?? t('contracts.handovers.photo_delete_failed'));
                        }
                      }}
                    >
                      {t('contracts.handovers.delete')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {signingId === h.id && (
            <div style={{ marginTop: 8 }}>
              <div className="field">
                <label>{t('contracts.handovers.signer_name')}</label>
                <input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder={t('contracts.handovers.signer_name_placeholder')} />
                {/* Says plainly that this is one-way. */}
                <p className="hint">{t('contracts.handovers.sign_hint')}</p>
              </div>
              {/* Photos stay in the contract record for the retention period (from the server), covered by the contract clause with no acknowledgement from the employee. */}
              {signPhotoCount > 0 && (
                <p className="hint">
                  {t('contracts.handovers.sign_photos', { n: signPhotoCount, years: contract.handoverPhotoRetentionYears })}
                </p>
              )}
              <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                <button className="btn btn-ghost" onClick={() => setSigningId(null)}>
                  {t('contracts.handovers.back')}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || !signedBy.trim()}
                  onClick={() =>
                    run(
                      () => signHandover(contract.id, h.id, signedBy.trim()),
                      () => {
                        setSigningId(null);
                        setSignedBy('');
                      },
                    )
                  }
                >
                  {t('contracts.handovers.confirm_sign')}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
