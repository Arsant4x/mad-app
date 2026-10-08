import { SUPPORTED_REGIONS } from './regions';
import { identityPlanOf, maskMobile, normalizeMobile, regionsWithoutMobilePlan } from './mobile';

/**
 * ⚖️ توجيه ٢٨٧ — **الجوالُ يُطبَّع بإقليم المنشأة قبل أن يُرسل إليه رمز، ويُقنَّع قبل أن يُعرض**. الجوابُ مكتوبٌ يداً لكلِّ صيغةٍ يكتبها
 * موظّفٌ في بطاقة العميل.
 */
describe('normalizeMobile · maskMobile — الجوالُ بإقليم المنشأة', () => {
  const country = Object.keys(SUPPORTED_REGIONS)[0];

  it('كلُّ إقليمٍ تخدمه المنصّة له خطّةُ جوال', () => {
    expect(regionsWithoutMobilePlan()).toEqual([]);
  });

  it.each([
    ['0555123442', '+966555123442'],
    ['555123442', '+966555123442'],
    ['+966 55 512 3442', '+966555123442'],
    ['00966555123442', '+966555123442'],
    ['966555123442', '+966555123442'],
    ['٠٥٥٥١٢٣٤٤٢', '+966555123442'],
    ['055-512-3442', '+966555123442'],
  ])('«%s» ⟵ %s', (raw, e164) => {
    expect(normalizeMobile(raw, country)).toBe(e164);
  });

  it.each([['0115123442'], ['05551234'], ['+44555123442'], ['abc'], [''], ['05551234420']])('«%s» ليس جوالاً في الإقليم ⟵ null', (raw) => {
    expect(normalizeMobile(raw, country)).toBeNull();
  });

  it('القناعُ يُبقي البادئةَ وثلاثةً بعدها والثلاثةَ الأخيرة، ولا يظهر الرقمُ كاملاً', () => {
    const masked = maskMobile('+966555123442', country);
    expect(masked).toBe('0555 ••• 442');
    expect(masked.replace(/\D/g, '')).not.toContain('555123442');
  });

  it('مزوّدُ الهويّة الوطنيّ للإقليم يتحقّق من مخطّطَي الهويّة والإقامة', () => {
    const plan = identityPlanOf(country);
    expect(plan?.idSchemes).toEqual(['NAT', 'IQA']);
    expect(identityPlanOf('ZZ')).toBeNull();
  });
});
