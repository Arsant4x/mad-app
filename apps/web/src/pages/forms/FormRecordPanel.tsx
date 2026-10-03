import { useMemo, useState } from 'react';
import {
  deleteContractForm,
  sealContractForm,
  setContractFormValues,
  verifyContractForm,
  type FormInstance,
  type FormValueInput,
  type FormVerification,
} from '../../api/forms';
import { ConfirmModal } from '../../components/ConfirmModal';
import { apiErrorMessage } from '../../lib/apiError';
import { dfmt } from '../../lib/format';
import {
  dateTimeText,
  EJAR_COMPLEMENT_NOTE,
  NUMERIC_TYPES,
  valueChanged,
  valueDraftOf,
  valueInputOf,
  valueText,
  type FormContractRef,
  type ValueDraft,
} from './formItems';

/**
 * ⚖️ **السجلُّ المعبّأ** (الموجة ١د · `ق-١٦٣٨`): تعبئةُ المسوّدة بأنواع بنودها، ثم الختمُ ببصمته ورقمه وموضعه في السلسلة
 * (`ق-١٦٣٦`)، ثم التحقّقُ والطباعةُ ببصمة التحقّق. **التعبئةُ «تسجيل» والختمُ «مراجعة»** على شاشة العقود (الخادمُ يحكم، والزرُّ
 * يُخفى لمن لا يملكه). **والمختومُ يُقرأ ولا يُعدَّل** (`ق-١٦٣٥` ③ب)، والتصحيحُ بنموذجٍ تصحيحيٍّ لم يُبنَ بعد.
 */
export function FormRecordPanel({
  contract,
  record,
  canRecord,
  canReview,
  onChanged,
  onDeleted,
  onClose,
}: {
  contract: FormContractRef;
  record: FormInstance;
  canRecord: boolean;
  canReview: boolean;
  onChanged: (updated: FormInstance) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const sealed = record.status === 'SEALED';
  const [drafts, setDrafts] = useState<Record<string, ValueDraft>>(() =>
    Object.fromEntries(record.items.map((i) => [i.itemId, valueDraftOf(i)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'seal' | 'delete' | null>(null);
  const [verification, setVerification] = useState<FormVerification | null>(null);

  const editable = !sealed && canRecord;
  const dirty = useMemo(() => record.items.some((i) => valueChanged(i, drafts[i.itemId])), [record.items, drafts]);
  const setDraft = (itemId: string, patch: Partial<ValueDraft>) => setDrafts((d) => ({ ...d, [itemId]: { ...d[itemId], ...patch } }));

  /** يُرسل ما تغيّر وحدَه، ويعيد السجلَّ كما حفظه الخادم. */
  async function saveChanges(): Promise<FormInstance | null> {
    const values: FormValueInput[] = [];
    for (const item of record.items) {
      if (!valueChanged(item, drafts[item.itemId])) continue;
      const r = valueInputOf(item, drafts[item.itemId]);
      if ('error' in r) {
        setError(r.error);
        return null;
      }
      values.push(r.input);
    }
    if (values.length === 0) return record;
    const updated = await setContractFormValues(contract.id, record.id, values);
    setDrafts(Object.fromEntries(updated.items.map((i) => [i.itemId, valueDraftOf(i)])));
    onChanged(updated);
    return updated;
  }

  async function run(fn: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(apiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(async () => void (await saveChanges()), 'تعذّر حفظ القيم');

  const seal = () =>
    run(async () => {
      setConfirm(null);
      // ما لم يُحفظ يُحفظ أوّلاً، فلا يُختم غيرُ ما على الشاشة.
      const saved = await saveChanges();
      if (!saved) return;
      onChanged(await sealContractForm(contract.id, record.id));
    }, 'تعذّر الختم');

  const remove = () =>
    run(async () => {
      setConfirm(null);
      await deleteContractForm(contract.id, record.id);
      onDeleted();
    }, 'تعذّر حذف المسوّدة');

  const verify = () => run(async () => setVerification(await verifyContractForm(contract.id, record.id)), 'تعذّر التحقّق');

  return (
    <>
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }} role="dialog" aria-label="السجلّ المعبّأ">
        <div className="modal-head">
          <div className="modal-title">
            {record.template.name} · إصدار {record.template.version}{' '}
            <span className={`badge ${sealed ? 'paid' : 'due'}`}>{sealed ? 'مختوم' : 'مسوّدة'}</span>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="print-receipt" data-testid="form-print-sheet">
          <p style={{ fontSize: 12.5 }}>
            العقد <span className="num">{contract.no}</span> · الوحدة <span className="num">{contract.unitNo}</span> · {contract.propertyName} · المستأجر{' '}
            {contract.tenant} · تاريخُ النموذج <span className="num">{dfmt(record.formDate)}</span> · عبّأه {record.filledByName}
          </p>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th style={{ width: '30%' }}>البند</th>
                <th>القيمة</th>
                <th>ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item) => {
                const d = drafts[item.itemId];
                const numeric = NUMERIC_TYPES.has(item.itemType);
                const range =
                  numeric && (item.minValue !== null || item.maxValue !== null)
                    ? `من ${item.minValue ?? '…'} إلى ${item.maxValue ?? '…'}${item.unit ? ` ${item.unit}` : ''}`
                    : null;
                return (
                  <tr key={item.itemId} data-testid="form-item-row">
                    <td className="num">{item.lineNo}</td>
                    <td>
                      {item.label}
                      {item.required && <div className="hint">إلزاميّ</div>}
                      {range && <div className="hint">{item.isBlocking ? `${range}، وما خرج عنه يمنع الختم` : range}</div>}
                      {item.helpText && <div className="hint">{item.helpText}</div>}
                    </td>
                    <td>
                      {editable ? (
                        item.itemType === 'BOOLEAN' ? (
                          <select aria-label={item.label} value={d.bool} onChange={(e) => setDraft(item.itemId, { bool: e.target.value as ValueDraft['bool'] })}>
                            <option value=""></option>
                            <option value="yes">نعم</option>
                            <option value="no">لا</option>
                          </select>
                        ) : numeric ? (
                          <input aria-label={item.label} className="num" inputMode="decimal" value={d.number} onChange={(e) => setDraft(item.itemId, { number: e.target.value })} />
                        ) : (
                          <input aria-label={item.label} value={d.text} onChange={(e) => setDraft(item.itemId, { text: e.target.value })} />
                        )
                      ) : (
                        <span className={numeric ? 'num' : undefined}>{valueText(item)}</span>
                      )}
                      {item.outOfRange && <div className="error-text">خارج النطاق</div>}
                    </td>
                    <td>
                      {editable ? (
                        <input aria-label={`ملاحظة ${item.label}`} value={d.note} onChange={(e) => setDraft(item.itemId, { note: e.target.value })} />
                      ) : (
                        item.note ?? ''
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sealed && (
            <div className="card" style={{ marginTop: 10 }} data-testid="form-seal-block">
              <div className="card-title">الختم</div>
              <p style={{ fontSize: 12.5 }}>
                الرقم <span className="num">{record.no}</span> · الموضعُ في سلسلة أختام المنشأة <span className="num">{record.sealSeq}</span>
              </p>
              <p style={{ fontSize: 12.5 }}>
                بصمةُ المحتوى (sha256) <span className="num" style={{ wordBreak: 'break-all' }}>{record.contentHash}</span>
              </p>
              <p style={{ fontSize: 12.5 }}>
                بصمةُ الختم السابق{' '}
                <span className="num" style={{ wordBreak: 'break-all' }}>
                  {record.prevHash ?? 'لا سابقَ له: أوّلُ ختمٍ في المنشأة'}
                </span>
              </p>
              <p style={{ fontSize: 12.5 }}>
                ختمه {record.sealedByName} · وقتُ الختم <span className="num">{record.sealedAt ? dateTimeText(record.sealedAt) : ''}</span> بساعة الخادم
              </p>
              <p className="hint">ختمٌ داخليٌّ الآن، وجهةٌ معتمدةٌ لاحقاً (قرارُ الخطّة ٤٦).</p>
            </div>
          )}

          <p className="hint">{EJAR_COMPLEMENT_NOTE}</p>
        </div>

        {verification && (
          <p className={verification.valid ? 'hint' : 'error-text'} data-testid="form-verification">
            {verification.valid
              ? 'التحقّق: البصمةُ المعادة من السجلّ تطابق المختومة، وهو متّصلٌ بسابقه في السلسلة.'
              : `التحقّق: ${verification.contentIntact ? '' : 'محتوى السجلّ تغيّر عمّا خُتم. '}${verification.chainLinked ? '' : 'السجلُّ لا يتّصل بسابقه في السلسلة.'}`}
          </p>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
          {!sealed && canRecord && (
            <button className="btn btn-ghost" onClick={() => setConfirm('delete')} disabled={busy}>
              حذفُ المسوّدة
            </button>
          )}
          {editable && (
            <button className="btn btn-ghost" onClick={save} disabled={busy || !dirty}>
              حفظٌ كمسوّدة
            </button>
          )}
          {!sealed && canReview && (
            <button className="btn btn-primary" onClick={() => setConfirm('seal')} disabled={busy}>
              ختم
            </button>
          )}
          {sealed && (
            <>
              <button className="btn btn-ghost" onClick={verify} disabled={busy}>
                تحقّق
              </button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                طباعة
              </button>
            </>
          )}
        </div>
      </div>
    </div>

      {confirm === 'seal' && (
        <ConfirmModal
          title="ختمُ السجلّ"
          body="يُختم السجلُّ برقمه وبصمته وموضعه في سلسلة أختام المنشأة، ولا يُعدَّل بعد ذلك ولا يُحذف. والتصحيحُ بعده بنموذجٍ تصحيحيّ."
          confirmLabel="ختم"
          onCancel={() => setConfirm(null)}
          onConfirm={seal}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmModal
          title="حذفُ المسوّدة"
          body="تُحذف المسوّدةُ بقيمها، ولا رقمَ لها فلا تترك فجوة."
          confirmLabel="حذف"
          onCancel={() => setConfirm(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
