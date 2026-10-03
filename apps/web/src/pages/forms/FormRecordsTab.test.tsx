import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormRecordsTab } from './FormRecordsTab';

vi.mock('../../api/contracts', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getContract: vi.fn(),
  listContracts: vi.fn(),
}));
vi.mock('../../api/forms', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listContractForms: vi.fn(),
  listCompanyFormTemplates: vi.fn(),
  createContractForm: vi.fn(),
}));
const perms = { record: true };
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ can: (screen: string, action: string) => screen === 'contracts' && action === 'record' && perms.record }),
}));

import { getContract, listContracts } from '../../api/contracts';
import { listCompanyFormTemplates, listContractForms } from '../../api/forms';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): تقديرٌ أوّلٌ قبل أن يُقاس تحت حِمل الحزمة، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيس.
vi.setConfig({ testTimeout: 15_000 });

/**
 * ⚖️ **«النماذج» تُفتح على عقدها من الرابط** (`ق-١٦٣٨`: «وشاشةُ العقد الجديدة تضيف لاحقاً زرّاً يفتحها»): `?contract=` يحمل العقد،
 * فيقرأ الزرُّ هذا العقدَ لا غيرَه. والإنشاءُ «تسجيل» ومن المنشور وحدَه.
 */
const contract = {
  id: 'c1',
  no: 'EJ-2026-0042',
  tenant: 'محمّد',
  start: '2026-01-01',
  end: '2026-12-31',
  unit: { unitNo: '305', property: { id: 'p1', name: 'برج النخيل' } },
};

const mount = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <FormRecordsTab />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  perms.record = true;
  vi.mocked(getContract).mockResolvedValue(contract as never);
  vi.mocked(listContracts).mockResolvedValue({ items: [contract], total: 1, page: 1, pageSize: 10 } as never);
  vi.mocked(listContractForms).mockResolvedValue([]);
  vi.mocked(listCompanyFormTemplates).mockResolvedValue([
    { id: 't-pub', status: 'PUBLISHED', name: 'تسليمُ شقّة', version: 4 },
    { id: 't-draft', status: 'DRAFT', name: 'مسوّدةٌ لا تُعبّأ', version: 5 },
  ] as never);
});

describe('⚖️ «النماذج» على عقدها (ق-١٦٣٨)', () => {
  it('⭐ ‎?contract=‎ يفتح الشاشةَ على العقد بعينه ويقرأ سجلّاتِه', async () => {
    mount('/forms?contract=c1');
    await waitFor(() => expect(screen.getByText('EJ-2026-0042')).toBeTruthy());
    expect(getContract).toHaveBeenCalledWith('c1');
    expect(listContractForms).toHaveBeenCalledWith('c1');
    expect(listContracts).not.toHaveBeenCalled();
  });

  it('والقالبُ المنشورُ وحدَه يُعبّأ عليه', async () => {
    mount('/forms?contract=c1');
    await waitFor(() => expect(screen.getByRole('option', { name: 'تسليمُ شقّة · إصدار 4' })).toBeTruthy());
    expect(screen.queryByRole('option', { name: /مسوّدةٌ لا تُعبّأ/ })).toBeNull();
  });

  it('ومن لا يملك «تسجيل» لا يرى الإنشاء', async () => {
    perms.record = false;
    mount('/forms?contract=c1');
    await waitFor(() => expect(screen.getByText('EJ-2026-0042')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /إنشاءُ السجلّ/ })).toBeNull();
  });

  it('وبلا عقدٍ في الرابط يُبحث عن العقد أوّلاً', async () => {
    mount('/forms');
    await waitFor(() => expect(screen.getByRole('button', { name: 'نماذجُ هذا العقد' })).toBeTruthy());
    expect(getContract).not.toHaveBeenCalled();
  });
});
