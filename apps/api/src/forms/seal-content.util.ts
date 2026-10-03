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

/** بصمةُ السجلّ: `SHA-256` بالست عشريّ على النصّ الثابت، والبنودُ بترتيب القالب أيّاً كان ترتيبُ تمريرها. */
export function sealHash(content: SealContent): string {
  const items = [...content.items].sort((a, b) => a.lineNo - b.lineNo);
  return createHash('sha256').update(canonicalJson({ format: SEAL_FORMAT, ...content, items }), 'utf8').digest('hex');
}
