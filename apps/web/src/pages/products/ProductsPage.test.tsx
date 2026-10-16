import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../../api/products';
import i18n from '../../i18n';
import { ProductsPage } from './ProductsPage';

vi.mock('../../api/products', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listProducts: vi.fn(),
  deleteProduct: vi.fn(),
}));

import { deleteProduct, listProducts } from '../../api/products';

// File budget: slowest case measured at 0.4 s under the full suite; three times that stays under the default.
vi.setConfig({ testTimeout: 5_000 });

const product: Product = {
  archived: false,
  id: 'p1',
  name: 'Held item',
  sku: null,
  category: null,
  unit: null,
  unitCode: 'H87',
  expiryTracked: false,
  taxCategory: 'S',
  taxExemptionReasonCode: null,
  taxExemptionReason: null,
  price: '100',
  cost: '40',
  minStock: '0',
  barcode: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listProducts).mockResolvedValue([product]);
});

describe('Deleting a product from the products screen', () => {
  it('shows the server refusal in the dialog instead of dropping it', async () => {
    const refusal = 'A product that still holds stock cannot be deleted.';
    vi.mocked(deleteProduct).mockRejectedValue({ response: { status: 409, data: { message: refusal } } });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Held item')).toBeTruthy());
    fireEvent.click(screen.getByTitle(i18n.t('common.row_menu.options')));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('products.list.delete') }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('products.list.delete_confirm') }));
    await waitFor(() => expect(screen.getByText(refusal)).toBeTruthy());
    expect(deleteProduct).toHaveBeenCalledWith('p1');
  });
});
