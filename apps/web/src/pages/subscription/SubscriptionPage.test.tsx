import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../i18n';
import { SubscriptionPage } from './SubscriptionPage';

const sub = vi.hoisted(() => ({
  current: {
    orgName: 'Owner Co',
    status: 'FROZEN',
    subStart: '2026-10-16',
    subEnd: '2026-10-16',
    daysLeft: 0,
    inGrace: true,
    graceDaysLeft: 30,
    neverSubscribed: true,
  } as Record<string, unknown>,
}));

vi.mock('../../api/subscription', () => ({
  getSubscription: () => Promise.resolve(sub.current),
  exportAllData: () => Promise.resolve({}),
}));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ logout: () => undefined }) }));
vi.mock('./DeletionRequestCard', () => ({ DeletionRequestCard: () => null }));

// File budget: one page render per case, well under the default.
vi.setConfig({ testTimeout: 5_000 });

describe('SubscriptionPage', () => {
  afterEach(() => {
    sub.current = { ...sub.current, status: 'FROZEN', subEnd: '2026-10-16', neverSubscribed: true };
    act(() => setLanguage('ar'));
  });

  it('offers no renewal: subscription time is never granted without payment', async () => {
    render(<SubscriptionPage />);
    expect(await screen.findByText('Owner Co')).toBeInTheDocument();
    expect(screen.queryByText(/تجديد/)).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['تصدير كل البيانات']);
  });

  it('tells a company that never subscribed that it has no subscription, not that one ended', async () => {
    render(<SubscriptionPage />);
    expect(await screen.findByText('بلا اشتراك (اطلاع فقط)')).toBeInTheDocument();
    expect(screen.getByText(/لا يوجد اشتراك فعّال لمنشأتك/)).toBeInTheDocument();
    expect(screen.queryByText(/انتهى اشتراكك/)).toBeNull();
  });

  it('keeps the ended message for a subscription that had a term', async () => {
    sub.current = { ...sub.current, subEnd: '2026-10-01', subStart: '2026-09-01', neverSubscribed: false };
    render(<SubscriptionPage />);
    expect(await screen.findByText('فترة سماح (اطلاع فقط)')).toBeInTheDocument();
    expect(screen.getByText(/انتهى اشتراكك/)).toBeInTheDocument();
  });

  it('says the same in English', async () => {
    act(() => setLanguage('en'));
    render(<SubscriptionPage />);
    expect(await screen.findByText('No subscription (view only)')).toBeInTheDocument();
    expect(screen.getByText(/Your company has no active subscription/)).toBeInTheDocument();
  });
});
