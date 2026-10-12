import type { FormInstanceItem, FormItemInput, FormItemType, FormTemplateItem, FormValueInput } from '../../api/forms';
import i18n from '../../i18n';
import { dfmt, toLocalISODate } from '../../lib/format';

/** The contract as shown in the record header and its printout. */
export interface FormContractRef {
  id: string;
  no: string;
  tenant: string;
  unitNo: string;
  propertyName: string;
}

/** Seal time on the device clock: day, hour and minute. */
export function dateTimeText(iso: string): string {
  const d = new Date(iso);
  return `${dfmt(toLocalISODate(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Form items in the interface: type names, conversion between the server row and
 * the editing draft, and between the input value and the request body.
 *
 * The server decides (form-template-items.util.ts and form-instances.service.ts):
 * this only shapes the body and drops fields that do not belong to the type so
 * nothing is sent that the server rejects. Server rules (duplicates, range order,
 * blocking without a range) are not repeated here; its message is what shows.
 */

export const ITEM_TYPES: readonly FormItemType[] = ['CONDITION', 'QTY', 'NUMBER', 'METER_READING', 'TEMPERATURE', 'BOOLEAN', 'TEXT'];

/** Labels read through translation on access, so a language switch shows the new text. */
function labels<K extends string>(prefix: string, codes: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const code of codes) {
    Object.defineProperty(out, code, { enumerable: true, get: () => i18n.t(`forms.${prefix}.${code.toLowerCase()}`) });
  }
  return out;
}

export const ITEM_TYPE_LABELS: Record<FormItemType, string> = labels('item_type', ITEM_TYPES);

/**
 * The platform's fixed condition scale, matching CONDITION_SCALE on the server:
 * the code is sent and stored, the name is shown and printed.
 */
export const CONDITION_SCALE = ['GOOD', 'FAIR', 'DAMAGED'] as const;
export type ConditionValue = (typeof CONDITION_SCALE)[number];
export const CONDITION_LABELS: Record<ConditionValue, string> = labels('condition', CONDITION_SCALE);
export const isConditionValue = (s: string | null | undefined): s is ConditionValue =>
  s !== null && s !== undefined && (CONDITION_SCALE as readonly string[]).includes(s);

/** Types that carry a range and a unit, matching NUMERIC_ITEM_TYPES on the server. */
export const NUMERIC_TYPES: ReadonlySet<FormItemType> = new Set<FormItemType>(['QTY', 'NUMBER', 'METER_READING', 'TEMPERATURE']);

/** An item as edited: numbers are field text read on save. */
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
 * The draft as a server body. A non-numeric type drops its range, unit and
 * blocking flag (changing the type keeps them in the fields but does not send
 * them), and an unreadable number is answered here because the server never sees
 * the text the user typed.
 */
export function itemInputOf(d: ItemDraft): { input: FormItemInput } | { error: string } {
  const label = d.label.trim();
  if (!label) return { error: i18n.t('forms.items.error_label_required') };
  const base: FormItemInput = { label, itemType: d.itemType, required: d.required };
  if (d.helpText.trim()) base.helpText = d.helpText.trim();
  if (!NUMERIC_TYPES.has(d.itemType)) return { input: base };
  const min = numberOf(d.minValue);
  const max = numberOf(d.maxValue);
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: i18n.t('forms.items.error_range_numbers', { label }) };
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

/** An item value as edited in the record. */
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

/** The value as a server body for its item type: empty clears the field (null), an unreadable number is answered with a message. */
export function valueInputOf(item: FormInstanceItem, v: ValueDraft): { input: FormValueInput } | { error: string } {
  const note = v.note.trim() ? v.note.trim() : null;
  if (item.itemType === 'BOOLEAN') {
    return { input: { itemId: item.itemId, bool: v.bool === '' ? null : v.bool === 'yes', note } };
  }
  if (NUMERIC_TYPES.has(item.itemType)) {
    const n = numberOf(v.number);
    if (Number.isNaN(n)) return { error: i18n.t('forms.items.error_value_number', { label: item.label }) };
    return { input: { itemId: item.itemId, number: n === undefined ? null : n, note } };
  }
  return { input: { itemId: item.itemId, text: v.text.trim() ? v.text.trim() : null, note } };
}

/** Whether the value differs from what was saved, so only changes are sent. */
export function valueChanged(item: FormInstanceItem, v: ValueDraft): boolean {
  const saved = valueDraftOf(item);
  return saved.text !== v.text || saved.number !== v.number || saved.bool !== v.bool || saved.note !== v.note;
}

/** The value as read for display and print; a condition by its scale name, and text filled before the scale shown as is. */
export function valueText(item: FormInstanceItem): string {
  if (item.itemType === 'BOOLEAN') return item.bool === null ? '' : item.bool ? i18n.t('forms.items.yes') : i18n.t('forms.items.no');
  if (item.itemType === 'CONDITION') return isConditionValue(item.text) ? CONDITION_LABELS[item.text] : (item.text ?? '');
  if (NUMERIC_TYPES.has(item.itemType)) return item.number === null ? '' : item.unit ? `${item.number} ${item.unit}` : item.number;
  return item.text ?? '';
}
