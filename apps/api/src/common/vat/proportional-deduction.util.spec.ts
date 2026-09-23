import { annualSettlement, applyProportionalDeduction, proportionalRatio, type InputVatBuckets } from './proportional-deduction.util';

const buckets = (b: Partial<InputVatBuckets>): InputVatBuckets => ({ taxableOnly: 0, exemptOnly: 0, mixed: 0, legacyUnassigned: 0, legacyCount: 0, ...b });

describe('⑥A1 — الخصمُ النسبيّ لضريبة المدخلات (م٥١)', () => {
  it('① الكسرُ خاضعٌ ÷ (خاضعٌ + معفى) — والصفرُ نسبةٌ لا إعفاء فيدخل البسط', () => {
    expect(proportionalRatio(750, 250)).toBe(0.75);
    expect(proportionalRatio(1000, 0)).toBe(1);
    expect(proportionalRatio(0, 1000)).toBe(0);
    // ثلثان — ستُّ خاناتٍ كما يخزّنها العمود، فلا تفترق المحسوبةُ عن المخزَّنة.
    expect(proportionalRatio(2000, 1000)).toBe(0.666667);
  });

  it('② ⚠️ مقامٌ صفرٌ ليس نسبةَ صفر — لا توريداتِ أصلاً ⟵ لا نسبة، ولا يُخترع رقم', () => {
    expect(proportionalRatio(0, 0)).toBeNull();
    // ولو أُعيدت صفراً لصار كلُّ مدخلٍ مشتركٍ غيرَ قابلٍ للخصم في منشأةٍ لم تبِع بعد.
    expect(applyProportionalDeduction(buckets({ mixed: 100 }), 0).deductible).toBe(0);
  });

  it('③ المنسوبُ حصراً لا تمسّه النسبة — في الاتجاهين', () => {
    const r = applyProportionalDeduction(buckets({ taxableOnly: 300, exemptOnly: 200 }), 0.5);
    expect(r.deductible).toBe(300);
    expect(r.nonDeductible).toBe(200);
    expect(r.apportionedBase).toBe(0);
  });

  it('④ ⚠️ النسبةُ تُضرب في المشترك وحدَه لا في المدخلات كلِّها — وهو أشيعُ ما يُخطأ فيه', () => {
    const r = applyProportionalDeduction(buckets({ taxableOnly: 100, exemptOnly: 50, mixed: 200 }), 0.75);
    // الصوابُ: 100 + (200 × 0.75) = 250. والخطأُ الشائع: (100+50+200) × 0.75 = 262.50.
    expect(r.deductible).toBe(250);
    expect(r.deductible).not.toBe(262.5);
    expect(r.nonDeductible).toBe(100); // 50 معفى + 50 من المشترك
  });

  it('⑤ ما سبق البناء يقف مع المشترك — «لا خصمَ كاملاً بلا إسناد» (ق-٨٢٤/①)', () => {
    const r = applyProportionalDeduction(buckets({ legacyUnassigned: 400 }), 0.25);
    expect(r.apportionedBase).toBe(400);
    expect(r.deductible).toBe(100);
    expect(r.nonDeductible).toBe(300);
    // وفي منشأةٍ خاضعةٍ وحدَها (النسبة 1) لا يضرّه غيابُ الإسناد — يُخصم كاملاً بحقّه.
    expect(applyProportionalDeduction(buckets({ legacyUnassigned: 400 }), 1).deductible).toBe(400);
  });

  it('⑥ الشقّان يستويان بالمجموع مهما كانت النسبة — لا هللةَ تبقى', () => {
    for (const ratio of [0.333333, 0.666667, 0.123456, 0.999999]) {
      const b = buckets({ taxableOnly: 33.33, exemptOnly: 11.11, mixed: 77.77, legacyUnassigned: 5.55 });
      const r = applyProportionalDeduction(b, ratio);
      expect(r.deductible + r.nonDeductible).toBeCloseTo(33.33 + 11.11 + 77.77 + 5.55, 2);
    }
  });

  it('⑦ التسويةُ السنوية (م٥١/٧): الفرقُ موجبٌ حين تعلو الفعليةُ المطبَّقة', () => {
    expect(annualSettlement(0.5, 0.8, 1000)).toMatchObject({ appliedDeductible: 500, actualDeductible: 800, difference: 300 });
    expect(annualSettlement(0.8, 0.5, 1000).difference).toBe(-300);
    expect(annualSettlement(0.6, 0.6, 1000).difference).toBe(0);
  });
});
