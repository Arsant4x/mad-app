import { describe, expect, it, vi } from 'vitest';
import type { FormInstanceItem } from '../../api/forms';
import {
  CONDITION_LABELS,
  CONDITION_SCALE,
  emptyItemDraft,
  isConditionValue,
  itemInputOf,
  itemInputsOf,
  valueChanged,
  valueDraftOf,
  valueInputOf,
  valueText,
} from './formItems';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): دوالُّ نقيّةٌ بلا تصيير، فالافتراضيُّ نفسُه.
vi.setConfig({ testTimeout: 5_000 });

const item = (over: Partial<FormInstanceItem>): FormInstanceItem => ({
  itemId: 'i1',
  lineNo: 1,
  label: 'قراءةُ العدّاد',
  itemType: 'METER_READING',
  required: true,
  minValue: null,
  maxValue: null,
  isBlocking: false,
  unit: null,
  helpText: null,
  text: null,
  number: null,
  bool: null,
  note: null,
  outOfRange: false,
  ...over,
});

describe('بنودُ القالب: المسوّدةُ جسماً للخادم (ق-١٦٣٨ · الموجة ١ب)', () => {
  it('الرقميُّ يحمل نطاقَه ووحدتَه ومانعَه أرقاماً', () => {
    const r = itemInputOf({ ...emptyItemDraft(), label: ' حرارةُ الثلاجة ', itemType: 'TEMPERATURE', minValue: '2', maxValue: '8', unit: '°م', isBlocking: true });
    expect(r).toEqual({ input: { label: 'حرارةُ الثلاجة', itemType: 'TEMPERATURE', required: false, minValue: 2, maxValue: 8, unit: '°م', isBlocking: true } });
  });

  it('⭐ وغيرُ الرقميّ يُسقط ما بقي في حقوله من نطاقٍ ووحدةٍ ومانع (فالخادمُ يردّه)', () => {
    const r = itemInputOf({ ...emptyItemDraft(), label: 'حالةُ الخزائن', itemType: 'CONDITION', minValue: '1', maxValue: '3', unit: 'x', isBlocking: true });
    expect(r).toEqual({ input: { label: 'حالةُ الخزائن', itemType: 'CONDITION', required: false } });
  });

  it('واسمٌ فارغٌ أو نطاقٌ لا يُقرأ رقماً يُردّ برسالةٍ هنا', () => {
    expect(itemInputOf({ ...emptyItemDraft(), label: '  ' })).toEqual({ error: 'لكلِّ بندٍ اسمٌ يُكتب.' });
    expect(itemInputsOf([{ ...emptyItemDraft(), label: 'العدد', itemType: 'QTY', minValue: 'ثلاثة' }])).toEqual({ error: 'نطاقُ «العدد» يُكتب أرقاماً.' });
  });
});

describe('قيمُ السجلّ: الحقلُ جسماً للخادم بنوع بنده (الموجة ١د)', () => {
  it('الرقميُّ رقمٌ، والفارغُ يُفرغ، وما لا يُقرأ يُردّ', () => {
    const m = item({});
    expect(valueInputOf(m, { ...valueDraftOf(m), number: '48213' })).toEqual({ input: { itemId: 'i1', number: 48213, note: null } });
    expect(valueInputOf(m, { ...valueDraftOf(m), number: '' })).toEqual({ input: { itemId: 'i1', number: null, note: null } });
    expect(valueInputOf(m, { ...valueDraftOf(m), number: 'كثير' })).toEqual({ error: '«قراءةُ العدّاد» يُكتب رقماً.' });
  });

  it('النصُّ مشذّباً والملاحظةُ معه، ونعم أو لا قيمةٌ منطقية', () => {
    const c = item({ itemType: 'CONDITION', label: 'الحالة' });
    expect(valueInputOf(c, { ...valueDraftOf(c), text: 'FAIR', note: ' خدش ' })).toEqual({ input: { itemId: 'i1', text: 'FAIR', note: 'خدش' } });
    const b = item({ itemType: 'BOOLEAN', label: 'المفاتيح' });
    expect(valueInputOf(b, { ...valueDraftOf(b), bool: 'no' })).toEqual({ input: { itemId: 'i1', bool: false, note: null } });
  });

  it('لا يُرسل إلا ما تغيّر، وتُقرأ القيمةُ بوحدتها', () => {
    const m = item({ number: '5', unit: '°م' });
    expect(valueChanged(m, valueDraftOf(m))).toBe(false);
    expect(valueChanged(m, { ...valueDraftOf(m), number: '6' })).toBe(true);
    expect(valueText(m)).toBe('5 °م');
    expect(valueText(item({ itemType: 'BOOLEAN', bool: true }))).toBe('نعم');
  });

  it('«الحالة» من السلّم الثابت تُقرأ باسمها، وما عُبّئ قبله نصّاً يُعرض كما هو (ق-١٦٤١/٥)', () => {
    expect(CONDITION_SCALE).toEqual(['GOOD', 'FAIR', 'DAMAGED']);
    expect(CONDITION_SCALE.map((c) => CONDITION_LABELS[c])).toEqual(['جيّد', 'مقبول', 'تالف']);
    expect(valueText(item({ itemType: 'CONDITION', text: 'DAMAGED' }))).toBe('تالف');
    expect(valueText(item({ itemType: 'CONDITION', text: 'خدشٌ قديم' }))).toBe('خدشٌ قديم');
    expect(isConditionValue('FAIR')).toBe(true);
    expect(isConditionValue('مقبول')).toBe(false);
  });
});
