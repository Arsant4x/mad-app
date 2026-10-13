import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ClosedAccountView } from '../pages/subscription/ClosedAccountView';
import { ConsentRequiredView } from '../pages/subscription/ConsentRequiredView';
import { getConsentState, type ConsentState } from '../api/consent';
import { useTranslation } from 'react-i18next';
import { getUnreadCount } from '../api/notifications';
import { getZatcaUnreported, type ZatcaUnreported } from '../api/zatca';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../auth/PermissionsContext';
import { exitSupportMode, supportCompanyId, supportCompanyName } from '../lib/supportMode';
import { currentLanguage, setLanguage } from '../i18n';
import { formatDate } from '../i18n/format';
import { CurrencyProvider } from '../components/currency/CurrencyContext';

interface NavItemDef {
  /**
   * The screen that guards this entry. `null` means no screen guard on
   * purpose, matching a server route without one (my tasks, notifications).
   * It does not mean "everything for everyone": the service itself limits the
   * query to its owner, and a screen guard here would hide assigned work.
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
      // No screen guard, matching the server: "my tasks" reads what the actor
      // was assigned, and a screen guard would hide it from a limited employee.
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
      { screen: 'contracts', to: '/forms', labelKey: 'nav_forms' },
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
      // Guarded by 'audit', matching the server: a compliance reviewer needs the
      // permission history without needing to manage employees.
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
   * "Your invoices are not reaching the tax authority": a standing warning, not
   * a dismissible notice. After stamping, the receipt looks complete even when
   * it never reached the authority, so this banner keeps the problem visible.
   * Shown only to a connected company; for one that is not connected the
   * report lives in the company profile.
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

  /**
   * Sub-processor consent is read once when the shell opens; it changes a few
   * times a year. A failed read blocks nothing: the server is the gate, and
   * this screen is only its face.
   */
  const [consent, setConsent] = useState<ConsentState | null>(null);
  useEffect(() => {
    let cancelled = false;
    getConsentState()
      .then((s) => !cancelled && setConsent(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // A lookup in a set the server decided; no rule lives here (see PermissionsContext).
  const { canSee } = usePermissions();

  const inSupportMode = user?.actorType === 'PLATFORM_ADMIN' && !!supportCompanyId();

  // Mobile menu: a class on the root opens the sliding sidebar, the backdrop
  // closes it, and every navigation closes it.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    // Choosing a destination ends the need for the menu; leaving it open over
    // the new page would make the user close it by hand after every move.
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className={mobileMenuOpen ? 'app-shell mobile-menu-open' : 'app-shell'}>
      {/* Fixed menu button, shown under 860px by CSS; its icon switches between open and close. */}
      <button className="mobile-menu-btn" title={t('shell.menu')} aria-label={t('shell.menu')} onClick={() => setMobileMenuOpen((v) => !v)}>
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
      {/* Support preview is never hidden: a permanent red bar with an immediate exit. */}
      {inSupportMode && (
        <div style={{ position: 'fixed', top: 0, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 200, background: 'var(--rose)', color: '#fff', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span>{t('shell.support_banner', { company: supportCompanyName() })}</span>
          <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: '#fff', marginInlineStart: 'auto' }} onClick={() => { exitSupportMode(); window.location.href = '/'; }}>
            {t('shell.support_exit')}
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
            {unread > 0 && <span className="badge overdue" style={{ marginInlineStart: 6 }}>{unread}</span>}
          </NavLink>
          {NAV_GROUPS.map((group) => {
            // A null screen is always shown; the guard is in the service.
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
        <button type="button" className="logout-btn" onClick={() => setLanguage(currentLanguage() === 'ar' ? 'en' : 'ar')}>
          {t('language_toggle')}
        </button>
        <button className="logout-btn" onClick={() => logout()}>
          {t('logout')}
        </button>
      </aside>
      <main className="main-content">
        {/* Standing and permanent: no close button on purpose. */}
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
              {t('shell.einvoice_unreported', { n: unreported.count })}
              {unreported.oldestIssueDate ? t('shell.einvoice_oldest', { date: formatDate(unreported.oldestIssueDate) }) : ''}
              {unreported.failedQueue > 0 ? t('shell.einvoice_failed', { n: unreported.failedQueue }) : ''}
            </span>
            <NavLink to="/company-profile" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {t('shell.einvoice_report_link')}
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
            <span>{t('shell.frozen_banner')}</span>
            <NavLink to="/subscription" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {t('shell.renew_now')}
            </NavLink>
          </div>
        )}
        {/* A closed account sees only its state and the reopen request. Then the
            sub-processor consent: a choice, not a block; a closed account is not
            asked to consent to processing that no longer happens, so the order matters. */}
        {user?.status === 'CLOSED' ? (
          <ClosedAccountView onLogout={logout} />
        ) : consent?.blocked ? (
          <ConsentRequiredView state={consent} onAccepted={setConsent} onLogout={logout} />
        ) : (
          <CurrencyProvider>
            <Outlet />
          </CurrencyProvider>
        )}
      </main>
    </div>
  );
}
