import { useState } from 'react';
import type { DeclaredClassification, DeclaredVatInclusion } from '../../api/contracts';
import { useDeclareClassification, type ContractView } from '../../hooks/contracts';
import { CLASSIFICATION_OPTIONS, VAT_INCLUSION_OPTIONS } from './contractsMeta';

/**
 * لوحةُ إعلان التصنيف — النمط الثاني (النموذج) على القواعد.
 *
 * عقدٌ سبق الهجرة يحمل «غير مصنَّف»/«غير معلَن» ولا يُعدَّل قبل إعلانهما — الخادمُ يرفض
 * `PATCH` الناقصَ بـ`400` مسمّى (`contracts.service.ts:232` و`:235`). هنا:
 * - **لا افتراضَ صامتاً**: الخياران فارغان حتى يُختارا (③ على النموذج · `ق-٨٩٨`).
 * - الحفظُ بـ`useMutation` و`onError` إلزاميّ (②): رسالةُ الخادم تُعرض في موضعها،
 *   **والقيمُ تبقى** — لا نموذجَ يُفرَّغ على خطأ.
 * - الفعلُ يظهر لمن يملك `contracts:edit` (⑤) — والمنعُ الحقيقي في الخادم.
 */
export function ClassificationDeclaration({ contract, canEdit, onDeclared }: { contract: ContractView; canEdit: boolean; onDeclared: (updated: ContractView) => void }) {
  const [classification, setClassification] = useState<DeclaredClassification | ''>('');
  const [vatInclusion, setVatInclusion] = useState<DeclaredVatInclusion | ''>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const { mutate, pending, failure } = useDeclareClassification(contract.id, {
    onSuccess: (updated) => onDeclared(updated),
    onError: () => {
      /* الرسالةُ تُقرأ من `failure` في الرسم — لا ابتلاع */
    },
  });

  const submit = () => {
    setLocalError(null);
    if (!classification || !vatInclusion) {
      setLocalError('اختر التصنيفَ وشمولَ القيمة معاً — لا يُفترض أيٌّ منهما.');
      return;
    }
    void mutate({ classification, vatInclusion });
  };

  const error = localError ?? failure?.message ?? null;

  return (
    <section className="rz-declare card" data-section="classification-declaration" aria-busy={pending}>
      <div className="card-head">
        <div className="card-title">إعلانُ تصنيف العقد للضريبة</div>
      </div>
      <p className="hint">
        عقدٌ سُجِّل قبل اعتماد التصنيف — اختر تصنيفَه وهل قيمتُه شاملةٌ للضريبة. <strong>لا يُعدَّل شيءٌ فيه قبل ذلك.</strong>
      </p>
      {!canEdit ? (
        <p className="warn-text" data-state="forbidden">
          لا تملك صلاحية تعديل العقود — ومن يمنحها: مالك المنشأة.
        </p>
      ) : null}
      <div className="two-col">
        <div className="field">
          <label htmlFor="decl-classification">تصنيف العقد</label>
          <select id="decl-classification" value={classification} disabled={!canEdit || pending} onChange={(e) => setClassification(e.target.value as DeclaredClassification | '')}>
            <option value="">— اختر —</option>
            {CLASSIFICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="decl-vat">القيمة والضريبة</label>
          <select id="decl-vat" value={vatInclusion} disabled={!canEdit || pending} onChange={(e) => setVatInclusion(e.target.value as DeclaredVatInclusion | '')}>
            <option value="">— اختر —</option>
            {VAT_INCLUSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p className="error-text" role="alert" data-state="error">
          {error}
          {failure?.requestId ? <span className="num"> · رقم الطلب {failure.requestId}</span> : null}
        </p>
      ) : null}
      {canEdit ? (
        <div className="modal-foot" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={submit} data-grant="contracts:edit">
            {pending ? 'جارٍ الحفظ…' : 'أعلن التصنيف'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
