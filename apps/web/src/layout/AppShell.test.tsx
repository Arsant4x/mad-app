import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { AppShell } from './AppShell';

const state = vi.hoisted(() => ({ status: 'ACTIVE', neverSubscribed: true, subscriptionReads: 0 }));

vi.mock('../api/notifications', () => ({ getUnreadCount: () => Promise.resolve({ unread: 0 }) }));
vi.mock('../api/zatca', () => ({
  getZatcaUnreported: () => Promise.resolve({ onboarded: true, count: 3, oldestIssueDate: null, failedQueue: 0 }),
}));
vi.mock('../api/consent', () => ({ getConsentState: () => Promise.resolve({ blocked: false }) }));
vi.mock('../api/subscription', () => ({
  getSubscription: () => {
    state.subscriptionReads += 1;
    return Promise.resolve({ status: state.status, neverSubscribed: state.neverSubscribed });
  },
}));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { actorType: 'COMPANY', displayName: 'Owner', status: state.status }, logout: () => undefined }),
}));
vi.mock('../auth/PermissionsContext', () => ({ usePermissions: () => ({ canSee: () => true }) }));

// File budget: one shell render per case, well under the default.
vi.setConfig({ testTimeout: 5_000 });

const renderShell = () =>
  render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  );

describe('AppShell in both languages', () => {
  afterEach(() => act(() => setLanguage('ar')));

  it('renders Arabic by default, right to left, with the same texts as before', async () => {
    renderShell();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('button', { name: 'القائمة' })).toBeInTheDocument();
    expect(await screen.findByText('فواتيرك لا تصل الهيئة — 3 مستنداً صادراً لم يُقبَل بعد')).toBeInTheDocument();
  });

  it('switches to English, left to right, and remembers the choice', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('ui_language')).toBe('en');
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(await screen.findByText('Your invoices are not reaching ZATCA: 3 issued documents not yet accepted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'العربية' })).toBeInTheDocument();
  });
});

describe('AppShell frozen banner', () => {
  afterEach(() => {
    state.status = 'ACTIVE';
    state.neverSubscribed = true;
    state.subscriptionReads = 0;
    act(() => setLanguage('ar'));
  });

  const NEVER_AR = 'لا يوجد اشتراك فعّال لمنشأتك. يمكنك الاطلاع على بياناتك وتصديرها، ولا تتاح الإضافة أو التعديل أو الحذف حتى يُفعَّل الاشتراك.';
  const ENDED_AR = 'انتهى اشتراكك — أنت في فترة سماح للاطلاع والتصدير فقط. لا يمكن الإضافة أو التعديل أو الحذف حتى التجديد.';

  it('does not tell a company that never subscribed that its subscription ended', async () => {
    state.status = 'FROZEN';
    state.neverSubscribed = true;
    renderShell();
    expect(await screen.findByText(NEVER_AR)).toBeInTheDocument();
    await act(async () => undefined);
    expect(state.subscriptionReads).toBe(1);
    expect(screen.queryByText(ENDED_AR)).toBeNull();
    expect(screen.getByRole('link', { name: 'تفاصيل الاشتراك' })).toBeInTheDocument();
  });

  it('tells a company whose subscription lapsed that it ended', async () => {
    state.status = 'FROZEN';
    state.neverSubscribed = false;
    renderShell();
    expect(await screen.findByText(ENDED_AR)).toBeInTheDocument();
    expect(screen.queryByText(NEVER_AR)).toBeNull();
  });

  it('says the same in English', async () => {
    state.status = 'FROZEN';
    state.neverSubscribed = true;
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByText('Your company has no active subscription. You can view and export your data; adding, editing and deleting open once a subscription is active.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subscription details' })).toBeInTheDocument();
  });

  it('shows no banner and reads no subscription for an active company', async () => {
    renderShell();
    await screen.findByText('فواتيرك لا تصل الهيئة — 3 مستنداً صادراً لم يُقبَل بعد');
    expect(screen.queryByText(NEVER_AR)).toBeNull();
    expect(state.subscriptionReads).toBe(0);
  });
});
