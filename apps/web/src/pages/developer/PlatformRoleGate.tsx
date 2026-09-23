import { useEffect, useState, type ReactNode } from 'react';
import { apiClient, type PlatformRole } from '../../api/client';

/**
 * **قسمٌ لا يُعرض إلا لدوره** (`ق-١٣١٢` · ⑪A2 — باب `⑪ تشغيلُ المنصّة`).
 *
 * ## ولماذا مكوِّنٌ مستقلّ لا شرطٌ في اللوحة
 *
 * حارسُ «لا نظام صلاحيات ثانٍ» يمنع **لوحةَ المطوّر** من قراءة الفاعل إطلاقاً — وهو
 * **مُميِّزٌ بنيويّ لا قائمة**: اللوحةُ تُحرّر `allowedScreens` بوصفها **محتوى نموذج**، فخلطُ
 * ذلك بقراءة سلطة المستخدم الحالي هو بعينه ما لا يُراد. **فسقط عليّ الحارسُ في السير**،
 * وكان محقّاً — فانتقلت القراءةُ إلى هنا، ولا تحمل هذه الوحدةُ مفردةَ قاعدةٍ واحدة.
 *
 * ## والدورُ يُقرأ حيّاً لا من استجابة الدخول
 *
 * `GET /auth/me` يقرأ القاعدة في كلِّ نداء. **ولو قُرئ من `AuthUser` لتجمّد لحظةَ الدخول**
 * — وهي العلّةُ التي من أجلها استُبعد `allowedScreens` من ذلك النوع.
 *
 * ⚠️ **وهذا إخفاءٌ لا منع**: الحكمُ في الخادم (`PlatformAdminGuard`)، والغرضُ **ألّا يُقاد
 * أحدٌ إلى بابٍ يُردّ منه**. ومن عدّل الردَّ في متصفّحه لم يفتح باباً.
 */
export function PlatformRoleGate({ allow, children }: { allow: PlatformRole; children: ReactNode }) {
  const [role, setRole] = useState<PlatformRole | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ platformRole: PlatformRole | null }>('/auth/me')
      .then((r) => {
        if (!cancelled) setRole(r.data.platformRole);
      })
      // تعذّرت القراءة ⟵ لا يُعرض القسم. **والتضييقُ عند الشكّ** — فالخادمُ يردّ على أي حال.
      .catch(() => {
        if (!cancelled) setRole(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // `undefined` = لم تصل بعد: لا يُرسم القسمُ متفائلاً ثم يختفي.
  if (role === undefined) return null;
  // **ومالكُ المنصّة يمرّ بتعريفه** — فلا أحدَ يفقد لوحتَه بهذه الإضافة.
  if (role !== 'OWNER' && role !== allow) return null;
  return <>{children}</>;
}
