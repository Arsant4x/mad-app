import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { AppShell } from './AppShell';

vi.mock('../api/notifications', () => ({ getUnreadCount: () => Promise.resolve({ unread: 0 }) }));
vi.mock('../api/zatca', () => ({
  getZatcaUnreported: () => Promise.resolve({ onboarded: true, count: 3, oldestIssueDate: null, failedQueue: 0 }),
}));
vi.mock('../api/consent', () => ({ getConsentState: () => Promise.resolve({ blocked: false }) }));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { actorType: 'COMPANY', displayName: 'Owner', status: 'ACTIVE' }, logout: () => undefined }),
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
