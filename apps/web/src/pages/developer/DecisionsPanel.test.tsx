import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformDecision } from '../../api/platformDecisions';
import { DecisionsPanel } from './DecisionsPanel';

const listPlatformDecisions = vi.fn();
const requestPlatformDecision = vi.fn();
vi.mock('../../api/platformDecisions', () => ({
  PLATFORM_DECISION_ACTIONS: ['ACCOUNT_ERASURE', 'SUBSCRIPTION_CHANGE', 'REFUND'],
  listPlatformDecisions: () => listPlatformDecisions(),
  requestPlatformDecision: (dto: unknown) => requestPlatformDecision(dto),
  decidePlatformDecision: vi.fn(),
}));

// File budget, three times the measured run under the whole suite.
vi.setConfig({ testTimeout: 15_000 });

const executed: PlatformDecision = {
  id: 'd1',
  action: 'SUBSCRIPTION_CHANGE',
  status: 'EXECUTED',
  targetId: 'company-1',
  summary: 'Extend the subscription by a year',
  requestedAt: '2026-10-01T00:00:00.000Z',
  decidedAt: '2026-10-02T00:00:00.000Z',
  executedAt: '2026-10-03T00:00:00.000Z',
  note: null,
  requestedSubEnd: '2027-10-01T00:00:00.000Z',
  requestedBy: { displayName: 'Finance one' },
  decidedBy: { displayName: 'Compliance one' },
  executedBy: { displayName: 'Finance two' },
};

beforeEach(() => {
  listPlatformDecisions.mockReset().mockResolvedValue([]);
  requestPlatformDecision.mockReset().mockResolvedValue({});
});

function fill(targetId: string, summary: string) {
  fireEvent.change(document.querySelector('input.num') as HTMLInputElement, { target: { value: targetId } });
  fireEvent.change(screen.getByPlaceholderText('ما الذي سيقع بالضبط، وعلى مَن'), { target: { value: summary } });
}

describe('The critical decisions panel', () => {
  it('sends the requested end date with a subscription change, and waits for it', async () => {
    render(<DecisionsPanel />);
    const date = document.getElementById('decision-sub-end') as HTMLInputElement;
    expect(date).toBeTruthy();
    fill('company-1', 'Extend the subscription by a year');
    const button = screen.getByText('طلب قرار') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(date, { target: { value: '2027-10-01' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(requestPlatformDecision).toHaveBeenCalledTimes(1));
    expect(requestPlatformDecision.mock.calls[0][0]).toEqual({
      action: 'SUBSCRIPTION_CHANGE',
      targetId: 'company-1',
      summary: 'Extend the subscription by a year',
      subEnd: '2027-10-01',
    });
  });

  it('asks no end date for another action and sends none', async () => {
    render(<DecisionsPanel />);
    fireEvent.change(document.querySelector('select') as HTMLSelectElement, { target: { value: 'REFUND' } });
    expect(document.getElementById('decision-sub-end')).toBeNull();
    fill('payment-1', 'Refund the double charge');
    fireEvent.click(screen.getByText('طلب قرار'));
    await waitFor(() => expect(requestPlatformDecision).toHaveBeenCalledTimes(1));
    expect('subEnd' in (requestPlatformDecision.mock.calls[0][0] as Record<string, unknown>)).toBe(false);
  });

  it('shows the approved end date and who carried the decision out', async () => {
    listPlatformDecisions.mockResolvedValue([executed]);
    render(<DecisionsPanel />);
    expect(await screen.findByText('النهاية المطلوبة: 01/10/2027')).toBeTruthy();
    expect(screen.getByText('نفّذه Finance two')).toBeTruthy();
  });
});
