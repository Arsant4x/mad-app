import { clipToCompany, type TemplateGrants } from './template-clip.util';

/**
 * ⚖️ **قصُّ قالب الموظّف بقالب منشأته** (توجيه ٢٧٦ · `ق-١٦٠١`) — حالاتٌ جوابُها معروفٌ يداً.
 */
const all: TemplateGrants = { isAllScreens: true, allowedScreens: [], screenActions: null };
const tpl = (allowedScreens: string[], screenActions: TemplateGrants['screenActions'] = null): TemplateGrants => ({ isAllScreens: false, allowedScreens, screenActions });

describe('قالبُ الموظّف يُقصّ بقالب منشأته (ق-١٦٠١)', () => {
  it('منشأةٌ شاملة لا تقصّ شيئاً — الموظّفُ بقالبه كما هو', () => {
    const actor = tpl(['invoices'], { invoices: ['view'] });
    expect(clipToCompany(actor, all)).toEqual(actor);
  });

  it('⭐ الموظّفُ الشاملُ على منشأةٍ قالبُها الفواتيرُ وحدَها يملك الفواتيرَ وحدَها', () => {
    expect(clipToCompany(all, tpl(['invoices'], { invoices: ['view', 'add'] }))).toEqual(tpl(['invoices'], { invoices: ['view', 'add'] }));
  });

  it('الشاشاتُ تقاطعٌ، والأفعالُ تقاطعٌ لكلِّ شاشة — وشاشةٌ بلا تفصيلٍ في قالبٍ تأخذ تفصيلَ الآخر', () => {
    const actor = tpl(['invoices', 'customers', 'banks'], { invoices: ['view', 'add', 'delete'] });
    const company = tpl(['invoices', 'customers'], { invoices: ['view', 'add'], customers: ['view'] });
    expect(clipToCompany(actor, company)).toEqual(tpl(['invoices', 'customers'], { invoices: ['view', 'add'], customers: ['view'] }));
  });

  it('شاشةٌ لم يبقَ لها فعلٌ مشترك تسقط كلُّها', () => {
    const actor = tpl(['invoices'], { invoices: ['delete'] });
    const company = tpl(['invoices'], { invoices: ['view'] });
    expect(clipToCompany(actor, company)).toEqual(tpl([], null));
  });

  it('وبلا تفصيلٍ في القالبين تبقى الشاشةُ بكلِّ أفعالها', () => {
    expect(clipToCompany(tpl(['journal', 'accounts']), tpl(['journal']))).toEqual(tpl(['journal'], null));
  });
});
