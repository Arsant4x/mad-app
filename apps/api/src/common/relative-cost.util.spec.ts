import { settledCost } from '../../test/settled-cost';
import { relativeCostVerdict, type RelativeCost } from './relative-cost.util';

/**
 * Relative cost and its verdict.
 *
 * The arithmetic is proven with made-up numbers. Real time is only measured in
 * the cases that check the ratio follows the work, and those cases wait for the
 * measurement to settle instead of trusting a single sample: under load about one
 * single sample in a hundred fell to 2 or below, down to 0.06, while the true ratio
 * is near 8.
 */
const cost = (subjectMs: number, referenceMs: number): RelativeCost => ({
  subjectMs,
  referenceMs,
  ratio: referenceMs > 0 ? subjectMs / referenceMs : Number.POSITIVE_INFINITY,
  rounds: 1,
});

/** Real, deliberately uneven work: work(8) does eight times what work(1) does. */
const work = (times: number) => () => {
  let sum = 0;
  for (let i = 0; i < 20000 * times; i++) sum += i % 7;
  return sum;
};

describe('الكلفةُ النسبيّة وحكمُها', () => {
  describe('الحساب', () => {
    it('النسبةُ هي الموضوعُ على المرجع، ويُقاسان بالتناوب في التشغيل نفسه', () => {
      const { cost: measured, samples } = settledCost(work(8), work(1));

      expect(samples).toBeGreaterThanOrEqual(2);
      expect(measured.rounds).toBe(3);
      expect(measured.subjectMs).toBeGreaterThan(0);
      expect(measured.referenceMs).toBeGreaterThan(0);
      // No fixed number, since the machine varies: eight times the work gives a
      // ratio clearly above one once the measurement has settled.
      expect(measured.ratio).toBeGreaterThan(2);
    });

    it('والانتظارُ لا يُخفي قياساً معطوباً: الطرفان مقلوبان يستقرّان تحت الواحد', () => {
      const { cost: swapped } = settledCost(work(1), work(8));
      expect(swapped.ratio).toBeLessThan(1);
    });

    it('ومرجعٌ بلا زمنٍ يُعلَن لا نهائياً، لا يُقسَم على صفرٍ فيُقرأ نجاحاً', () => {
      expect(cost(5, 0).ratio).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('الحكمُ بوجهه', () => {
    it('تحت السقف: لا حكم', () => {
      expect(relativeCostVerdict(cost(2, 1), 6, 'الموضوع', 'المرجع')).toBeNull();
    });

    it('وفوقه: نصٌّ يحمل الأرقامَ الثلاثة وما يفعله من يراه', () => {
      const verdict = relativeCostVerdict(cost(60, 6), 6, 'كلفةُ البصمة', 'مرجعٌ من جنسها');
      if (!verdict) throw new Error('The ceiling was crossed and no verdict came back; the verdict is what this case is about');

      // The three numbers tell the two halves of the claim apart. One decimal, not
      // two: two decimals is the money shape in this tree and milliseconds are not money.
      expect(verdict).toContain('كلفةُ البصمة: 60.0 م.ث');
      expect(verdict).toContain('مرجعٌ من جنسها 6.0 م.ث');
      expect(verdict).toContain('⇒ 10.0×');
      expect(verdict).toContain('والسقف 6×');

      // The most valuable line: it forbids the easiest wrong fix.
      expect(verdict).toContain('ولا تُرفع العتبةُ حتى تخضرّ');
      // Both halves of the claim, since either one alone points at the wrong fix.
      expect(verdict).toContain('الموضوعُ تدهور');
      expect(verdict).toContain('المرجعُ لم يعد من جنسه');
      // And both names, since a verdict without a name has no place.
      expect(verdict).toContain('كلفةُ البصمة');
      expect(verdict).toContain('مرجعٌ من جنسها');
    });

    it('وعند السقف بالضبط يصدر الحكم، فالحدُّ يُدخل لا يُخرج', () => {
      expect(relativeCostVerdict(cost(6, 1), 6, 'الموضوع', 'المرجع')).not.toBeNull();
      expect(relativeCostVerdict(cost(5.99, 1), 6, 'الموضوع', 'المرجع')).toBeNull();
    });
  });
});
