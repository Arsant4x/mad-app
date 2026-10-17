import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { actor, resetGrants } from '../../test/grants';
import { hasButton } from '../../test/rowMenu';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/deletionRequests', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAccountClosureState: vi.fn(),
  getMyDeletionRequest: vi.fn(),
  getClosureArchive: vi.fn(),
}));
vi.mock('../../auth/AuthContext', async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...(await import('../../test/grants')).authModule() }));

const { getAccountClosureState, getClosureArchive, getMyDeletionRequest } = await import('../../api/deletionRequests');
const { ClosedAccountView } = await import('./ClosedAccountView');
const { ConsentRequiredView } = await import('./ConsentRequiredView');
const { DeletionRequestCard } = await import('./DeletionRequestCard');

const consent = { requiredVersion: 2, acceptedVersion: 1, blocked: true, effectiveFrom: '2026-10-01', noticeDays: 30, current: null, upcoming: null };

beforeEach(() => {
  resetGrants();
  vi.mocked(getAccountClosureState).mockResolvedValue({ status: 'CLOSED', closedAt: '2026-09-01', retainUntil: '2032-12-31', reopenUntil: '2099-01-01', erasedAt: null } as never);
  vi.mocked(getMyDeletionRequest).mockResolvedValue(null as never);
  vi.mocked(getClosureArchive).mockRejectedValue(new Error('owner only'));
});

/** The account requests and the sub-processor consent are the owner's; the server refuses them for an employee. */
describe('Account requests are offered to the owner only', () => {
  it('an employee of a closed company reads the state and can only sign out', async () => {
    render(<ClosedAccountView onLogout={() => {}} />);
    await screen.findByText(i18n.t('subscription.closed.reopen_note', { date: '2099-01-01' }));
    expect(hasButton(i18n.t('subscription.closed.request_reopen'))).toBe(false);
    expect(hasButton(i18n.t('subscription.closed.request_erase'))).toBe(false);
    expect(hasButton(i18n.t('subscription.common.logout'))).toBe(true);
  });

  it('the owner of a closed company can ask to reopen or erase', async () => {
    actor.type = 'COMPANY';
    render(<ClosedAccountView onLogout={() => {}} />);
    await screen.findByText(i18n.t('subscription.closed.request_reopen'));
    expect(hasButton(i18n.t('subscription.closed.request_erase'))).toBe(true);
  });

  it('an employee asked for consent can download and sign out, not accept or close the account', () => {
    render(<ConsentRequiredView state={consent} onAccepted={() => {}} onLogout={() => {}} />);
    expect(hasButton(i18n.t('subscription.consent.accept'))).toBe(false);
    expect(hasButton(i18n.t('subscription.consent.close_account'))).toBe(false);
    expect(hasButton(i18n.t('subscription.consent.download'))).toBe(true);
  });

  it('the owner asked for consent can accept or close the account', () => {
    actor.type = 'COMPANY';
    render(<ConsentRequiredView state={consent} onAccepted={() => {}} onLogout={() => {}} />);
    expect(hasButton(i18n.t('subscription.consent.accept'))).toBe(true);
    expect(hasButton(i18n.t('subscription.consent.close_account'))).toBe(true);
  });

  it('the deletion request card offers the request to the owner only', async () => {
    const { unmount } = render(<DeletionRequestCard />);
    await screen.findByText(i18n.t('subscription.deletion.title'));
    expect(hasButton(i18n.t('subscription.deletion.request'))).toBe(false);
    unmount();
    actor.type = 'COMPANY';
    render(<DeletionRequestCard />);
    expect(await screen.findByText(i18n.t('subscription.deletion.request'))).toBeTruthy();
  });
});
