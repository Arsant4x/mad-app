import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUnreadCount } from '../api/notifications';
import { useAuth } from '../auth/AuthContext';

interface NavItemDef {
  screen: string;
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
  { labelKey: 'grp_home', items: [{ screen: 'dashboard', to: '/', labelKey: 'nav_dashboard', end: true }] },
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
      { screen: 'invoice', to: '/invoices', labelKey: 'nav_invoices' },
      { screen: 'customers', to: '/customers', labelKey: 'nav_customers' },
    ],
  },
  {
    labelKey: 'grp_purchases',
    items: [
      { screen: 'suppliers', to: '/suppliers', labelKey: 'nav_suppliers' },
      { screen: 'products', to: '/products', labelKey: 'nav_products' },
      { screen: 'inventory', to: '/warehouses', labelKey: 'nav_warehouses' },
      { screen: 'inventory', to: '/stock-levels', labelKey: 'nav_stock_levels' },
      { screen: 'inventory', to: '/stock-movements', labelKey: 'nav_stock_movements' },
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
    ],
  },
  { labelKey: 'grp_branches', items: [{ screen: 'branches', to: '/branches', labelKey: 'nav_branches' }] },
  {
    labelKey: 'grp_hr',
    items: [
      { screen: 'employees', to: '/employees', labelKey: 'nav_employees' },
      { screen: 'employees', to: '/leaves', labelKey: 'nav_leaves' },
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

  const canSee = (screen: string) => user?.allowedScreens === 'all' || user?.allowedScreens.includes(screen);

  return (
    <div className="app-shell">
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
            const visibleItems = group.items.filter((item) => canSee(item.screen));
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
              <NavLink to="/company-users" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                {t('nav_company_users')}
              </NavLink>
            )}
          </div>
        </nav>
        <button className="logout-btn" onClick={() => logout()}>
          {t('logout')}
        </button>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
