import { useEffect, useState } from 'react';
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

/** يفتح صورةً أو ورقةً مجلوبةً بالدخول في نافذةٍ جديدة (لا رابطَ موقَّعاً للمخزن الحسّاس). */
async function openBlob(load: () => Promise<Blob>) {
  const blob = await load();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * ⚖️ **مسارُ التوقيع في سجلّ النموذج** (توجيه ٢٨٧ · `ق-١٦٢٠` · `ق-١٦٦٨` إلى `ق-١٦٧١`): الموظّفُ يوقّع ويرسل الرابطَ إلى جوال المستأجر
 * (أو ممثّل الشخص الاعتباريّ بسنده)، ويعيد الرابط، ويفتح رابطاً على جهازه بحضور الطرف، ويوقّع ورقياً بشهادته، ويردّ على الاعتراض بنسخةٍ
 * معدّلة. **والختمُ لا يُطلب باليد**: يقع حين يوقّع الطرف. **ومراجعةٌ** فعلُ الإرسال والورقيّ وجهاز الموظّف، **وتسجيلٌ** فعلُ النسخة المعدّلة.
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
  /** يحفظ ما لم يُحفظ قبل التوقيع، فلا يُوقَّع غيرُ ما على الشاشة؛ ويعيد `false` إن تعذّر. */
  beforeSend: () => Promise<boolean>;
  onChanged: (updated: FormInstance) => void;
  onRevised: (created: FormInstance) => void;
}) {
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

  const loadEvents = () => run(async () => setEvents(await contractFormEvents(contract.id, record.id)), 'تعذّر جلبُ سجلّ النموذج');
  const resend = () =>
    run(async () => {
      const r = await resendContractFormLink(contract.id, record.id);
      onChanged(r.form);
      setNotice(r.delivery === 'SENT' ? 'أُرسل رابطٌ جديد.' : 'تعذّر إرسالُ الرسالة؛ أعد المحاولة.');
    }, 'تعذّر إعادةُ الإرسال');
  const deviceLink = () =>
    run(async () => {
      const link = await contractFormDeviceLink(contract.id, record.id);
      setDevice(link);
      window.open(link.url, '_blank', 'noopener');
    }, 'تعذّر فتحُ الرابط على هذا الجهاز');
  const revise = () => run(async () => onRevised(await reviseContractForm(contract.id, record.id)), 'تعذّر إنشاءُ النسخة المعدّلة');

  return (
    <div className="card" style={{ marginTop: 10 }} data-testid="form-signing-section">
      <div className="card-title">التوقيع</div>

      {sent && record.signDeadline && (
        <p style={{ fontSize: 12.5 }}>
          أُرسل <span className="num">{record.sentAt ? dateTimeText(record.sentAt) : ''}</span> · ينقضي <span className="num">{dateTimeText(record.signDeadline)}</span> · النسخة{' '}
          <span className="num">{record.revisionNo}</span>
          {record.nafathRequired && ' · يُشترط التحقّق عبر نفاذ'}
        </p>
      )}
      {!sent && <p className="hint">يوقّع الموظّفُ ثم يُرسل الرابطُ إلى جوال المستأجر المسجَّل، ويُختم النموذجُ حين يوقّع المستأجر.</p>}

      {record.signatures.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>الموقّع</th>
              <th>الاسم</th>
              <th>المستوى</th>
              <th>القناة</th>
              <th>الوقت</th>
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
                      {s.authorityVerification === 'VERIFIED' ? 'تُحقّق من السند' : 'لم يُتحقَّق من السند'}
                    </div>
                  )}
                  {s.witnessUserName && <div className="hint">بشهادة {s.witnessUserName}</div>}
                </td>
                <td>{SIGNATURE_LEVEL[s.level] ?? s.level}</td>
                <td>{SIGNATURE_CHANNEL[s.channel] ?? s.channel}</td>
                <td className="num">{dateTimeText(s.signedAt)}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => run(() => openBlob(() => contractFormSignatureImage(contract.id, record.id, s.id)), 'تعذّر فتحُ التوقيع')}>
                    عرض
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {record.objection && (
        <div className="error-text" style={{ marginTop: 8 }} data-testid="form-objection">
          اعتراض {record.objection.byName}
          {record.objection.mobileMasked ? ` (${record.objection.mobileMasked})` : ''} في <span className="num">{dateTimeText(record.objection.objectedAt)}</span>:{' '}
          {record.objection.note}
          {record.objection.hasPhoto && (
            <button className="btn btn-ghost btn-sm" onClick={() => run(() => openBlob(() => contractFormObjectionPhoto(contract.id, record.id)), 'تعذّر فتحُ الصورة')}>
              صورةُ الاعتراض
            </button>
          )}
        </div>
      )}
      {status === 'EXPIRED' && <p className="error-text">انقضت المدّةُ ولم يوقّع الطرف؛ والانقضاءُ ليس موافقة.</p>}
      {status === 'DISPUTED' && <p className="error-text">بقي الاعتراضُ بلا توقيعٍ عند الموعد، فسُجّل خلافاً قائماً.</p>}

      {device && (
        <p className="hint" data-testid="form-device-link">
          فُتح الرابطُ على هذا الجهاز وينتهي <span className="num">{dateTimeText(device.expiresAt)}</span>؛ ويدخل الطرفُ برمزٍ يصل جواله ثم يوقّع.
        </p>
      )}
      {notice && <p className="hint">{notice}</p>}
      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {status === 'DRAFT' && canReview && (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => setDialog('send')}>
              توقيعٌ وإرسال
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setDialog('paper')}>
              توقيعٌ ورقيّ
            </button>
          </>
        )}
        {status === 'AWAITING_SIGNATURE' && canReview && (
          <>
            <button className="btn btn-ghost" disabled={busy} onClick={resend}>
              إعادةُ إرسال الرابط
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={deviceLink}>
              توقيعٌ على هذا الجهاز
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setDialog('paper')}>
              توقيعٌ ورقيّ
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setDialog('substitute')}>
              مستلمٌ بديل
            </button>
          </>
        )}
        {status === 'OBJECTED' && canRecord && (
          <button className="btn btn-primary" disabled={busy} onClick={revise}>
            نسخةٌ معدّلة
          </button>
        )}
        {sent && (
          <button className="btn btn-ghost" disabled={busy} onClick={loadEvents}>
            سجلُّ النموذج
          </button>
        )}
      </div>

      {events && (
        <ul style={{ fontSize: 12.5, marginTop: 8 }} data-testid="form-events">
          {events.length === 0 && <li>لا أحداث</li>}
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="num">{dateTimeText(e.at)}</span> · النسخة <span className="num">{e.revisionNo}</span> · {EVENT_LABEL[e.kind] ?? e.kind} · {e.actor}
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
              setNotice(r.delivery === 'SENT' ? 'وُقّع النموذجُ وأُرسل الرابط.' : 'وُقّع النموذج، وتعذّر إرسالُ الرسالة؛ أعد الإرسال.');
            }, 'تعذّر التوقيعُ والإرسال')
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
              setNotice(r.delivery === 'SENT' ? 'أُرسل إلى جوال المستأجر رابطٌ يوافق به على البديل برمزه.' : 'تعذّر إرسالُ رابط الموافقة؛ أعد الطلب.');
            }, 'تعذّر طلبُ المستلم البديل')
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
                  ? 'خُتم النموذج وأُرسل رابطُ النسخة النهائية إلى جوال المستأجر المسجَّل.'
                  : r.finalCopy === 'NONE'
                    ? 'خُتم النموذج؛ ولا جوالَ صالحاً في بطاقة المستأجر للنسخة النهائية.'
                    : 'خُتم النموذج، وتعذّر إرسالُ النسخة النهائية.',
              );
            }, 'تعذّر التوقيعُ الورقيّ')
          }
        />
      )}
    </div>
  );
}

/** توقيعُ الموظّف ثم الإرسال، ومعه حقولُ الممثّل إن كان المستأجرُ شخصاً اعتبارياً. */
function SendDialog({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (drawing: Blob, rep: RepresentativeFields | null, doc: File | null) => void;
}) {
  const [drawing, setDrawing] = useState<Blob | null>(null);
  const [legal, setLegal] = useState(false);
  const [rep, setRep] = useState<RepresentativeFields>({ name: '', mobile: '', authorityType: 'CR_MANAGER', authorityRef: '', nationalId: '' });
  const [doc, setDoc] = useState<File | null>(null);
  const repReady = !legal || (rep.name.trim() && rep.mobile.trim() && rep.authorityRef.trim());
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }} role="dialog" aria-label="توقيعٌ وإرسال">
        <div className="modal-head">
          <div className="modal-title">توقيعُ الموظّف ثم إرسالُ الرابط</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <p className="hint">بعد التوقيع لا يُعدَّل النموذج، ويصل المستأجرَ رابطٌ لا يحمل اسماً ولا مبلغاً، ويدخل برمزٍ إلى جواله المسجَّل.</p>
        <SignaturePad onChange={setDrawing} label="توقيعُ الموظّف" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> المستأجرُ شخصٌ اعتباريّ ويوقّع عنه ممثّلُه
        </label>
        {legal && (
          <div className="two-col">
            <div className="field">
              <label>اسمُ الممثّل</label>
              <input aria-label="اسمُ الممثّل" value={rep.name} onChange={(e) => setRep({ ...rep, name: e.target.value })} />
            </div>
            <div className="field">
              <label>جوالُ الممثّل</label>
              <input aria-label="جوالُ الممثّل" className="num" inputMode="tel" value={rep.mobile} onChange={(e) => setRep({ ...rep, mobile: e.target.value })} />
            </div>
            <div className="field">
              <label>صفتُه</label>
              <select value={rep.authorityType} onChange={(e) => setRep({ ...rep, authorityType: e.target.value as RepresentativeFields['authorityType'] })}>
                <option value="CR_MANAGER">{AUTHORITY_TYPE.CR_MANAGER}</option>
                <option value="NAJIZ_POA">{AUTHORITY_TYPE.NAJIZ_POA}</option>
              </select>
            </div>
            <div className="field">
              <label>{rep.authorityType === 'CR_MANAGER' ? 'رقمُ السجلّ التجاريّ' : 'رقمُ الوكالة'}</label>
              <input aria-label={rep.authorityType === 'CR_MANAGER' ? 'رقمُ السجلّ التجاريّ' : 'رقمُ الوكالة'} className="num" value={rep.authorityRef} onChange={(e) => setRep({ ...rep, authorityRef: e.target.value })} />
            </div>
            <div className="field">
              <label>رقمُ هويّة الممثّل (حين يُشترط نفاذ)</label>
              <input aria-label="رقمُ هويّة الممثّل" className="num" value={rep.nationalId ?? ''} onChange={(e) => setRep({ ...rep, nationalId: e.target.value })} />
            </div>
            <div className="field">
              <label>صورةُ السند (اختيارية)</label>
              <input aria-label="صورةُ السند" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        )}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={busy || !drawing || !repReady} onClick={() => drawing && onSubmit(drawing, legal ? rep : null, legal ? doc : null)}>
            توقيعٌ وإرسال
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ⚖️ **طلبُ مستلمٍ بديل** (توجيه ٢٨٧ ⑦ · `ق-١٦٧٢`): الموظّفُ يُدخل اسمَ البديل وجوالَه، ويوافق المستأجرُ من جواله برمزه؛ **والرمزُ لا يمرّ
 * بالموظّف**.
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
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  // ⚖️ رقمُ هويّة البديل في نموذجٍ يشترط نفاذ وحدَه (`ق-١٦٧٧`): يدخل بالرمز ثم نفاذ برقمه.
  const [nationalId, setNationalId] = useState('');
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }} role="dialog" aria-label="مستلمٌ بديل">
        <div className="modal-head">
          <div className="modal-title">مستلمٌ بديل بموافقة المستأجر</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <p className="hint">يصل جوالَ المستأجر المسجَّل رابطٌ يرى فيه اسمَ البديل ويوافق أو يرفض برمزه، ثم يصل البديلَ رابطُه على جواله.</p>
        <div className="field">
          <label>اسمُ البديل</label>
          <input aria-label="اسمُ البديل" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>جوالُ البديل</label>
          <input aria-label="جوالُ البديل" className="num" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </div>
        {nafathRequired && (
          <div className="field">
            <label>رقمُ هويّة البديل (النموذجُ يشترط نفاذ)</label>
            <input aria-label="رقمُ هويّة البديل" className="num" inputMode="numeric" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>
        )}
        <p className="hint">
          ويصل البديلَ مع رمزه نصُّ الإحاطة بحفظ بياناته، ويوافق عليه بإدخال الرمز{nafathRequired ? '، ثم يجتاز نفاذ برقم هويّته' : ''}.
        </p>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !name.trim() || !mobile.trim() || (nafathRequired && !nationalId.trim())}
            onClick={() => onSubmit(nafathRequired ? { name: name.trim(), mobile: mobile.trim(), nationalId: nationalId.trim() } : { name: name.trim(), mobile: mobile.trim() })}
          >
            إرسالُ طلب الموافقة
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * التوقيعُ الورقيّ: صورةُ الورقة الموقَّعة بشهادة الموظّف، ورسمُ الموظّف إن لم يوقّع بعد. ⚖️ **والشخصُ الاعتباريّ يوقّع عنه ممثّلُه**
 * (`ق-١٦٧٥`)، **والموقّعُ يُختار صراحةً ولا يُستنتج** (`ق-١٦٧٨` (أ)): الممثّلُ المعيَّن عند الإرسال، أو موقّعٌ آخر باسمه ونوع سنده ورقمه.
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
  const [paper, setPaper] = useState<File | null>(null);
  const [drawing, setDrawing] = useState<Blob | null>(null);
  const [signerName, setSignerName] = useState('');
  const [legal, setLegal] = useState(false);
  // من وقّع عن الشركة: لا اختيارَ مسبق، فيختار الموظّف.
  const [signer, setSigner] = useState<'designated' | 'other' | null>(null);
  const [authority, setAuthority] = useState<PaperAuthorityFields>({ authorityType: 'CR_MANAGER', authorityRef: '' });
  const [doc, setDoc] = useState<File | null>(null);
  const repReady = !legal || signer === 'designated' || (signer === 'other' && signerName.trim() && authority.authorityRef.trim());
  const otherSigner = legal && signer === 'other';
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }} role="dialog" aria-label="توقيعٌ ورقيّ">
        <div className="modal-head">
          <div className="modal-title">توقيعٌ ورقيّ بشهادة الموظّف</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <p className="hint">لمن لا جوالَ له أو يرفض الرابط: يوقّع الطرفُ على الورق، وتُرفع صورتُها، ويشهد عليها الموظّف، ويُختم النموذج.</p>
        <div className="field">
          <label>صورةُ الورقة الموقَّعة</label>
          <input type="file" aria-label="صورةُ الورقة الموقَّعة" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setPaper(e.target.files?.[0] ?? null)} />
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> المستأجرُ شخصٌ اعتباريّ ووقّع عنه ممثّلُه
        </label>
        {legal && (
          <div role="radiogroup" aria-label="من وقّع عن الشركة" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" name="paper-signer" checked={signer === 'designated'} onChange={() => setSigner('designated')} /> الممثّلُ المعيَّن عند الإرسال هو من وقّع
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" name="paper-signer" checked={signer === 'other'} onChange={() => setSigner('other')} /> وقّع غيرُه: أكتب اسمَه وسندَه
            </label>
          </div>
        )}
        {(!legal || otherSigner) && (
          <div className="field">
            <label>{legal ? 'اسمُ من وقّع عنه' : 'من وقّع الورقةَ بيده (إن خالف اسمَ المستأجر)'}</label>
            <input aria-label="من وقّع الورقةَ بيده" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </div>
        )}
        {otherSigner && (
          <div className="two-col">
            <div className="field">
              <label>صفتُه</label>
              <select aria-label="صفةُ الموقّع" value={authority.authorityType} onChange={(e) => setAuthority({ ...authority, authorityType: e.target.value as PaperAuthorityFields['authorityType'] })}>
                <option value="CR_MANAGER">{AUTHORITY_TYPE.CR_MANAGER}</option>
                <option value="NAJIZ_POA">{AUTHORITY_TYPE.NAJIZ_POA}</option>
              </select>
            </div>
            <div className="field">
              <label>{authority.authorityType === 'CR_MANAGER' ? 'رقمُ السجلّ التجاريّ' : 'رقمُ الوكالة'}</label>
              <input
                aria-label={authority.authorityType === 'CR_MANAGER' ? 'رقمُ السجلّ التجاريّ' : 'رقمُ الوكالة'}
                className="num"
                value={authority.authorityRef}
                onChange={(e) => setAuthority({ ...authority, authorityRef: e.target.value })}
              />
            </div>
            <div className="field">
              <label>صورةُ السند (اختيارية)</label>
              <input aria-label="صورةُ السند" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        )}
        {needsDrawing && <SignaturePad onChange={setDrawing} label="توقيعُ الموظّف" />}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !paper || (needsDrawing && !drawing) || !repReady}
            onClick={() =>
              paper && onSubmit(paper, drawing, legal && signer === 'designated' ? '' : signerName, otherSigner ? authority : null, otherSigner ? doc : null, legal && signer === 'designated')
            }
          >
            رفعٌ وختم
          </button>
        </div>
      </div>
    </div>
  );
}
