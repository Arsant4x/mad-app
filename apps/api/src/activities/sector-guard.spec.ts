import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../common/source-scan.util';

const API = join(__dirname, '..');

/**
 * ⚠️ **يبحث عن أنماطٍ برمجية، فيُجرَّد من التعليقات — والنصوصُ تبقى** (`ق-٣٧٥`):
 * توكيدٌ يقرأ **رسالةً عربية من داخل سلسلة** وآخرُ يمنع **أسماءَ شاشاتٍ
 * مكتوبةً نصّاً** داخل دالّة — **فكلاهما يحتاج النصَّ سليماً**.
 *
 * 🔴 **وكان هنا مُجرِّدٌ يدويّ فيه عطلُ `ق-٣٣١`**: نمطُ التعليق السطريّ بدأ
 * بـ`^` ثم `\s` مكرّرة، **وهي تبتلع السطر الجديد** — **فاستُبدل بالمصدر الواحد**.
 */
const read = (...p: string[]) => stripComments(readFileSync(join(API, ...p), 'utf8').replace(/\r\n/g, '\n'));

const guard = () => read('common', 'tenant', 'tenant.guard.ts');
const permissions = () => read('delegations', 'permissions.service.ts');

describe('الترشيح في الطرفين — والخادم هو الحكم', () => {
  it('يقرأ الملفات فعلاً', () => {
    expect(guard().length).toBeGreaterThan(2000);
    expect(permissions().length).toBeGreaterThan(2000);
  });

  it('⭐ `TenantGuard` يرفض الشاشة خارج النشاط — وإلا مرّ العنوان المباشر', () => {
    // الترشيح في `/me/permissions` وحده **تجميلٌ لا حماية**: يُخفي الرابط
    // من الشريط ويترك من يكتب `/contracts` يدخل.
    const g = guard();
    expect(g).toContain('screensFor');
    expect(g).toContain('ScreenNotInSectorException');
    expect(g).toMatch(/sectorScreens\s*&&\s*!sectorScreens\.has\(requiredScreen\)/);
  });

  it('⭐ وقبل فحص القالب — والترتيب يغيّر ما يفعله التاجر', () => {
    // النشاط لا يشمل الشاشة ⇒ يضيف نشاطاً. القالب لا يمنحها ⇒ يطلبها من
    // المالك. ولو فُحص القالب أولاً لقيل لصاحب المنشأة — وهو يملك كل
    // الشاشات — «لا تملك صلاحية»، وهو جوابٌ كاذب.
    // ⚠️ المقارنة على **موضع الرمي** لا على أول ذِكر للاسم.
    //
    // صياغةٌ أولى قارنت `indexOf('ScreenNotInSectorException')` — وأول
    // ذِكرٍ له هو **سطر الاستيراد** في أعلى الملف، فالمقارنة صحيحة دائماً
    // مهما كان ترتيب الفحصين. ومرّت على تبديلٍ فعلي للترتيب بنجاحٍ تامّ.
    //
    // وهو الوجه الرابع من النمط الرباعي: **نجاحٌ لسببٍ خاطئ** — أخطرها،
    // لأنه لا يُراجَع.
    const g = guard();
    const sectorThrow = g.indexOf('throw new ScreenNotInSectorException');
    const templateThrow = g.indexOf('throw new ScreenForbiddenException');
    expect(sectorThrow).toBeGreaterThan(-1);
    expect(templateThrow).toBeGreaterThan(-1);
    expect(sectorThrow).toBeLessThan(templateThrow);
  });

  it('⭐ الرفض 403 لا 404 — الشاشة موجودة والسبب معلوم', () => {
    // بخلاف الفواتير حيث 404 يمنع تسريب الوجود: الشاشات قائمة ثابتة في
    // المنتج، فإخفاء وجودها لا يحمي شيئاً ويترك التاجر أمام «غير موجود».
    const ex = read('common', 'tenant', 'tenant.exceptions.ts');
    expect(ex).toMatch(/class ScreenNotInSectorException extends ForbiddenException/);
    expect(ex).not.toMatch(/class ScreenNotInSectorException extends NotFoundException/);
  });

  it('⭐ الرسالة تقول السبب وتدلّ على الحلّ — لا رفضاً مجرّداً', () => {
    const msgs = readFileSync(join(API, 'common', 'i18n', 'messages.ts'), 'utf8');
    const ar = msgs.match(/screen_not_in_sector\]:\s*\{[\s\S]*?ar:\s*'([^']+)'/)?.[1] ?? '';
    expect(ar).toContain('غير مفعّلة');
    // ويدلّ على الفعل: التاجر يجب أن يعرف أنها موجودة ويمكن تفعيلها.
    expect(ar).toContain('الإعدادات');
  });

  /**
   * ⚠️ الفحص على **جسم `sectorScreensFor` وحده** لا على الملف كله.
   *
   * صياغةٌ أولى فحصت الملف كاملاً فاصطادت `MASTER_DATA_SCREENS` في
   * `tenant.guard.ts` — قائمةٌ قائمة تخصّ **قفل البيانات الرئيسية** لا
   * خريطة القطاعات. أي أن الحارس كان **سيمنع ملفّاً سليماً** بسبب ميزةٍ
   * أخرى لا علاقة لها.
   *
   * وهو **الوجه الثالث من النمط الرباعي** للمرة الثالثة اليوم: مدًى أوسع
   * من المقصود. والقاعدة تُقرأ ولا تُحصّن — الكسر وحده يمسك.
   */
  const bodyOf = (src: string) => {
    const at = src.indexOf('private async sectorScreensFor');
    expect(at).toBeGreaterThan(-1);
    return src.slice(at, src.indexOf('\n  }', at));
  };

  it('⭐ المنطق من `activities/sectors.ts` في الموضعين — لا نسخةٌ ثالثة', () => {
    // الاستعلامان مكرّران عمداً (الحارس لا يحقن خدمةً من وحدةٍ تستعمله —
    // اعتمادٌ دائري). أما **الخريطة والقواعد** فمصدرها واحد.
    for (const [name, src] of [['guard', guard()], ['permissions', permissions()]] as const) {
      expect({ name, imports: /from '.*activities\/sectors'/.test(src) }).toEqual({ name, imports: true });
      const body = bodyOf(src);
      expect({ name, callsShared: body.includes('screensFor(') }).toEqual({ name, callsShared: true });
      // ولا خريطةٌ محلّية داخل الدالة: أي اسم شاشةٍ هنا يعني قراراً يُتخذ
      // في موضعين — ويفترقان عند أول تعديل.
      for (const screen of ['properties', 'contracts', 'pos', 'inventory', 'quotes', 'products', 'maintenance']) {
        expect({ name, screen, hardcoded: new RegExp(`['"\`]${screen}['"\`]`).test(body) }).toEqual({ name, screen, hardcoded: false });
      }
    }
  });

  it('⭐ و`primaryActivityId` هو المفتاح في الموضعين — `null` يُطفئ الترشيح', () => {
    // أي موضعٍ ينسى هذا الشرط يُشغّل الترشيح على منشأةٍ لم تختر — فيستيقظ
    // تاجرٌ بلا شاشاته.
    for (const [name, src] of [['guard', guard()], ['permissions', permissions()]] as const) {
      expect({ name, ok: /if \(!company\.primaryActivityId\) return null;/.test(src) }).toEqual({ name, ok: true });
    }
  });

  it('⭐ والمعطَّل لا يُحتسب — في الموضعين', () => {
    for (const [name, src] of [['guard', guard()], ['permissions', permissions()]] as const) {
      expect({ name, ok: /disabledAt:\s*null/.test(src) }).toEqual({ name, ok: true });
    }
  });
});
