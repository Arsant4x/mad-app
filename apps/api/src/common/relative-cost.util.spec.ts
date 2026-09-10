import { relativeCost, relativeCostVerdict, type RelativeCost } from './relative-cost.util';

/**
 * **المقياسُ النسبيّ وحكمُه بوجهه** (`ق-٤٨٨` · `ق-٤٩٠`).
 *
 * ⚠️ **ولا يُقاس هنا زمنٌ حقيقيّ**: الحسابُ يُثبَت بأرقامٍ مصنوعة، **والزمنُ
 * الحقيقيّ يُقاس حيث يُستعمل** — فمجموعةٌ تقيس زمناً لتثبت حاسبةَ زمنٍ **تُدخل
 * التذبذبَ في إثبات ما لا يتذبذب**.
 */
const cost = (subjectMs: number, referenceMs: number): RelativeCost => ({
  subjectMs,
  referenceMs,
  ratio: referenceMs > 0 ? subjectMs / referenceMs : Number.POSITIVE_INFINITY,
  rounds: 1,
});

describe('الكلفةُ النسبيّة وحكمُها (ق-٤٨٨ · ق-٤٩٠)', () => {
  describe('الحساب', () => {
    it('🔴 النسبةُ هي الموضوعُ على المرجع — ويُقاسان بالتناوب في التشغيل نفسه', () => {
      // شغلٌ حقيقيٌّ متفاوتٌ عمداً: الموضوعُ يعمل أضعافَ ما يعمله المرجع.
      const work = (times: number) => () => {
        let sum = 0;
        for (let i = 0; i < 20000 * times; i++) sum += i % 7;
        return sum;
      };
      const measured = relativeCost(work(8), work(1), 3);

      expect(measured.rounds).toBe(3);
      expect(measured.subjectMs).toBeGreaterThan(0);
      expect(measured.referenceMs).toBeGreaterThan(0);
      // ولا يُشترط رقمٌ بعينه — **فالجهازُ متغيّر**، والدعوى أن النسبة تتبع
      // الشغلَ لا الحِمل: ثمانيةُ أضعافِ شغلٍ تعطي نسبةً أكبر من الواحد بوضوح.
      expect(measured.ratio).toBeGreaterThan(2);
    });

    it('ومرجعٌ بلا زمنٍ يُعلَن لا نهائياً — لا يُقسَم على صفرٍ فيُقرأ نجاحاً', () => {
      expect(cost(5, 0).ratio).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('الحكمُ بوجهه', () => {
    it('🔴 تحت السقف: لا حكم', () => {
      expect(relativeCostVerdict(cost(2, 1), 6, 'الموضوع', 'المرجع')).toBeNull();
    });

    it('🔴 وفوقه: نصٌّ يحمل الأرقامَ الثلاثة وما يفعله من يراه', () => {
      const verdict = relativeCostVerdict(cost(60, 6), 6, 'كلفةُ البصمة', 'مرجعٌ من جنسها');
      if (!verdict) throw new Error('السقفُ تُجووِز ولم يصدر حكم — والحكمُ هو موضوع هذه الحالة');

      // الأرقامُ الثلاثة — وهي ما يفرّق بين شقّي الدعوى.
      // ⚠️ **بمنزلةٍ واحدة لا اثنتين**: منزلتان شكلُ المال في هذه الشجرة،
      // والملّي ثانيةُ ليست مالاً (حارسُ كنسة التدوير يمسك الشكل).
      expect(verdict).toContain('كلفةُ البصمة: 60.0 م.ث');
      expect(verdict).toContain('مرجعٌ من جنسها 6.0 م.ث');
      expect(verdict).toContain('⇒ 10.0×');
      expect(verdict).toContain('والسقف 6×');

      // ⭐ **وأثمنُ ما فيه**: النهيُ عن أسهل ما يفعله القارئ.
      expect(verdict).toContain('ولا تُرفع العتبةُ حتى تخضرّ');
      // وشقّا الدعوى معاً — فواحدٌ منهما وحدَه يوجّه إلى علاجٍ خاطئ.
      expect(verdict).toContain('الموضوعُ تدهور');
      expect(verdict).toContain('المرجعُ لم يعد من جنسه');
      // واسمُ الموضوع والمرجع فيه — فحكمٌ بلا اسمٍ لا يُعرف موضعُه.
      expect(verdict).toContain('كلفةُ البصمة');
      expect(verdict).toContain('مرجعٌ من جنسها');
    });

    it('وعند السقف بالضبط يصدر الحكم — فالحدُّ يُدخل لا يُخرج', () => {
      expect(relativeCostVerdict(cost(6, 1), 6, 'الموضوع', 'المرجع')).not.toBeNull();
      expect(relativeCostVerdict(cost(5.99, 1), 6, 'الموضوع', 'المرجع')).toBeNull();
    });
  });
});
