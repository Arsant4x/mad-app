import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VatDeclarationPage } from './VatDeclarationPage';
import * as api from '../../api/obligations';

vi.mock('../../api/obligations');

const declaration = (limits: api.VatDeclaration['limits']): api.VatDeclaration => ({
  year: 2026,
  quarter: 2,
  from: '2026-04-01',
  to: '2026-06-30',
  salesStandard: '100.00',
  salesStandardVat: '15.00',
  salesExempt: '50.00',
  salesZeroRatedDomestic: '0.00',
  salesExports: '0.00',
  salesCitizens: '0.00',
  salesCitizensNote: 'صفرٌ معلَن',
  totalSales: '150.00',
  salesOutOfScope: { lineCount: 0, net: '0.00' },
  legacyZeroLines: { lineCount: 0, net: '0.00' },
  legacyStandardLines: { lineCount: 0, net: '0.00' },
  boxes: { 1: { net: '100.00', vat: '15.00' }, 2: { net: '0.00', vat: '0.00', supported: false }, 3: { net: '0.00' }, 4: { net: '0.00' }, 5: { net: '50.00' }, 6: { net: '150.00' } },
  rent: {
    standard: '0.00',
    standardVat: '0.00',
    exempt: '50.00',
    managedExcluded: '0.00',
    managedCount: 0,
    legacyStandard: '0.00',
    legacyStandardVat: '0.00',
    legacyExempt: '0.00',
    legacyCount: 0,
    legacyNote: '',
    unclassifiedCount: 0,
    unclassifiedNote: '',
    unpostedCount: 0,
    pendingCount: 0,
    pendingNote: '',
    accrualCount: 1,
  } as api.VatDeclaration['rent'],
  purchasesStandard: '0.00',
  purchasesStandardVat: '0.00',
  purchasesExempt: '0.00',
  purchasesExcluded: '0.00',
  excludedCount: 0,
  totalPurchases: '0.00',
  netVat: '15.00',
  invoiceCount: 1,
  purchaseCount: 0,
  filed: null,
  changedSinceFiled: false,
  filedNote: null,
  limits,
});

/** الحدُّ المعلَن (`ق-١٢٦٠`) يُعرض كما جاء من الخادم في وجه الإقرار — ولا يُشتقّ في الشاشة. */
describe('حدودُ الإقرار المعلَنة', () => {
  beforeEach(() => vi.clearAllMocks());

  it('يعرض بانرَ الحدّ بنصّ الخادم حين يعلنه', async () => {
    vi.mocked(api.getVatDeclaration).mockResolvedValue(
      declaration([{ code: 'PROPORTIONAL_INPUT_VAT_NOT_BUILT', severity: 'blocking', message: 'الخصمُ النسبيّ لضريبة المدخلات (م٥١) غيرُ مبنيّ' }]),
    );
    render(
      <MemoryRouter>
        <VatDeclarationPage />
      </MemoryRouter>,
    );
    const banner = await screen.findByTestId('vat-limit');
    expect(banner).toHaveTextContent('لا يُقدَّم هذا الإقرار');
    expect(banner).toHaveTextContent('م٥١');
  });

  it('ولا بانرَ حين لا حدّ', async () => {
    vi.mocked(api.getVatDeclaration).mockResolvedValue(declaration([]));
    render(
      <MemoryRouter>
        <VatDeclarationPage />
      </MemoryRouter>,
    );
    await screen.findByText(/عن الفترة من/);
    expect(screen.queryByTestId('vat-limit')).toBeNull();
  });
});
