import { BadRequestException } from '@nestjs/common';
import { FormItemType } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * ⚖️ **بنودُ إصدار القالب: تُطبَّع وتُفحص قبل أن تُكتب** (توجيه ٢٧٨ · `ق-١٦٣٤` · الموجة ١أ).
 *
 * دالّةٌ نقيّة واحدة يمرّ بها إنشاءُ القالب وتحريرُ مسوّدته، فلا يُكتب بندٌ لم يُفحص من أيّ مسار.
 * والقاعدةُ تحمل القيودَ نفسَها (`form_template_items_*` في الهجرة) — **وهذه رسالتُها المفهومة** (`CLAUDE.md §6.6`).
 */

/** ما له نطاقٌ مقبولٌ ووحدةُ قياس: العددُ والرقمُ والعدّادُ والحرارة. */
export const NUMERIC_ITEM_TYPES: ReadonlySet<FormItemType> = new Set<FormItemType>([
  FormItemType.QTY,
  FormItemType.NUMBER,
  FormItemType.METER_READING,
  FormItemType.TEMPERATURE,
]);

/**
 * ⚖️ **سلّمُ «الحالة» ثابتٌ للمنصّة** (`ق-١٦٤١`/٥ · مبنيٌّ أوّلاً بحكم `ق-١٦٤٥`/٣): جيّد · مقبول · تالف، والملاحظةُ معه.
 * والرمزُ هو ما يُخزَّن ويدخل بصمةَ الختم، والاسمُ العربيّ في الشاشة والمطبوع؛ والرموزُ رموزُ نموذج التسليم القائم نفسُها.
 */
export const CONDITION_SCALE = ['GOOD', 'FAIR', 'DAMAGED'] as const;
export type ConditionValue = (typeof CONDITION_SCALE)[number];
export const isConditionValue = (s: string | null | undefined): s is ConditionValue =>
  s !== null && s !== undefined && (CONDITION_SCALE as readonly string[]).includes(s);

/** قيمةُ بند «الحالة» كما تُكتب: من السلّم أو فارغة، وما سواهما يُردّ مسمّىً ببنده. */
export function conditionValueOf(label: string, text: string | null): ConditionValue | null {
  if (text === null) return null;
  if (!isConditionValue(text)) throw new BadRequestException(formatMessage(MSG.form_value_condition_scale, { label }));
  return text;
}

export interface TemplateItemInput {
  label: string;
  itemType: FormItemType;
  required?: boolean;
  minValue?: number | null;
  maxValue?: number | null;
  isBlocking?: boolean;
  unit?: string | null;
  helpText?: string | null;
}

/** البندُ كما يُكتب: مرقَّمٌ من ١ بترتيب الإرسال، والنصوصُ مشذّبة، والنطاقُ نصٌّ عشريّ. */
export interface TemplateItemRow {
  lineNo: number;
  label: string;
  itemType: FormItemType;
  required: boolean;
  minValue: string | null;
  maxValue: string | null;
  isBlocking: boolean;
  unit: string | null;
  helpText: string | null;
}

const blank = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

/** مفتاحُ المقارنة للتكرار: «قراءةُ العدّاد» و«  قراءةُ  العدّاد » بندٌ واحد. */
const labelKey = (label: string): string => label.trim().replace(/\s+/g, ' ').toLowerCase();

export function normalizeTemplateItems(items: readonly TemplateItemInput[]): TemplateItemRow[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const label = item.label.trim().replace(/\s+/g, ' ');
    const key = labelKey(label);
    if (seen.has(key)) throw new BadRequestException(formatMessage(MSG.form_template_item_label_duplicate, { label }));
    seen.add(key);

    const min = item.minValue ?? null;
    const max = item.maxValue ?? null;
    const unit = blank(item.unit);
    const isBlocking = item.isBlocking ?? false;
    const numeric = NUMERIC_ITEM_TYPES.has(item.itemType);

    if (!numeric && (min !== null || max !== null || unit !== null || isBlocking)) {
      throw new BadRequestException(formatMessage(MSG.form_template_item_range_not_numeric, { label }));
    }
    if (min !== null && max !== null && min > max) {
      throw new BadRequestException(formatMessage(MSG.form_template_item_range_unordered, { label }));
    }
    if (isBlocking && min === null && max === null) {
      throw new BadRequestException(formatMessage(MSG.form_template_item_blocking_without_range, { label }));
    }
    if (item.itemType === FormItemType.QTY && [min, max].some((v) => v !== null && !Number.isInteger(v))) {
      throw new BadRequestException(formatMessage(MSG.form_template_item_qty_whole, { label }));
    }

    return {
      lineNo: index + 1,
      label,
      itemType: item.itemType,
      required: item.required ?? false,
      minValue: min === null ? null : String(min),
      maxValue: max === null ? null : String(max),
      isBlocking,
      unit,
      helpText: blank(item.helpText),
    };
  });
}
