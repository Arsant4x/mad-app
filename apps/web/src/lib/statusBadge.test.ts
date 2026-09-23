import { describe, expect, it, vi } from 'vitest';
import { badgeAltOf, badgeOf, tagOf } from './statusBadge';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.2 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

/**
 * الاختبار ٢ — **الحارس على الحارس** (بند صاحب المشروع).
 *
 * `lib/statusBadge.ts` هو ما يمنع انهيار 19 موضعاً عند قيمة حالةٍ لا تعرفها
 * الحزمة (انحراف الإصدارات: الواجهة تعيش في متصفح المستخدم والخادم يُحدَّث
 * تحتها). لكن الحارس نفسه سطرٌ صغير يبدو زائداً لمن يقرأه بعد شهر —
 * **وحارسٌ بلا حارس يُحذف يوماً بحسن نية**، ويعود اللغم إلى مكانه صامتاً.
 *
 * فهذا الملف يجعل ذلك الحذف **سقوطاً فورياً** لا اكتشافاً في الإنتاج.
 */
const BADGE_MAP = {
  DUE: { label: 'مستحقة', badgeClass: 'due' },
  PAID: { label: 'مدفوعة', badgeClass: 'paid' },
};

describe('الاختبار ٢ — حرّاس الشارات يتدهورون بلطف', () => {
  it('يعيد الوصف الصحيح لقيمة معروفة', () => {
    expect(badgeOf(BADGE_MAP, 'DUE')).toEqual({ label: 'مستحقة', badgeClass: 'due' });
  });

  it('لا يرمي على قيمة مجهولة — وهو العطل الذي وقع فعلاً', () => {
    // النمط القديم `MAP[x].badgeClass` كان يرمي هنا بـ
    // TypeError: Cannot read properties of undefined (reading 'badgeClass')
    expect(() => badgeOf(BADGE_MAP, 'WRITTEN_OFF').badgeClass).not.toThrow();
  });

  it('يعرض القيمة الخام لا فراغاً — كي يرى المستخدم ما يبلّغ عنه', () => {
    const meta = badgeOf(BADGE_MAP, 'WRITTEN_OFF');
    expect(meta.label).toBe('WRITTEN_OFF');
    expect(meta.badgeClass).toBe('');
  });

  it('النظيران يتدهوران بنفس اللطف وبحقلَيهما الصحيحين', () => {
    expect(badgeAltOf({}, 'X')).toEqual({ label: 'X', badge: '' });
    expect(tagOf({}, 'Y')).toEqual({ label: 'Y', tagClass: '' });
  });

  it('لا ينهار على خريطة فارغة ولا على مفتاح فارغ', () => {
    expect(() => badgeOf({}, '')).not.toThrow();
    expect(badgeOf({}, '').badgeClass).toBe('');
  });
});
