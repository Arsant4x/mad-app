import { BadRequestException } from '@nestjs/common';
import { ZatcaEnvironment } from '@mad-app/db';
import { apiBaseFor, assertEnvironmentAllowed, defaultEnvironment } from './zatca-onboarding.service';
import { MSG } from '../common/i18n/messages';

/**
 * حارس بيئات ZATCA.
 *
 * **الخطر:** `SANDBOX` و`SIMULATION` نقاطٌ حقيقية لدى الهيئة — لا محوّل وهمي
 * من صنعنا — لكن فواتيرها **لا تُعتمد نظاماً**. وتاجرٌ يهيّئ عليها من خادم
 * الإنتاج يرى فواتيره تُختم `CLEARED` عندنا ويظنّها مقبولة، ولا ينكشف العطل
 * حتى تصل المطالبة الضريبية.
 *
 * **والفخّ الأكبر لم يكن الاختيار بل الافتراضي:** `?? SANDBOX` كان يعني أن
 * تاجراً **لا يمرّر الحقل أصلاً** يُهيَّأ على بيئة اختبار. فمنعُ الاختيار
 * وحده كان سيترك الباب مفتوحاً على مصراعيه — نفس درس `?? 'MOCK'`.
 */
describe('بيئة ZATCA — الاختبار ممنوع في الإنتاج', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  describe('على الإنتاج', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it.each([ZatcaEnvironment.SANDBOX, ZatcaEnvironment.SIMULATION])('%s مرفوضة برسالة صريحة', (env) => {
      expect(() => assertEnvironmentAllowed(env)).toThrow(BadRequestException);
      expect(() => assertEnvironmentAllowed(env)).toThrow(MSG.zatca_test_environment_forbidden_in_production);
    });

    it('PRODUCTION مسموحة — الحاجز يمنع الاختبار لا العمل', () => {
      expect(() => assertEnvironmentAllowed(ZatcaEnvironment.PRODUCTION)).not.toThrow();
    });

    it('⚠️ الافتراضي يصير PRODUCTION — فتاجرٌ لا يمرّر الحقل لا يقع في بيئة اختبار', () => {
      expect(defaultEnvironment()).toBe(ZatcaEnvironment.PRODUCTION);
    });

    it('الحاجز الثاني: كل نداءٍ للهيئة يُفحص — لا التهيئة وحدها', () => {
      // بيانات اعتماد أُنشئت قبل الحاجز أو رحلت مع نسخة بيانات هي التي تختم
      // الفواتير فعلاً؛ منعُ التهيئة لا يمسّها.
      expect(() => apiBaseFor(ZatcaEnvironment.SIMULATION)).toThrow(MSG.zatca_test_environment_forbidden_in_production);
      expect(() => apiBaseFor(ZatcaEnvironment.PRODUCTION)).not.toThrow();
    });
  });

  describe('خارج الإنتاج', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('بيئات الاختبار تعمل — وإلا تعطّل التطوير والتكامل', () => {
      expect(() => assertEnvironmentAllowed(ZatcaEnvironment.SANDBOX)).not.toThrow();
      expect(apiBaseFor(ZatcaEnvironment.SIMULATION)).toContain('simulation');
    });

    it('الافتراضي يبقى SANDBOX — تجربةٌ لا تطلب شهادة إنتاج بالخطأ', () => {
      expect(defaultEnvironment()).toBe(ZatcaEnvironment.SANDBOX);
    });
  });

  /**
   * جردٌ لا توكيدٌ على حالتين: بيئةٌ جديدة تُضاف لاحقاً يجب أن تُصنَّف —
   * إنتاجية أو اختبارية. غير المصنَّفة تمرّ بلا حاجز، وهي الثغرة بعينها.
   */
  it('كل بيئة معرَّفة مصنَّفة — لا ثالث بلا حاجز', () => {
    process.env.NODE_ENV = 'production';
    const unclassified = Object.values(ZatcaEnvironment).filter((env) => {
      if (env === ZatcaEnvironment.PRODUCTION) return false;
      try {
        assertEnvironmentAllowed(env);
        return true; // مرّت على الإنتاج وهي ليست PRODUCTION ⇒ بلا حاجز
      } catch {
        return false;
      }
    });
    expect({ بيئات_بلا_حاجز: unclassified }).toEqual({ بيئات_بلا_حاجز: [] });
  });
});
