import { canonicalJson, sealHash, type SealContent } from './seal-content.util';

const base: SealContent = {
  companyId: 'co-1',
  instanceId: 'fi-1',
  no: 'FRM-2026-0001',
  sealSeq: 1,
  prevHash: null,
  formDate: '2026-10-04',
  template: { id: 't-1', familyId: 't-1', version: 2, name: 'تسليمُ وحدة' },
  formTypeCode: 'UNIT_HANDOVER',
  subject: { type: 'contract', id: 'c-1' },
  items: [
    { lineNo: 1, itemId: 'i-1', label: 'قراءةُ العدّاد', itemType: 'METER_READING', text: null, number: '48213', bool: null, note: null },
    { lineNo: 2, itemId: 'i-2', label: 'حالةُ الخزائن', itemType: 'CONDITION', text: 'مقبول', number: null, bool: null, note: 'خدشٌ في الباب' },
  ],
  filledBy: { id: 'u-1', name: 'salem' },
  sealedBy: { id: 'u-1', name: 'salem' },
  sealedAt: '2026-10-04T10:15:00.000Z',
};

describe('بصمةُ ختم السجلّ على السجلّ كلِّه وفيها بصمةُ السابق (توجيه ٢٧٨ · ق-١٦٣٦)', () => {
  it('① النصُّ ثابتٌ بترتيب المفاتيح أيّاً كان ترتيبُها في الكائن', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe('{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
  });

  it('② البصمةُ أربعٌ وستون خانةً ست عشرية، وثابتةٌ لمحتوىً واحد ولو مرّت البنودُ بترتيبٍ آخر', () => {
    const h = sealHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sealHash({ ...base, items: [...base.items].reverse() })).toBe(h);
  });

  it('③ كلُّ ما في السجلّ يغيّرها: قيمةٌ · ملاحظة · من ختم · وقتُ الختم · الإصدار · الموضوع · الرقم · وبصمةُ السابق', () => {
    const h = sealHash(base);
    const variants: SealContent[] = [
      { ...base, items: [{ ...base.items[0], number: '48214' }, base.items[1]] },
      { ...base, items: [base.items[0], { ...base.items[1], note: null }] },
      { ...base, sealedBy: { id: 'u-2', name: 'other' } },
      { ...base, sealedAt: '2026-10-04T10:15:00.001Z' },
      { ...base, template: { ...base.template, version: 3 } },
      { ...base, subject: { type: 'contract', id: 'c-2' } },
      { ...base, no: 'FRM-2026-0002' },
      { ...base, sealSeq: 2, prevHash: 'a'.repeat(64) },
    ];
    for (const v of variants) expect(sealHash(v)).not.toBe(h);
  });
});
