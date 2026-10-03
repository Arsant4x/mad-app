/**
 * ⚖️ **من المؤجّر في العقد** (السؤال ٥٧٧ · ق-١٦٠٠) — حقولُه في التجديد وفي إعلان العقد القديم، فلا تُكتب مرّتين.
 *
 * يُعلَن على عقار التشغيل ولا يُفترض: المنشأةُ مؤجّرةً فالإيجارُ إيرادُها وضريبةُ التجاريّ عليها، أو المالكُ مؤجّراً
 * والمنشأةُ وكيلُه فالإيجارُ أمانةٌ له وعمولتُها إيرادُها بضريبتها. والخادمُ يتحقّق من الشروط كلِّها ويسمّي الناقص.
 */
export type DeclaredLessorChoice = 'COMPANY' | 'OWNER' | '';

export function LessorFields({
  idPrefix,
  lessor,
  onLessor,
  ownerName,
  onOwnerName,
  ownerVatNumber,
  onOwnerVatNumber,
  commercial,
}: {
  idPrefix: string;
  lessor: DeclaredLessorChoice;
  onLessor: (v: DeclaredLessorChoice) => void;
  ownerName: string;
  onOwnerName: (v: string) => void;
  ownerVatNumber: string;
  onOwnerVatNumber: (v: string) => void;
  commercial: boolean;
}) {
  return (
    <div className="two-col">
      <div className="field">
        <label htmlFor={`${idPrefix}-lessor`}>من المؤجّر في العقد؟</label>
        <select id={`${idPrefix}-lessor`} value={lessor} onChange={(e) => onLessor(e.target.value as DeclaredLessorChoice)}>
          <option value="">— اختر —</option>
          <option value="COMPANY">المنشأة: وقّعت العقدَ باسمها مؤجّرة</option>
          <option value="OWNER">مالكُ العقار: والمنشأةُ وكيلُه تحصّل عنه بعمولة</option>
        </select>
        {lessor === 'OWNER' && (
          <p className="hint" style={{ marginTop: 4 }}>
            الإيجارُ أمانةٌ للمالك لا إيراد، <b>والعمولةُ إيرادُ المنشأة وعليها ضريبة ١٥٪ دائماً</b>.
          </p>
        )}
      </div>
      {lessor === 'OWNER' && (
        <div className="field">
          <label htmlFor={`${idPrefix}-owner-name`}>اسم المالك</label>
          <input id={`${idPrefix}-owner-name`} value={ownerName} onChange={(e) => onOwnerName(e.target.value)} placeholder="له يُدفع ما يُقبض" />
          <label htmlFor={`${idPrefix}-owner-vat`} style={{ marginTop: 6 }}>
            الرقم الضريبيّ للمالك{commercial ? '' : ' (إن كان مسجَّلاً)'}
          </label>
          <input id={`${idPrefix}-owner-vat`} className="num" value={ownerVatNumber} onChange={(e) => onOwnerVatNumber(e.target.value)} placeholder="3xxxxxxxxxxxxx3" />
        </div>
      )}
    </div>
  );
}

/** ما يُرسل من الحقول — حين لا مؤجّرَ مختار لا يُرسل شيء (والخادمُ يسمّي الناقص على عقار التشغيل). */
export function lessorPayload(lessor: DeclaredLessorChoice, ownerName: string, ownerVatNumber: string) {
  if (!lessor) return {};
  if (lessor === 'COMPANY') return { lessor };
  return { lessor, ownerName: ownerName.trim(), ownerVatNumber: ownerVatNumber.trim() || undefined };
}
