import { BadRequestException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { MSG } from '../common/i18n/messages';
import { TERMINAL_ADAPTERS } from './payment-terminal.adapter';

/**
 * حارس ثغرةٍ **مالية** لا تجميلية.
 *
 * `MockTerminalAdapter` يعيد `approved: true` لكل مبلغ لا تنتهي هللاته بـ13،
 * بلا اتصالٍ بأي مزوّد. وكان `MOCK` **الخيار الوحيد المعروض** في شاشة الربط،
 * ولا حاجز إنتاج عليه — فتاجرٌ حقيقي يربطه فيحصل على جهاز بطاقةٍ يعتمد كل
 * عملية **بلا تحصيل مال**، وتُختم فواتيره مسدَّدة.
 *
 * والحارس يقف عند البابين معاً: الإنشاء، و**الشحن** — لأن منع الإنشاء لا
 * يحمي صفّاً موجوداً سلفاً أو راحلاً مع نسخة بيانات.
 */
describe('المزوّد التجريبي ممنوع في الإنتاج', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  /** خدمة بمستأجرٍ مزيّف: المطلوب فحص الحاجز لا القاعدة. */
  const serviceWith = (row: unknown) => {
    const tx = {
      integrationConnection: {
        findFirst: jest.fn().mockResolvedValue(row),
        create: jest.fn(),
      },
    };
    const tenantPrisma = {
      runInTenantContext: (_c: string, fn: (t: unknown) => unknown) => fn(tx),
    };
    return { service: new IntegrationsService(tenantPrisma as never), tx };
  };

  const dto = { kind: 'PAYMENT_GATEWAY' as const, provider: 'MOCK', credentials: { apiKey: 'k' } };

  it('الإنشاء بـMOCK مرفوض في الإنتاج — برسالة صريحة لا تجاهل صامت', async () => {
    process.env.NODE_ENV = 'production';
    const { service, tx } = serviceWith(null);
    await expect(service.create('c1', dto)).rejects.toThrow(BadRequestException);
    await expect(service.create('c1', dto)).rejects.toThrow(MSG.integration_mock_forbidden_in_production);
    // ولا يُنشأ صفّ رغم الرفض.
    expect(tx.integrationConnection.create).not.toHaveBeenCalled();
  });

  it('الشحن عبر اتصالٍ تجريبي **قائم سلفاً** مرفوض في الإنتاج', async () => {
    process.env.NODE_ENV = 'production';
    const { service } = serviceWith({ id: 'i1', kind: 'PAYMENT_GATEWAY', provider: 'MOCK', enabled: true, credentials: 'x' });
    await expect(
      service.chargeCardIfConfigured({ integrationConnection: { findFirst: jest.fn().mockResolvedValue({ id: 'i1', kind: 'PAYMENT_GATEWAY', provider: 'MOCK', enabled: true, credentials: 'x' }) } } as never, {
        amount: 100,
        currency: 'SAR',
        reference: 'R1',
      }),
    ).rejects.toThrow(MSG.integration_mock_forbidden_in_production);
  });

  it('⚠️ الرفض بالرمي لا بـnull — فإعادة null تعني «لا بوابة» فيمرّ البيع كنقدي', async () => {
    process.env.NODE_ENV = 'production';
    const tx = { integrationConnection: { findFirst: jest.fn().mockResolvedValue({ id: 'i1', kind: 'PAYMENT_GATEWAY', provider: 'MOCK', enabled: true, credentials: 'x' }) } };
    const { service } = serviceWith(null);
    const result = await service.chargeCardIfConfigured(tx as never, { amount: 100, currency: 'SAR', reference: 'R1' }).catch((e) => e);
    expect(result).toBeInstanceOf(BadRequestException);
    expect(result).not.toBeNull();
  });

  it('خارج الإنتاج يبقى المزوّد التجريبي عاملاً — وإلا تعطّل التطوير والعرض', async () => {
    process.env.NODE_ENV = 'development';
    const tx = { integrationConnection: { findFirst: jest.fn().mockResolvedValue({ id: 'i1', kind: 'PAYMENT_GATEWAY', provider: 'MOCK', enabled: true, credentials: 'ENC' }) } };
    const { service } = serviceWith(null);
    // يصل إلى المحوّل (سيفشل فكّ التشفير لا الحاجز) — المهم ألّا يُرفض بحاجز الإنتاج.
    const out = await service.chargeCardIfConfigured(tx as never, { amount: 100, currency: 'SAR', reference: 'R' }).catch((e) => e);
    expect(String(out?.message ?? out)).not.toContain(MSG.integration_mock_forbidden_in_production);
  });

  /**
   * جردٌ لا توكيدٌ على حالةٍ واحدة: كل محوّل مسجَّل يُصنَّف إما حقيقياً
   * (يُحصّل مالاً) أو تجريبياً (يُدرَج في قائمة المنع). محوّلٌ جديد لا يُصنَّف
   * يُسقط هذا الاختبار — وهو المطلوب، فالثغرة وُلدت من محوّلٍ بلا تصنيف.
   */
  it('كل محوّل دفع مسجَّل إما حقيقي أو مُدرَج في المنع — لا ثالث', () => {
    const declaredTestOnly = ['MOCK'];
    const registered = Object.keys(TERMINAL_ADAPTERS);
    const unclassified = registered.filter((p) => !declaredTestOnly.includes(p) && /mock|fake|stub|dummy|test|sandbox/i.test(p));
    // jest لا يقبل رسالةً ثانية في expect، فتُحمَل داخل القيمة نفسها كي
    // يظهر اسم المحوّل المخالف في سطر السقوط لا في وصفٍ عام.
    expect({ محوّلات_تجريبية_بلا_حاجز: unclassified }).toEqual({ محوّلات_تجريبية_بلا_حاجز: [] });
  });
});
