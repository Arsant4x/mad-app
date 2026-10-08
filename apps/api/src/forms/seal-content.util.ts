import { createHash } from 'node:crypto';

/**
 * ⚖️ **بصمةُ ختم السجلّ: على السجلّ كلِّه، وفيها بصمةُ الختم السابق** (توجيه ٢٧٨ · `ق-١٦٣٦` أ وب، بحكم صاحب المشروع).
 *
 * دالّةٌ نقيّة واحدة يمرّ بها الختمُ والتحقّقُ معاً، فلا يفترق ما خُتم عمّا يُتحقّق منه. والنصُّ **مرتّبُ المفاتيح ثابتُ الشكل**:
 * إصدارُ القالب ونوعُه والكيانُ المرتبط وقيمُ البنود بترتيب القالب ومن عبّأ ومن ختم ووقتُ الختم من الخادم، ورقمُ السجلّ وموضعُه في السلسلة
 * وبصمةُ الختم السابق — فبصمةٌ لا تشمل من ختم ومتى تقبل أن يُنسب السجلُّ لغير صاحبه بلا أن تتغيّر، وسلسلةٌ لا تدخل البصمةَ يُحذف منها
 * سجلٌّ فلا يُرى. وبصماتُ الصور تدخل مع موجة الأدلة (٢) بزيادة الصيغة لا بتغيير معناها.
 *
 * ⚠️ **وصيغةُ النصّ رقمٌ مختوم معه** (`format`): تغييرُ الشكل يرفع الرقمَ، والسجلُّ القديم يُتحقّق منه بصيغته.
 */
export const SEAL_FORMAT = 1;

/**
 * ⚖️ **الصيغة ٢** (`ق-١٦٧٠`، بحكم صاحب المشروع): ما في الصيغة ١ ومعه **التواقيعُ** على النسخة المختومة **ورقمُ النسخة ومعرّفُ سابقتها
 * وبصمةُ محتواها**؛ ورقمُ الصيغة عمودٌ في صفّ الختم (`FormSeal.format`)، فالمختومُ بالصيغة ١ يُتحقّق منه بصيغته ولا ينكسر.
 */
export const SEAL_FORMAT_SIGNED = 2;

export interface SealItemValue {
  lineNo: number;
  itemId: string;
  label: string;
  itemType: string;
  text: string | null;
  /** الرقمُ نصّاً كما يُخزَّن (`Decimal` مُطبَّعاً) — فلا يفترق عند إعادة القراءة. */
  number: string | null;
  bool: boolean | null;
  note: string | null;
}

/** التوقيعُ كما يدخل البصمة: ما في صفّه إلا مفاتيحَ المخزن ومراجعَ الشبكة (والجوالُ مقنَّعٌ وبصمتُه، `ق-١٦٦٨`). */
export interface SealSignature {
  role: string;
  level: string;
  channel: string;
  signerName: string;
  signerCustomerId: string | null;
  signerKind: string | null;
  signerUserId: string | null;
  mobileMasked: string | null;
  mobileIndex: string | null;
  evidenceSha256: string | null;
  signedContentHash: string;
  witnessUserId: string | null;
  /** `ISO` بالمللي ثانية كما يُخزَّن. */
  signedAt: string;
  /**
   * ⚖️ سندُ الممثّل (توجيه ٢٨٧ ⑥): نوعُه ورقمُه وبصمةُ صورته وحكمُ التحقّق — **يُكتب حين يوجد وحدَه**، فبصمةُ ما لا ممثّلَ فيه لا تتغيّر.
   */
  authority?: { type: string; ref: string; evidenceSha256: string | null; verification: string | null };
}

/** النسخةُ في مجموعتها، وبصمةُ محتوى السابقة لحظةَ وقّعها الموظّف — فلا تُحذف جولةٌ ولا تُدسّ. */
export interface SealRevision {
  no: number;
  groupId: string;
  previousId: string | null;
  previousContentHash: string | null;
}

export interface SealContent {
  companyId: string;
  instanceId: string;
  no: string;
  sealSeq: number;
  prevHash: string | null;
  /** `YYYY-MM-DD` */
  formDate: string;
  template: { id: string; familyId: string; version: number; name: string };
  formTypeCode: string;
  linkedEntity: { type: string; id: string };
  items: SealItemValue[];
  filledBy: { id: string; name: string };
  sealedBy: { id: string; name: string };
  /** وقتُ الختم من الخادم، `ISO` بالمللي ثانية كما يُخزَّن. */
  sealedAt: string;
  /** الصيغة ٢ وحدَها. */
  signatures?: SealSignature[];
  revision?: SealRevision;
}

/** ما يوقّع عليه الموقّع: محتوى النسخة بلا ختمها (`ق-١٦٦٨`: «بصمةُ ما وُقّع عليه»). */
export interface SignableContent {
  companyId: string;
  instanceId: string;
  formDate: string;
  template: { id: string; familyId: string; version: number; name: string };
  formTypeCode: string;
  linkedEntity: { type: string; id: string };
  items: SealItemValue[];
  filledBy: { id: string; name: string };
  revision: { no: number; groupId: string; previousId: string | null };
}

/** نصٌّ ثابت: المفاتيحُ مرتّبةٌ في كلِّ مستوى، والمصفوفاتُ بترتيبها. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

const byRole = (a: SealSignature, b: SealSignature) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0);

/**
 * بصمةُ السجلّ: `SHA-256` بالست عشريّ على النصّ الثابت، والبنودُ بترتيب القالب أيّاً كان ترتيبُ تمريرها. **والصيغةُ ١ بحرفها** (بلا تواقيع
 * ولا نسخة) فالمختومُ قبل الصيغة ٢ يعيد بصمتَه نفسَها، **والصيغةُ ٢** تشترط التواقيعَ والنسخة.
 */
export function sealHash(content: SealContent, format: number = SEAL_FORMAT): string {
  const items = [...content.items].sort((a, b) => a.lineNo - b.lineNo);
  if (format === SEAL_FORMAT) {
    const { signatures: _s, revision: _r, ...v1 } = content;
    return createHash('sha256').update(canonicalJson({ format: SEAL_FORMAT, ...v1, items }), 'utf8').digest('hex');
  }
  if (format !== SEAL_FORMAT_SIGNED || !content.signatures?.length || !content.revision) throw new Error(`صيغةُ بصمةٍ غيرُ معروفة أو ناقصة: ${format}`);
  const signatures = [...content.signatures].sort(byRole);
  return createHash('sha256').update(canonicalJson({ format, ...content, items, signatures }), 'utf8').digest('hex');
}

/** بصمةُ محتوى النسخة — يقابلها كلُّ توقيعٍ بما وُقّع عليه، فتوقيعٌ على نصٍّ تغيّر بعده يُرى. */
export function signableHash(content: SignableContent): string {
  const items = [...content.items].sort((a, b) => a.lineNo - b.lineNo);
  return createHash('sha256').update(canonicalJson({ kind: 'form-content', format: 1, ...content, items }), 'utf8').digest('hex');
}
