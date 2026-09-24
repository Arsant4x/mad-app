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

  const MOCK_ROW = { id: 'i1', kind: 'PAYMENT_GATEWAY', provider: 'MOCK', enabled: true, credentials: 'x' };

  it('قبولُ جزء البطاقة عبر اتصالٍ تجريبي **قائم سلفاً** مرفوض في الإنتاج — عند كلِّ استعمال لا عند الإنشاء وحده', async () => {
    process.env.NODE_ENV = 'production';
    const { service, tx } = serviceWith(MOCK_ROW);
    await expect(service.activeGateway(tx as never)).rejects.toThrow(MSG.integration_mock_forbidden_in_production);
  });

  it('⚠️ الرفض بالرمي لا بـnull — فإعادة null تعني «لا بوابة» فيمرّ البيع بلا مال', async () => {
    process.env.NODE_ENV = 'production';
    const { service, tx } = serviceWith(MOCK_ROW);
    const result = await service.activeGateway(tx as never).catch((e: unknown) => e);
    expect(result).toBeInstanceOf(BadRequestException);
    expect(result).not.toBeNull();
    // والشحنُ نفسُه لا يبلغ المحوّل: يعود «لم يُرسل» حاملاً الحاجزَ نفسَه — لا قبولٌ ولا معلّق.
    const charged = await service.chargeWithDeadline('c1', 'MOCK', { amount: 100, currency: 'XXX', reference: 'R1' });
    expect(charged.kind).toBe('NOT_SENT');
    expect(String((charged as { error: Error }).error.message)).toContain(MSG.integration_mock_forbidden_in_production);
  });

  it('خارج الإنتاج يبقى المزوّد التجريبي عاملاً — وإلا تعطّل التطوير والعرض', async () => {
    process.env.NODE_ENV = 'development';
    const { service, tx } = serviceWith({ ...MOCK_ROW, credentials: 'ENC' });
    const gateway = await service.activeGateway(tx as never);
    expect(gateway?.provider).toBe('MOCK');
  });

  /**
   * ⚖️ `ق-١٣٩٨`: «**تسعون ثانية، ثم معلّق. ⚠️ وتُعلَن في محوّل كلِّ مزوّدٍ لا في النواة، فلكلِّ مزوّدٍ حدُّه.**»
   * جردٌ لا حالة: كلُّ محوّلٍ مسجَّلٍ يعلن مهلتَه عدداً موجباً منتهياً — فمحوّلٌ بلا مهلةٍ لا يُسجَّل.
   */
  it('كلُّ محوّلٍ مسجَّل يعلن مهلةَ جهازه بنفسه — والتجريبيُّ تسعون ثانية (ق-١٣٩٨)', () => {
    const declared = Object.entries(TERMINAL_ADAPTERS).map(([p, a]) => ({ p, ms: a.chargeDeadlineMs }));
    expect(declared.filter((d) => !(Number.isFinite(d.ms) && d.ms > 0))).toEqual([]);
    expect(TERMINAL_ADAPTERS.MOCK.chargeDeadlineMs).toBe(90_000);
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
