import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from './AuthContext';
import { supportCompanyId } from '../lib/supportMode';

/**
 * الوحدة **الوحيدة** في الواجهة التي تلمس الصلاحيات.
 *
 * ## القاعدة ولماذا هي بنيوية لا أسلوبية
 *
 * قبل هذا الملف كانت قاعدة «كل الشاشات» مكتوبةً **مرتين** في الواجهة:
 * `AppShell.canSee` و`ScreenGuard`، كلٌّ يفكّ الرمز `'all'` بنفسه. ونسختان
 * من قاعدةٍ واحدة تفترقان عند أول تعديل — ولا يشتكي شيء: الشريط يُظهر
 * رابطاً والصفحة ترفضه، أو العكس.
 *
 * والمرحلة الثالثة تضاعف الخطر: لو حُسبت **الأفعال** في الواجهة لصار الحكم
 * موزّعاً على كل زرّ في المشروع. فالقاعدة: **الخادم يحكم، والواجهة تبحث**.
 *
 * ## ما ليس هنا
 *
 * لا تقاطع، ولا فكّ رمزٍ خاص، ولا «شاشة بلا أفعال تعني كل الأفعال». هذه
 * ثلاث قواعد تعيش في `isActionAllowed` و`effectiveGrants` على الخادم، ولا
 * أثر لها في هذا الملف: ما يصل مجموعةٌ **مسطّحة محسومة** من `شاشة:فعل`،
 * والبحث فيها ليس قاعدةً بل استعلام.
 *
 * ## ولماذا يُعاد الجلب عند كل تنقّل
 *
 * لأن الصلاحيات **لا تُذكَّر مؤقتاً**: تفويضٌ يُسحب يجب أن ينطفئ أثره بلا
 * خروجٍ وعودة. والنفاذ نفسه محسومٌ في الخادم عند كل طلب على أي حال — فما
 * هنا **عرضٌ لا منع**، وإخفاء الزر ليس منعاً.
 *
 * وكلفة الجلب قِيست: 236 µs حساباً (5.4% من معاملة سياق المستأجر المدفوعة
 * أصلاً في كل طلب).
 */

/** زوج `شاشة:فعل` كما يرسله الخادم — مسطّحاً ومحسوماً. */
type Grant = string;

export type ExtinctionReason = 'NOT_IN_ROOT' | 'REVOKED' | 'NARROWED';

/** منحةٌ أُعطيت ثم انطفأت — **محسوبةً في الخادم بسببها**. */
export interface ExtinguishedGrant {
  grant: Grant;
  reason: ExtinctionReason;
  atIndex: number;
  grantorId: string | null;
  granteeId: string | null;
}

export interface ChainView {
  links: { grantorId: string; granteeId: string; granted: Grant[]; revoked: boolean }[];
}

export interface TreeNode {
  key: string;
  label: string;
  screens: string[];
  children: TreeNode[];
}

interface MePermissions {
  grants: Grant[];
  extinguished: ExtinguishedGrant[];
  grantable: Grant[];
  chains: ChainView[];
  tree: TreeNode[];
}

interface PermissionsValue {
  /** جاري الجلب — الأزرار تنتظر ولا تُرسم متفائلة. */
  loading: boolean;
  /** هل يرى الفاعل هذه الشاشة؟ (بحثٌ لا حساب) */
  canSee: (screen: string) => boolean;
  /** هل يملك هذا الفعل على هذه الشاشة؟ (بحثٌ لا حساب) */
  can: (screen: string, action: string) => boolean;
  /** ما مُنح وانطفأ — للحالة الثالثة في شجرة التفويض. */
  extinguished: ExtinguishedGrant[];
  /** ما يجوز لهذا الفاعل تفويضه — مرشَّحاً في الخادم. */
  grantable: Grant[];
  chains: ChainView[];
  tree: TreeNode[];
  /** إعادة جلبٍ صريحة بعد منحٍ أو سحب. */
  refresh: () => void;
}

const EMPTY: MePermissions = { grants: [], extinguished: [], grantable: [], chains: [], tree: [] };

const PermissionsContext = createContext<PermissionsValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [data, setData] = useState<MePermissions>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  /**
   * مدير المنصّة خارج نطاق المستأجر: لا قالب له ولا تفويض، وصدفته
   * (`DeveloperShell`) لا تعرض شاشات الأعمال أصلاً. وفي وضع الدعم يدخل
   * منشأةً بعينها — فيُجلب حينئذٍ كأي فاعل.
   *
   * ⚠️ هذا تفريعٌ على **نوع الفاعل** لا حسابُ صلاحية: نفس التفريع القائم
   * في `RootShell` منذ البداية.
   */
  const isPlatformAdminOutsideTenant = user?.actorType === 'PLATFORM_ADMIN' && !supportCompanyId();

  useEffect(() => {
    if (!user || isPlatformAdminOutsideTenant) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<MePermissions>('/me/permissions')
      .then((res) => !cancelled && setData(res.data))
      // ⚠️ الفشل يُفرِغ ولا يُبقي القديم: إبقاء صلاحياتٍ سابقة بعد سحبها
      // هو بالضبط ما تمنعه القاعدة. والاتجاه الآمن الإخفاء لا الإظهار.
      .catch(() => !cancelled && setData(EMPTY))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, isPlatformAdminOutsideTenant, location.pathname, tick]);

  const held = useMemo(() => new Set(data.grants), [data.grants]);
  const screens = useMemo(() => new Set(data.grants.map((g) => g.slice(0, g.lastIndexOf(':')))), [data.grants]);

  const canSee = useCallback(
    (screen: string) => (isPlatformAdminOutsideTenant ? true : screens.has(screen)),
    [screens, isPlatformAdminOutsideTenant],
  );
  const can = useCallback(
    (screen: string, action: string) => (isPlatformAdminOutsideTenant ? true : held.has(`${screen}:${action}`)),
    [held, isPlatformAdminOutsideTenant],
  );

  const value = useMemo<PermissionsValue>(
    () => ({
      loading,
      canSee,
      can,
      extinguished: data.extinguished,
      grantable: data.grantable,
      chains: data.chains,
      tree: data.tree,
      refresh: () => setTick((n) => n + 1),
    }),
    [loading, canSee, can, data],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
}
