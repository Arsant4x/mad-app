import { ALLOWED_SCREENS, SCREEN_ACTIONS, ScreenActionMap, isActionAllowed } from '../templates/screens';
import { Grant, grant } from './permission-tree';
import { RootGrants } from './intersection';

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
    for (const action of SCREEN_ACTIONS) {
      // ⚠️ الدالة نفسها التي يستدعيها `tenant.guard.ts` — لا نسخةٌ منها.
      if (isActionAllowed(isAllScreens, screens, screenActions, screen, action)) {
        out.add(grant(screen, action));
      }
    }
  }
  return out;
}
