import { ALLOWED_SCREENS, ScreenAction, ScreenActionMap, actionsFor, isActionAllowed } from '../templates/screens';
import type { TemplateGrants } from '../templates/template-clip.util';
import { Grant, grant } from './permission-tree';
import { DelegationLink, RootGrants, actorGrants } from './intersection';

/**
 * سقف السلسلة — يُشتقّ من القالب القائم، **ولا يُعرَّف من جديد**.
 *
 * ## لماذا `isActionAllowed` تُستدعى ولا تُعاد كتابتها
 *
 * قاعدة «لا نظام صلاحيات ثانٍ» ليست قاعدة واجهةٍ فقط. القالب اليوم يُقرأ في
 * `tenant.guard.ts` عبر `isActionAllowed` — بثلاث حالاتٍ ضمنية غير بديهية:
 *
 * 1. `isAllScreens` ⇒ كل شيء، **وتتجاهل `allowedScreens` كلياً**
 * 2. شاشةٌ مسموحة **بلا** مُدخَل في `screenActions` ⇒ **كل الأفعال** (توافقٌ
 *    خلفي مع قوالب سبقت وجود الأفعال)
 * 3. شاشةٌ بمُدخَل ⇒ ما فيه وحده
 *
 * والحالة (2) هي الفخّ: قراءةٌ ساذجة لـ`screenActions` تُنتج **مجموعةً
 * فارغة** لقالبٍ يملك كل شيء على تلك الشاشة. فيرى الموظف شاشته ولا يرى فيها
 * زرّاً — والخادم يقبل ما ترفض الواجهة عرضه. عطلٌ لا يشتكي منه شيء.
 *
 * فالاشتقاق هنا **يمرّ بالدالة نفسها** التي يمرّ بها الحارس. تتغيّر قاعدة
 * فتتغيّر الاثنتان معاً — أو لا تتغيّر واحدة دون الأخرى أبداً.
 *
 * ## ولا تُخزَّن
 *
 * تُبنى عند كل طلب من صفّ القالب المقروء لتوّه. تغييرُ القالب ينفذ في الطلب
 * التالي بلا إبطال ذاكرةٍ ولا خروجٍ وعودة — وهو ما يمنع
 * `Absence of user session management` (الملحق 1، قرار ZATCA).
 */
export function rootGrantsFrom(
  isAllScreens: boolean,
  allowedScreens: readonly string[],
  screenActions: ScreenActionMap | null | undefined,
): RootGrants {
  const out = new Set<Grant>();
  const screens = [...allowedScreens];
  for (const screen of ALLOWED_SCREENS) {
    for (const action of actionsFor(screen)) {
      // ⚠️ الدالة نفسها التي يستدعيها `tenant.guard.ts` — لا نسخةٌ منها.
      if (isActionAllowed(isAllScreens, screens, screenActions, screen, action)) {
        out.add(grant(screen, action));
      }
    }
  }
  return out;
}

/**
 * The template the tenant guard checks once delegation is applied: unchanged when nobody
 * delegated to the actor, otherwise exactly what actorGrants leaves, every remaining screen
 * listing its own actions so isActionAllowed reads the same set /me/permissions returns.
 */
export function delegatedTemplate(template: TemplateGrants, chains: readonly (readonly DelegationLink[])[]): TemplateGrants {
  if (chains.length === 0) return template;
  const held = actorGrants(rootGrantsFrom(template.isAllScreens, template.allowedScreens, template.screenActions), chains);
  const allowedScreens: string[] = [];
  const screenActions: ScreenActionMap = {};
  for (const screen of ALLOWED_SCREENS) {
    const actions: ScreenAction[] = actionsFor(screen).filter((action) => held.has(grant(screen, action)));
    if (actions.length === 0) continue;
    allowedScreens.push(screen);
    screenActions[screen] = actions;
  }
  return { isAllScreens: false, allowedScreens, screenActions };
}
