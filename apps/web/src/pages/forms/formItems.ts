import type { FormInstanceItem, FormItemInput, FormItemType, FormTemplateItem, FormValueInput } from '../../api/forms';
import { dfmt, toLocalISODate } from '../../lib/format';

/** العقدُ كما يُعرض في رأس السجلّ ومطبوعه. */
export interface FormContractRef {
  id: string;
  no: string;
  tenant: string;
  unitNo: string;
  propertyName: string;
}

/** وقتُ الختم بساعة الجهاز: يومٌ وساعةٌ ودقيقة. */
export function dateTimeText(iso: string): string {
  const d = new Date(iso);
  return `${dfmt(toLocalISODate(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** قرارُ الخطّة ٣٧: يظهر في التعبئة وفي المطبوع، ولا زرَّ يوحي بإرسالٍ إلى إيجار (قرارُ الخطّة ٤٨). */
export const EJAR_COMPLEMENT_NOTE = 'هذا النموذجُ مكمّلٌ لنموذج إيجار ولا يحلّ محلّه.';

/**
 * بنودُ النماذج في الواجهة: أسماءُ الأنواع، وتحويلُ البند بين صفّ الخادم ومسوّدةِ التحرير، والقيمةُ بين حقل الإدخال وجسم الطلب.
 *
 * ⚠️ **الخادمُ يحكم** (`form-template-items.util.ts` و`form-instances.service.ts`): ما هنا يُعِدّ الجسمَ بشكله ويُسقط ما لا يخصّ
 * النوعَ كي لا يُرسل حقلاً يرفضه، ولا يكرّر قواعدَ الخادم (التكرار · ترتيبُ النطاق · المانعُ بلا نطاق) — فرسالتُه هي ما يُعرض.
 */

export const ITEM_TYPES: readonly FormItemType[] = ['CONDITION', 'QTY', 'NUMBER', 'METER_READING', 'TEMPERATURE', 'BOOLEAN', 'TEXT'];

export const ITEM_TYPE_LABELS: Record<FormItemType, string> = {
  CONDITION: 'حالة',
  QTY: 'عدد',
  NUMBER: 'رقم',
  METER_READING: 'قراءةُ عدّاد',
  TEMPERATURE: 'حرارة',
  BOOLEAN: 'نعم أو لا',
  TEXT: 'نصّ',
};

/** ما له نطاقٌ ووحدة، كـ`NUMERIC_ITEM_TYPES` في الخادم. */
export const NUMERIC_TYPES: ReadonlySet<FormItemType> = new Set<FormItemType>(['QTY', 'NUMBER', 'METER_READING', 'TEMPERATURE']);

/** بندٌ كما يُحرَّر: الأرقامُ نصوصُ حقولٍ تُقرأ عند الحفظ. */
export interface ItemDraft {
  label: string;
  itemType: FormItemType;
  required: boolean;
  minValue: string;
  maxValue: string;
  isBlocking: boolean;
  unit: string;
  helpText: string;
}

export const emptyItemDraft = (): ItemDraft => ({
  label: '',
  itemType: 'CONDITION',
  required: false,
  minValue: '',
  maxValue: '',
  isBlocking: false,
  unit: '',
  helpText: '',
});

export function itemDraftOf(item: FormTemplateItem): ItemDraft {
  return {
    label: item.label,
    itemType: item.itemType,
    required: item.required,
    minValue: item.minValue ?? '',
    maxValue: item.maxValue ?? '',
    isBlocking: item.isBlocking,
    unit: item.unit ?? '',
    helpText: item.helpText ?? '',
  };
}

const numberOf = (s: string): number | undefined => {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

/**
 * المسوّدةُ جسماً للخادم. وغيرُ الرقميّ يُسقط نطاقَه ووحدتَه ومانعَه (تغييرُ النوع يُبقيها في الحقول ولا يُرسلها)،
 * ورقمٌ لا يُقرأ يُردّ برسالةٍ هنا لأن الخادمَ لا يرى النصَّ الذي كتبه المستخدم.
 */
export function itemInputOf(d: ItemDraft): { input: FormItemInput } | { error: string } {
  const label = d.label.trim();
  if (!label) return { error: 'لكلِّ بندٍ اسمٌ يُكتب.' };
  const base: FormItemInput = { label, itemType: d.itemType, required: d.required };
  if (d.helpText.trim()) base.helpText = d.helpText.trim();
  if (!NUMERIC_TYPES.has(d.itemType)) return { input: base };
  const min = numberOf(d.minValue);
  const max = numberOf(d.maxValue);
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: `نطاقُ «${label}» يُكتب أرقاماً.` };
  if (min !== undefined) base.minValue = min;
  if (max !== undefined) base.maxValue = max;
  if (d.unit.trim()) base.unit = d.unit.trim();
  if (d.isBlocking) base.isBlocking = true;
  return { input: base };
}

export function itemInputsOf(drafts: readonly ItemDraft[]): { items: FormItemInput[] } | { error: string } {
  const items: FormItemInput[] = [];
  for (const d of drafts) {
    const r = itemInputOf(d);
    if ('error' in r) return r;
    items.push(r.input);
  }
  return { items };
}

/** قيمةُ البند كما تُحرَّر في السجلّ. */
export interface ValueDraft {
  text: string;
  number: string;
  bool: '' | 'yes' | 'no';
  note: string;
}

export function valueDraftOf(item: FormInstanceItem): ValueDraft {
  return {
    text: item.text ?? '',
    number: item.number ?? '',
    bool: item.bool === null ? '' : item.bool ? 'yes' : 'no',
    note: item.note ?? '',
  };
}

/** القيمةُ جسماً للخادم بنوع بندها: الفارغُ يُفرغ الحقلَ (`null`)، والرقمُ الذي لا يُقرأ يُردّ برسالة. */
export function valueInputOf(item: FormInstanceItem, v: ValueDraft): { input: FormValueInput } | { error: string } {
  const note = v.note.trim() ? v.note.trim() : null;
  if (item.itemType === 'BOOLEAN') {
    return { input: { itemId: item.itemId, bool: v.bool === '' ? null : v.bool === 'yes', note } };
  }
  if (NUMERIC_TYPES.has(item.itemType)) {
    const n = numberOf(v.number);
    if (Number.isNaN(n)) return { error: `«${item.label}» يُكتب رقماً.` };
    return { input: { itemId: item.itemId, number: n === undefined ? null : n, note } };
  }
  return { input: { itemId: item.itemId, text: v.text.trim() ? v.text.trim() : null, note } };
}

/** هل تغيّرت القيمةُ عمّا حُفظ؟ — فلا يُرسل إلا ما تغيّر. */
export function valueChanged(item: FormInstanceItem, v: ValueDraft): boolean {
  const saved = valueDraftOf(item);
  return saved.text !== v.text || saved.number !== v.number || saved.bool !== v.bool || saved.note !== v.note;
}

/** القيمةُ مقروءةً للعرض والطباعة. */
export function valueText(item: FormInstanceItem): string {
  if (item.itemType === 'BOOLEAN') return item.bool === null ? '' : item.bool ? 'نعم' : 'لا';
  if (NUMERIC_TYPES.has(item.itemType)) return item.number === null ? '' : item.unit ? `${item.number} ${item.unit}` : item.number;
  return item.text ?? '';
}
