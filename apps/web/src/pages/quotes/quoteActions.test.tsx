import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { QuotesPage } from './QuotesPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/quotes', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listQuotes: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listQuotes } from '../../api/quotes';

beforeEach(() => {
  resetGrants('quotes:view');
  vi.mocked(listQuotes).mockResolvedValue([
    { id: 'q1', no: 'QT-1', customer: { id: 'c1', name: 'Buyer' }, issueDate: '2026-06-01', validUntil: '2099-01-01', total: '115.00', derivedStatus: 'DRAFT', convertedInvoice: null },
  ] as never);
});

async function shown() {
  render(
    <MemoryRouter>
      <QuotesPage />
    </MemoryRouter>,
  );
  await screen.findByText('QT-1');
}

/** A quote adds, edits and deletes on its screen; converting issues an invoice, so it follows add on invoices. */
describe('Quote controls follow the actions', () => {
  it('a view only employee gets no new, convert or row actions', async () => {
    await shown();
    expect(hasButton(i18n.t('quotes.page.new'))).toBe(false);
    expect(hasButton(i18n.t('quotes.page.convert'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('every quote action without add on invoices still hides the convert button', async () => {
    grants.add('quotes:add').add('quotes:edit').add('quotes:delete');
    await shown();
    expect(hasButton(i18n.t('quotes.page.new'))).toBe(true);
    expect(hasButton(i18n.t('quotes.page.convert'))).toBe(false);
    expect(rowMenuLabels()).toEqual([i18n.t('quotes.page.edit'), i18n.t('quotes.page.delete')]);
  });

  it('add on invoices shows the convert button', async () => {
    grants.add('invoice:add');
    await shown();
    expect(hasButton(i18n.t('quotes.page.convert'))).toBe(true);
  });
});
