import { useRef, useState } from 'react';
import { createHandover, deleteHandover, signHandover, updateHandover, type Contract, type ContractHandover, type HandoverItemInput, type HandoverType, type ItemCondition, listHandoverPhotos, uploadHandoverPhoto, openHandoverPhoto, deleteHandoverPhoto, type HandoverPhoto } from '../../api/contracts';
import { dfmt, today } from '../../lib/format';

const TYPE_LABEL: Record<HandoverType, string> = {
  DELIVERY: 'تسليم للمستأجر',
  RECEIPT: 'استلام من المستأجر',
};

const CONDITION_LABEL: Record<ItemCondition, string> = {
  GOOD: 'سليم',
  FAIR: 'مقبول',
  DAMAGED: 'تالف',
  MISSING: 'مفقود',
};

const CONDITION_BADGE: Record<ItemCondition, string> = {
  GOOD: 'paid',
  FAIR: 'due',
  DAMAGED: 'overdue',
  MISSING: 'overdue',
};

const CONDITIONS = Object.keys(CONDITION_LABEL) as ItemCondition[];

/** Rooms and fittings a Saudi residential handover almost always covers —
 * offered as a starting point so the form isn't built from nothing each time. */
const SUGGESTED_ITEMS = ['المطبخ', 'دورات المياه', 'المكيّفات', 'الأبواب والنوافذ', 'الدهانات', 'العدادات'];

/**
 * The condition-of-unit form, at handover and at return.
 *
 * A signed form shows no edit controls at all — the server refuses the change
 * anyway, and offering a button that always fails would suggest the record is
 * negotiable when its whole purpose is that it isn't.
 */
export function HandoversSection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState('');
  // ⚖️ عددُ صور النموذج يُقرأ من الخادم عند فتح التوقيع (قد تُرفع صورٌ بعد تحميل العقد)، فيُعرض مع مدّة حفظها؛ ولا إقرارَ من
  //    الموظّف (توجيه ٢٧٧ · ق-١٦١٩/ج: «الاستلامُ والتسليمُ والوحدةُ فارغة يكفيهما بندٌ في العقد»).
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
      setError(d?.message ?? 'تعذّر رفع الصورة — الحد 10MB وبصيغ صور/PDF');
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
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إتمام العملية'));
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
        <span>نماذج الاستلام والتسليم ({contract.handovers.length})</span>
        {contract.status !== 'CANCELLED' && !editing && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              resetForm();
              setAdding(true);
            }}
          >
            + نموذج جديد
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {editing && (
        <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>نوع النموذج</label>
              <select value={type} onChange={(e) => setType(e.target.value as HandoverType)} disabled={editingId !== null}>
                {(Object.keys(TYPE_LABEL) as HandoverType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label>قراءة عداد الكهرباء</label>
              <input className="num" value={electricityMeter} onChange={(e) => setElectricityMeter(e.target.value)} />
            </div>
            <div className="field">
              <label>قراءة عداد الماء</label>
              <input className="num" value={waterMeter} onChange={(e) => setWaterMeter(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>البنود</label>
            {items.map((it, i) => (
              <div className="two-col" key={i} style={{ marginBottom: 4 }}>
                <input
                  value={it.label}
                  onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder="البند"
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
                  <button className="menu-btn" title="حذف البند" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
                <input
                  style={{ gridColumn: '1 / -1' }}
                  value={it.note ?? ''}
                  onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                  placeholder="ملاحظة (اختياري)"
                />
              </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <button className="btn btn-ghost" onClick={() => setItems((xs) => [...xs, { label: '', condition: 'GOOD' }])}>
                + بند
              </button>
              {SUGGESTED_ITEMS.filter((s) => !items.some((i) => i.label === s)).map((s) => (
                <button key={s} className="chip" onClick={() => setItems((xs) => [...xs, { label: s, condition: 'GOOD' }])}>
                  + {s}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>ملاحظات</label>
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
              تراجع
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
              حفظ كمسودة
            </button>
          </div>
        </div>
      )}

      {contract.handovers.length === 0 && !editing && <div className="empty-state">لا توجد نماذج</div>}

      {contract.handovers.map((h) => (
        <div className="card" key={h.id} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <strong style={{ fontSize: 12.5 }}>{TYPE_LABEL[h.type]}</strong>{' '}
              <span className={`badge ${h.status === 'SIGNED' ? 'paid' : 'draft'}`}>{h.status === 'SIGNED' ? 'موقَّع' : 'مسودة'}</span>
              <div className="hint">
                {dfmt(h.date)}
                {h.electricityMeter && ` — كهرباء: ${h.electricityMeter}`}
                {h.waterMeter && ` — ماء: ${h.waterMeter}`}
              </div>
              {h.status === 'SIGNED' && (
                // The stamp is the evidence — shown to the second, and always
                // beside who signed.
                <div className="hint">
                  وقّعه {h.signedBy} — {new Date(h.signedAt!).toLocaleString('ar-SA')}{' '}
                  <button className="btn btn-ghost btn-sm" onClick={() => togglePhotos(h.id)}>📷 الصور</button>
                </div>
              )}
              {h.status === 'SIGNED' && h.photoNoticeYears !== null && (
                <div className="hint">صورُ النموذج تبقى في سجلّ العقد {h.photoNoticeYears} سنةً من إغلاق حساب المنشأة ثم تُتلف، ولا تُحذف قبلها.</div>
              )}
            </div>
            {h.status === 'DRAFT' && !editing && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost" onClick={() => loadForEdit(h)}>
                  تعديل
                </button>
                <button className="btn btn-ghost" onClick={() => togglePhotos(h.id)}>
                  📷 الصور
                </button>
                <button className="btn btn-ghost" onClick={() => toggleSigning(h)}>
                  توقيع
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--rose)' }}
                  disabled={busy}
                  onClick={() => run(() => deleteHandover(contract.id, h.id))}
                >
                  حذف
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
                <b>صور النموذج</b>
                {h.status !== 'SIGNED' && (
                  <>
                    <select value={photoItemId} onChange={(e) => setPhotoItemId(e.target.value)} style={{ maxWidth: 200 }}>
                      <option value="">النموذج كاملاً</option>
                      {h.items.map((it) => (
                        <option key={it.id} value={it.id}>
                          بند: {it.label}
                        </option>
                      ))}
                    </select>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                      {photoUploading ? 'جارٍ الرفع…' : '📤 إضافة صورة'}
                      <input ref={photoFileRef} type="file" accept="image/*" style={{ display: 'none' }} disabled={photoUploading} onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
                    </label>
                  </>
                )}
                {h.status === 'SIGNED' && <span className="hint">النموذج موقَّع — الصور جزء ممّا وُقِّع عليه فلا تُعدَّل</span>}
              </div>
              {/* ⚖️ توجيه ٢٧٧ · ق-١٦١٩/ج: ما لا يُصوَّر، وأساسُ التصوير هنا، وما يلزم حين يكون المستأجرُ ساكناً. */}
              {h.status !== 'SIGNED' && (
                <p className="hint" style={{ marginTop: 6 }}>
                  لا تُصوَّر وجوهٌ ولا مستنداتٌ ولا أغراضٌ شخصية. والتصويرُ هنا عند التسليم والاستلام والوحدةُ فارغة، ويكفيه بندٌ في العقد؛ فإن
                  كان المستأجرُ ساكناً (كشفٌ أو صيانة) فأعلِمه قبل التصوير. والصورُ تبقى في سجلّ العقد طوالَ مدّة الحفظ النظامية.
                </p>
              )}
              {photos.length === 0 && <div className="empty-state">لا صور</div>}
              {photos.map((ph) => (
                <div key={ph.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>
                    {ph.filename}
                    {ph.itemId && <span className="hint"> — {h.items.find((it) => it.id === ph.itemId)?.label ?? 'بند'}</span>}
                    {ph.note && <span className="hint"> · {ph.note}</span>}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => void openHandoverPhoto(ph.id)}>
                    عرض
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
                          setError(d?.message ?? 'تعذّر حذف الصورة');
                        }
                      }}
                    >
                      حذف
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {signingId === h.id && (
            <div style={{ marginTop: 8 }}>
              <div className="field">
                <label>اسم الموقِّع</label>
                <input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="مثال: أبو محمد — المستأجر" />
                {/* Says plainly that this is one-way. */}
                <p className="hint">بعد التوقيع لا يمكن تعديل النموذج أو حذفه، ويُختم بوقت الخادم.</p>
              </div>
              {/* ⚖️ ق-١٦١٩/ج: الصورُ تبقى في سجلّ العقد بمدّة الحفظ (من الخادم)، ويكفيها بندُ العقد بلا إقرارٍ من الموظّف. */}
              {signPhotoCount > 0 && (
                <p className="hint">
                  على النموذج {signPhotoCount} صور، تبقى في سجلّ العقد {contract.handoverPhotoRetentionYears} سنةً من إغلاق حساب المنشأة ثم
                  تُتلف، وأساسُها بندُ التصوير في العقد.
                </p>
              )}
              <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                <button className="btn btn-ghost" onClick={() => setSigningId(null)}>
                  تراجع
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
                  تأكيد التوقيع
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
