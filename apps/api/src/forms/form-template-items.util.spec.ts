import { BadRequestException } from '@nestjs/common';
import { FormItemType } from '@mad-app/db';
import { MSG } from '../common/i18n/messages';
import { CONDITION_SCALE, conditionValueOf, isConditionValue, normalizeTemplateItems } from './form-template-items.util';

/** المفتاحُ الذي رُمي به — `formatMessage` يُلحق بالمفتاح وسائطَه بعد فاصل. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof BadRequestException) return String(e.message).split(/[^a-z_.]/)[0];
    throw e;
  }
  throw new Error('لم يُرفض');
}

describe('بنودُ إصدار القالب تُطبَّع وتُفحص قبل أن تُكتب (توجيه ٢٧٨ · ق-١٦٣٤)', () => {
  it('① ترقيمٌ من ١ بترتيب الإرسال، والنصوصُ مشذّبة، والنطاقُ نصٌّ', () => {
    const rows = normalizeTemplateItems([
      { label: '  قراءةُ   عدّاد الكهرباء ', itemType: FormItemType.METER_READING, required: true, unit: ' ك.و.س ' },
      { label: 'حرارةُ الثلاجة', itemType: FormItemType.TEMPERATURE, minValue: 2, maxValue: 8, isBlocking: true, unit: '°م' },
      { label: 'حالةُ الخزائن', itemType: FormItemType.CONDITION, helpText: '   ' },
    ]);
    expect(rows.map((r) => r.lineNo)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ label: 'قراءةُ عدّاد الكهرباء', required: true, unit: 'ك.و.س', minValue: null, isBlocking: false });
    expect(rows[1]).toMatchObject({ minValue: '2', maxValue: '8', isBlocking: true });
    expect(rows[2]).toMatchObject({ required: false, unit: null, helpText: null });
  });

  it('② البندُ المكرَّر يُرفض ولو اختلفت مسافاتُه', () => {
    expect(
      refusal(() =>
        normalizeTemplateItems([
          { label: 'عددُ المفاتيح', itemType: FormItemType.QTY },
          { label: ' عددُ  المفاتيح', itemType: FormItemType.QTY },
        ]),
      ),
    ).toBe(MSG.form_template_item_label_duplicate);
  });

  it('③ النطاقُ والوحدةُ والمنعُ للبنود الرقمية وحدَها', () => {
    expect(refusal(() => normalizeTemplateItems([{ label: 'ملاحظة', itemType: FormItemType.TEXT, unit: 'م' }]))).toBe(MSG.form_template_item_range_not_numeric);
    expect(refusal(() => normalizeTemplateItems([{ label: 'تعمل؟', itemType: FormItemType.BOOLEAN, minValue: 0 }]))).toBe(MSG.form_template_item_range_not_numeric);
  });

  it('④ الحدُّ الأدنى لا يعلو الأعلى، والمنعُ بلا نطاقٍ مرفوض، وحدّا العدد صحيحان', () => {
    expect(refusal(() => normalizeTemplateItems([{ label: 'حرارة', itemType: FormItemType.TEMPERATURE, minValue: 8, maxValue: 2 }]))).toBe(
      MSG.form_template_item_range_unordered,
    );
    expect(refusal(() => normalizeTemplateItems([{ label: 'قراءة', itemType: FormItemType.NUMBER, isBlocking: true }]))).toBe(
      MSG.form_template_item_blocking_without_range,
    );
    expect(refusal(() => normalizeTemplateItems([{ label: 'مفاتيح', itemType: FormItemType.QTY, minValue: 1.5 }]))).toBe(MSG.form_template_item_qty_whole);
    // وحدٌّ واحدٌ يكفي للمنع، والمتساويان نطاقٌ صحيح.
    expect(normalizeTemplateItems([{ label: 'ضغط', itemType: FormItemType.NUMBER, maxValue: 3, isBlocking: true }])[0].isBlocking).toBe(true);
    expect(normalizeTemplateItems([{ label: 'عدد', itemType: FormItemType.QTY, minValue: 3, maxValue: 3 }])[0].minValue).toBe('3');
  });
});

describe('سلّمُ «الحالة» ثابتٌ للمنصّة: جيّد · مقبول · تالف (ق-١٦٤١/٥)', () => {
  it('⭐ القيمةُ من السلّم أو فارغة، والنصُّ الحرّ يُردّ ببنده', () => {
    expect(CONDITION_SCALE).toEqual(['GOOD', 'FAIR', 'DAMAGED']);
    for (const c of CONDITION_SCALE) expect(conditionValueOf('حالةُ الخزائن', c)).toBe(c);
    expect(conditionValueOf('حالةُ الخزائن', null)).toBeNull();
    expect(refusal(() => conditionValueOf('حالةُ الخزائن', 'مقبول'))).toBe(MSG.form_value_condition_scale);
    expect(refusal(() => conditionValueOf('حالةُ الخزائن', 'good'))).toBe(MSG.form_value_condition_scale);
    expect(refusal(() => conditionValueOf('حالةُ الخزائن', 'MISSING'))).toBe(MSG.form_value_condition_scale);
    expect(isConditionValue(undefined)).toBe(false);
  });
});
