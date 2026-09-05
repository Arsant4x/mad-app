import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUnreadCount } from '../api/notifications';
import { getZatcaUnreported, type ZatcaUnreported } from '../api/zatca';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../auth/PermissionsContext';
import { exitSupportMode, supportCompanyId, supportCompanyName } from '../lib/supportMode';

interface NavItemDef {
  /**
   * الشاشة التي تحرس هذا المدخل — و`null` يعني **بلا حارس شاشة عمداً**،
   * مطابقةً لنقطةٍ في الخادم بلا `@RequiresScreen` (مهامي · الإشعارات).
   *
   * ⚠️ ولا يعني «للجميع بلا حساب»: الحراسة داخل الخدمة نفسها — الاستعلام
   * مقيَّدٌ بصاحبه. وحارسُ شاشةٍ فوقه يُخفي عن الموظف ما كُلِّف به.
   */
  screen: string | null;
  to: string;
  labelKey: string;
  end?: boolean;
}

interface NavGroupDef {
  labelKey: string;
  items: NavItemDef[];
}

/** Sidebar sections, in the same order and grouping as the mockup's
 * nav-group-label blocks (grp_home/grp_accounting/grp_sales/...). Matching
 * this structure — not just the flat list of links — is what makes the
 * sidebar look like the original instead of one long undifferentiated list. */
const NAV_GROUPS: NavGroupDef[] = [
  {
    labelKey: 'grp_home',
    items: [
      { screen: 'dashboard', to: '/', labelKey: 'nav_dashboard', end: true },
      // ⚠️ `screen: null` — **بلا حارس شاشة، مطابقةً للخادم**. «مهامي» يقرأ
      // ما كُلِّف به الفاعل نفسه، وحارسُ شاشةٍ يُخفي عن موظفٍ محدود الصلاحية
      // ما كُلِّف به — وهو نقيض الغرض. نظيرُه: `notifications`.
      { screen: null, to: '/my-tasks', labelKey: 'nav_my_tasks' },
    ],
  },
  {
    labelKey: 'grp_accounting',
    items: [
      { screen: 'accounts', to: '/accounts', labelKey: 'nav_accounts' },
      { screen: 'journal', to: '/journal', labelKey: 'nav_journal' },
      { screen: 'fiscal', to: '/fiscal', labelKey: 'nav_fiscal' },
    ],
  },
  {
    labelKey: 'grp_sales',
    items: [
      { screen: 'pos', to: '/pos', labelKey: 'nav_pos' },
      { screen: 'quotes', to: '/quotes', labelKey: 'nav_quotes' },
      { screen: 'invoice', to: '/invoices', labelKey: 'nav_invoices' },
      { screen: 'payments', to: '/payments', labelKey: 'nav_payments' },
      { screen: 'customers', to: '/customers', labelKey: 'nav_customers' },
    ],
  },
  {
    labelKey: 'grp_purchases',
    items: [
      { screen: 'suppliers', to: '/suppliers', labelKey: 'nav_suppliers' },
      { screen: 'products', to: '/products', labelKey: 'nav_products' },
      { screen: 'suppliers', to: '/incorporation-report', labelKey: 'nav_incorp_report' },
      { screen: 'inventory', to: '/warehouses', labelKey: 'nav_warehouses' },
      { screen: 'inventory', to: '/stock-levels', labelKey: 'nav_stock_levels' },
      { screen: 'inventory', to: '/stock-movements', labelKey: 'nav_stock_movements' },
      { screen: 'inventory', to: '/expiring', labelKey: 'nav_expiring' },
    ],
  },
  {
    labelKey: 'grp_realestate',
    items: [
      { screen: 'properties', to: '/properties', labelKey: 'nav_properties' },
      { screen: 'properties', to: '/units', labelKey: 'nav_units' },
      { screen: 'contracts', to: '/contracts', labelKey: 'nav_contracts' },
      { screen: 'contracts', to: '/reminders', labelKey: 'nav_reminders' },
      { screen: 'maintenance', to: '/maintenance', labelKey: 'nav_maintenance' },
      { screen: 'maintenance', to: '/warranties', labelKey: 'nav_warranties' },
    ],
  },
  { labelKey: 'grp_branches', items: [{ screen: 'branches', to: '/branches', labelKey: 'nav_branches' }] },
  {
    labelKey: 'grp_hr',
    items: [
      { screen: 'employees', to: '/employees', labelKey: 'nav_employees' },
      { screen: 'employees', to: '/hr', labelKey: 'nav_hr' },
    ],
  },
  {
    labelKey: 'grp_banks',
    items: [
      { screen: 'banks', to: '/banks', labelKey: 'nav_banks' },
      { screen: 'transactions', to: '/transactions', labelKey: 'nav_transactions' },
    ],
  },
  {
    labelKey: 'grp_compliance',
    items: [
      { screen: 'obligations', to: '/obligations', labelKey: 'nav_obligations' },
      { screen: 'scripts', to: '/scripts', labelKey: 'nav_scripts' },
      { screen: 'audit', to: '/audit-log', labelKey: 'nav_audit_log' },
      // ⚠️ `audit` — **مطابقةً لحارس الخادم** كما في المسار. من يدقّق
      // الامتثال يحتاج تاريخ الصلاحيات ولا يحتاج إدارة الموظفين، وموضعُه
      // هنا بجانب سجل التدقيق يقول ذلك. (قرار المالك 2026-08-13.)
      { screen: 'audit', to: '/delegation-log', labelKey: 'nav_delegation_log' },
      { screen: 'audit', to: '/trash', labelKey: 'nav_trash' },
    ],
  },
  { labelKey: 'grp_reports', items: [{ screen: 'reports', to: '/reports', labelKey: 'nav_reports' }] },
  { labelKey: 'grp_settings', items: [{ screen: 'settings', to: '/settings', labelKey: 'nav_settings' }] },
];

/** How often the sidebar re-checks the unread count. Two minutes: escalation is
 * a daily-threshold mechanism, so a tighter poll would be network traffic
 * bought for no earlier knowledge. */
const UNREAD_POLL_MS = 120_000;

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // A failed count must never break the shell — the badge simply doesn't
    // update, and every screen behind it keeps working.
    const poll = () =>
      getUnreadCount()
        .then((r) => !cancelled && setUnread(r.unread))
        .catch(() => undefined);

    poll();
    const timer = setInterval(poll, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  /**
   * «فواتيرك لا تصل الهيئة» — تحذيرٌ **ظاهرٌ ومستمر لا إشعارٌ يُغلق** (ق-١٨٢/١ · شرطُ
   * قبول الختم المتزامن ق-١٩٦): بعد الختم يخرج الإيصال مكتملَ الشكل وإن لم يصل
   * الهيئة — فهذا الشريط هو ما يُبقي العلّةَ مرئيّة. يُعرض لمنشأةٍ **مربوطة** فقط؛
   * غيرُ المربوطة لا نعرف موجتها (حدٌّ معلَن)، وتقريرُها في ملف المنشأة.
   */
  const [unreported, setUnreported] = useState<ZatcaUnreported | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      getZatcaUnreported()
        .then((r) => !cancelled && setUnreported(r))
        .catch(() => undefined);
    poll();
    const timer = setInterval(poll, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // ⚠️ بحثٌ في مجموعةٍ محسومة من الخادم — لا قاعدة هنا. انظر
  // `PermissionsContext`: نسختان من قاعدةٍ واحدة تفترقان بلا شكوى.
  const { canSee } = usePermissions();

  const inSupportMode = user?.actorType === 'PLATFORM_ADMIN' && !!supportCompanyId();

  // قائمة الجوال — منقولة من toggleMobileMenu/goTo في النموذج (أ٣): فئةٌ على
  // الجذر تفتح الشريط المنزلق، والستارة تغلقه، وكل تنقّلٍ يغلقه تلقائياً.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    // نظير `classList.remove('mobile-menu-open')` داخل goTo() في النموذج:
    // اختيارُ وجهةٍ يعني انتهاء الحاجة للقائمة — إبقاؤها مفتوحة فوق الصفحة
    // الجديدة يجبر المستخدم على إغلاقها يدوياً بعد كل تنقّل.
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className={mobileMenuOpen ? 'app-shell mobile-menu-open' : 'app-shell'}>
      {/* زر الهامبرغر الثابت (يظهر تحت 860px فقط عبر CSS) — أيقونته تتبدّل
       * بين ☰ و✕ كما في النموذج حرفياً. */}
      <button className="mobile-menu-btn" title="القائمة" aria-label="القائمة" onClick={() => setMobileMenuOpen((v) => !v)}>
        {mobileMenuOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 19, height: 19 }}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 19, height: 19 }}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>
      <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      {/* §1.10: معاينة الدعم لا تُخفى أبداً — شريط أحمر دائم مع مخرج فوري. */}
      {inSupportMode && (
        <div style={{ position: 'fixed', top: 0, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 200, background: 'var(--rose)', color: '#fff', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span>🔍 وضع الدعم الفني — معاينة «{supportCompanyName()}» للقراءة فقط، وكل ما تفتحه مسجَّل أمام المنشأة</span>
          <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: '#fff', marginInlineStart: 'auto' }} onClick={() => { exitSupportMode(); window.location.href = '/'; }}>
            خروج من وضع الدعم
          </button>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">{t('app_name')}</div>
        <div className="current-user">
          <div>{user?.displayName}</div>
        </div>
        <nav>
          {/* Not screen-gated: a notification is already filtered to the person
           * it was addressed to, and gating the bell behind some other screen's
           * permission would hide a manager's own escalations from them. */}
          <NavLink to="/notifications" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            {t('nav_notifications')}
            {unread > 0 && <span className="badge overdue" style={{ marginRight: 6 }}>{unread}</span>}
          </NavLink>
          {NAV_GROUPS.map((group) => {
            // `screen: null` ⇒ يظهر دائماً — والحراسة في الخدمة لا هنا.
            const visibleItems = group.items.filter((item) => item.screen === null || canSee(item.screen));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.labelKey}>
                <div className="nav-group-label">{t(group.labelKey)}</div>
                {visibleItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                    {t(item.labelKey)}
                  </NavLink>
                ))}
              </div>
            );
          })}
          <div>
            <div className="nav-group-label">{t('grp_company')}</div>
            {/* Not gated by a permission-template screen — matches the
             * backend's company-profile route, which any tenant actor can
             * read (only actorType COMPANY can edit, enforced server-side). */}
            <NavLink to="/company-profile" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              {t('nav_company_profile')}
            </NavLink>
            {user?.actorType === 'COMPANY' && (
              <>
                <NavLink to="/subscription" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                  {t('nav_subscription')}
                </NavLink>
                <NavLink to="/company-users" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                  {t('nav_company_users')}
                </NavLink>
              </>
            )}
          </div>
        </nav>
        <button className="logout-btn" onClick={() => logout()}>
          {t('logout')}
        </button>
      </aside>
      <main className="main-content">
        {/* ق-١٨٢/١: ظاهرٌ ومستمرٌ — بلا زرّ إغلاق عمداً. */}
        {unreported && unreported.onboarded && unreported.count > 0 && (
          <div
            role="alert"
            data-testid="zatca-unreported-banner"
            style={{
              background: '#fdecea',
              color: '#8a1c13',
              border: '1px solid #f3b6ae',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>
              فواتيرك لا تصل الهيئة — {unreported.count} مستنداً صادراً لم يُقبَل بعد
              {unreported.oldestIssueDate ? `، أقدمها بتاريخ ${new Date(unreported.oldestIssueDate).toLocaleDateString('ar-SA')}` : ''}
              {unreported.failedQueue > 0 ? ` · ${unreported.failedQueue} في الطابور استُنفدت محاولاته` : ''}
            </span>
            <NavLink to="/company-profile" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
              تقرير «صادرٌ لم يصل»
            </NavLink>
          </div>
        )}
        {user?.status === 'FROZEN' && (
          <div
            style={{
              background: '#fdecea',
              color: '#8a1c13',
              border: '1px solid #f3b6ae',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>انتهى اشتراكك — أنت في فترة سماح للاطلاع والتصدير فقط. لا يمكن الإضافة أو التعديل أو الحذف حتى التجديد.</span>
            <NavLink to="/subscription" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
              جدّد الآن
            </NavLink>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
