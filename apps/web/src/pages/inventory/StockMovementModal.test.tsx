import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../../api/products';
import type { Warehouse } from '../../api/warehouses';
import i18n from '../../i18n';
import { StockMovementModal } from './StockMovementModal';

// File budget: slowest case measured at 0.5 s under the full suite; three times that stays under the default.
vi.setConfig({ testTimeout: 5_000 });

const grants = new Set<string>();
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ can: (screen: string, action: string) => grants.has(`${screen}:${action}`) }),
}));

const products = [{ id: 'p1', name: 'Item', sku: null, expiryTracked: false } as Product];
const warehouses = [{ id: 'w1', name: 'Store' } as Warehouse];

function open() {
  render(<StockMovementModal products={products} warehouses={warehouses} onCancel={() => undefined} onSave={vi.fn()} />);
  const typeSelect = screen.getAllByRole('combobox')[0];
  const save = screen.getByRole('button', { name: i18n.t('inventory.movement_modal.save') });
  const needsReview = () => screen.queryByText(i18n.t('inventory.movement_modal.needs_review'));
  return { typeSelect, save: save as HTMLButtonElement, needsReview };
}

beforeEach(() => {
  grants.clear();
});

/**
 * A manual movement that reduces inventory value (stock out, negative adjustment) needs the review action, so
 * the save button follows the action the server will ask for; other movements need record.
 */
describe('Stock movement save follows the action the movement needs', () => {
  it('disables saving a stock out without review, and says why', () => {
    grants.add('inventory:view').add('inventory:record');
    const { typeSelect, save, needsReview } = open();
    fireEvent.change(typeSelect, { target: { value: 'OUT' } });
    expect(save.disabled).toBe(true);
    expect(needsReview()).not.toBeNull();
  });

  it('disables a negative adjustment without review but not a positive one', () => {
    grants.add('inventory:view').add('inventory:record');
    const { typeSelect, save, needsReview } = open();
    fireEvent.change(typeSelect, { target: { value: 'ADJUSTMENT' } });
    const qty = screen.getByPlaceholderText(i18n.t('inventory.movement_modal.difference_placeholder'));
    fireEvent.change(qty, { target: { value: '-2' } });
    expect(save.disabled).toBe(true);
    expect(needsReview()).not.toBeNull();
    fireEvent.change(qty, { target: { value: '2' } });
    expect(save.disabled).toBe(false);
    expect(needsReview()).toBeNull();
  });

  it('keeps stock in and transfer on record', () => {
    grants.add('inventory:view').add('inventory:record');
    const { typeSelect, save, needsReview } = open();
    expect(save.disabled).toBe(false);
    fireEvent.change(typeSelect, { target: { value: 'TRANSFER' } });
    expect(save.disabled).toBe(false);
    expect(needsReview()).toBeNull();
  });

  it('allows a stock out with review', () => {
    grants.add('inventory:view').add('inventory:record').add('inventory:review');
    const { typeSelect, save, needsReview } = open();
    fireEvent.change(typeSelect, { target: { value: 'OUT' } });
    expect(save.disabled).toBe(false);
    expect(needsReview()).toBeNull();
  });
});
