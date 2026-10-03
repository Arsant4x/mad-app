/**
 * ⚖️ **نسبةُ العقد المختلط** (السؤال ٤١٢ · ق-١٦٠٠: «نسبةٌ يعلنها المؤجّرُ بأساسه، ولا مساحةَ إلزامية») — حقولُها في الإنشاء
 * والتجديد وإعلان العقد القديم، فلا تُكتب ثلاثاً.
 *
 * عقدٌ واحدٌ يجمع جزءاً سكنيّاً معفى وجزءاً خاضعاً يُقسَّم داخلَه بما يعكس قيمتَهما، والمؤجّرُ مسؤولٌ عن التقسيم بنصّ الهيئة؛ فيُعلَن
 * نصيبُ المعفى بالمئة وأساسُه (المساحة · القيمةُ السوقية · …). والخادمُ يسمّي الناقص.
 */
export function MixedShareFields({
  idPrefix,
  percent,
  onPercent,
  basis,
  onBasis,
}: {
  idPrefix: string;
  percent: string;
  onPercent: (v: string) => void;
  basis: string;
  onBasis: (v: string) => void;
}) {
  return (
    <div className="two-col">
      <div className="field">
        <label htmlFor={`${idPrefix}-exempt-share`}>نصيب الجزء السكنيّ المعفى (٪)</label>
        <input id={`${idPrefix}-exempt-share`} className="num" type="number" min="0.01" max="99.99" step="0.01" value={percent} onChange={(e) => onPercent(e.target.value)} placeholder="مثال: 40" />
        <p className="hint" style={{ marginTop: 4 }}>الضريبةُ ١٥٪ على الباقي وحدَه، ويُقسَّم كلُّ قسطٍ بين الجزأين في الإقرار.</p>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-exempt-basis`}>أساس النسبة</label>
        <input id={`${idPrefix}-exempt-basis`} value={basis} onChange={(e) => onBasis(e.target.value)} placeholder="المساحة، أو القيمة السوقية، أو غيرهما" />
      </div>
    </div>
  );
}

/** ما يُرسل: للمختلط النسبةُ وأساسُها، ولغيره لا شيء (والخادمُ يردّ نسبةً على غير المختلط). */
export function mixedSharePayload(classification: string, percent: string, basis: string) {
  if (classification !== 'MIXED') return {};
  const p = Number(percent);
  return { ...(percent.trim() !== '' && Number.isFinite(p) ? { exemptSharePercent: p } : {}), ...(basis.trim() ? { exemptShareBasis: basis.trim() } : {}) };
}
