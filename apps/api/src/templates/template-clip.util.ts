import { OWNER_HELD_ACTIONS, type ScreenActionMap } from './screens';

/** ما يمنحه قالب: علَمُ الشمول والشاشاتُ وأفعالُها — كما يقرؤه الحارسُ و`/me/permissions`. */
export interface TemplateGrants {
  isAllScreens: boolean;
  allowedScreens: string[];
  screenActions: ScreenActionMap | null;
}

/** حقولُ القالب كما تخرج من القاعدة إلى `TemplateGrants`. */
export function grantsOf(t: { isAllScreens: boolean; allowedScreens: string[]; screenActions: unknown }): TemplateGrants {
  return { isAllScreens: t.isAllScreens, allowedScreens: t.allowedScreens, screenActions: (t.screenActions ?? null) as ScreenActionMap | null };
}

/**
 * The company template as its owner holds it: on every screen it lists with an explicit action list, the
 * owner-held actions are added. Read wherever the company template is, so the owner and everyone clipped
 * by the company template see the same set.
 */
export function companyGrantsOf(t: { isAllScreens: boolean; allowedScreens: string[]; screenActions: unknown }): TemplateGrants {
  const grants = grantsOf(t);
  if (grants.isAllScreens || !grants.screenActions) return grants;
  const screenActions: ScreenActionMap = { ...grants.screenActions };
  for (const [screen, held] of Object.entries(OWNER_HELD_ACTIONS)) {
    const listed = screenActions[screen];
    // No list means every action already; a screen the template does not grant stays closed.
    if (!listed || !grants.allowedScreens.includes(screen)) continue;
    screenActions[screen] = [...listed, ...held.filter((a) => !listed.includes(a))];
  }
  return { ...grants, screenActions };
}

/**
 * ⚖️ **قالبُ الموظّف يُقصّ بقالب منشأته** (توجيه ٢٧٦ · `ق-١٦٠١` · `ق-١٦٠٩`/ج، بحكم صاحب المشروع — الخطر ٣ في المسح ٣٣).
 *
 * كان قالبُ الموظّف (ومفتاحُ النظام) **يحلّ محلَّ** قالب المنشأة: منشأةٌ على قالبٍ ضيّق يعطي صاحبُها موظّفاً القالبَ الشامل فيرى
 * الموظّفُ ما لا تراه منشأتُه. والآن ما يملكه = **تقاطعُ القالبين**: الشاشاتُ المشتركة، ولكلِّ شاشةٍ تقاطعُ أفعالها — وشاشةٌ بلا
 * تفصيل أفعالٍ في قالبٍ تعني «كلَّ الأفعال» فيه (`isActionAllowed`)، فيأخذ التقاطعُ تفصيلَ الآخر.
 *
 * دالّةٌ نقيّةٌ واحدة يستدعيها الحارسُ (`tenant.guard.ts`) و`/me/permissions` (`permissions.service.ts`) — فلا يقول أحدُهما شيئاً
 * ويقول الآخرُ غيرَه.
 */
export function clipToCompany(actor: TemplateGrants, company: TemplateGrants): TemplateGrants {
  if (company.isAllScreens) return actor;
  if (actor.isAllScreens) {
    return { isAllScreens: false, allowedScreens: [...company.allowedScreens], screenActions: company.screenActions ? { ...company.screenActions } : null };
  }
  const shared = actor.allowedScreens.filter((s) => company.allowedScreens.includes(s));
  const allowedScreens: string[] = [];
  const screenActions: ScreenActionMap = {};
  for (const s of shared) {
    const mine = actor.screenActions?.[s];
    const theirs = company.screenActions?.[s];
    const actions = mine && theirs ? mine.filter((a) => theirs.includes(a)) : mine ? [...mine] : theirs ? [...theirs] : null;
    // شاشةٌ لم يبقَ لها فعلٌ مشترك تسقط كلُّها — لا تبقى «مسموحةً» بلا فعلٍ فتمرّ من مسارٍ لا يُعلن فعلَه.
    if (actions && actions.length === 0) continue;
    allowedScreens.push(s);
    if (actions) screenActions[s] = actions;
  }
  return { isAllScreens: false, allowedScreens, screenActions: Object.keys(screenActions).length > 0 ? screenActions : null };
}
