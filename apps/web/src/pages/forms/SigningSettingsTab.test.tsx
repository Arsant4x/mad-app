import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormSigningSettings } from '../../api/forms';
import { SigningSettingsTab } from './SigningSettingsTab';

vi.mock('../../api/forms', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFormSigningSettings: vi.fn(),
  updateFormSigningSettings: vi.fn(),
}));
let actorType = 'COMPANY';
vi.mock('../../auth/AuthContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useAuth: () => ({ user: { actorType } }),
}));

import { getFormSigningSettings, updateFormSigningSettings } from '../../api/forms';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): تقديرٌ أوّلٌ قبل أن يُقاس تحت حِمل الحزمة، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيس.
vi.setConfig({ testTimeout: 15_000 });

/**
 * ⚖️ **إعدادُ التوقيع لمالك المنشأة** (توجيه ٢٨٧ ② و④): المدّةُ لكلِّ نوعٍ وافتراضُها سبعة، وحدُّ نفاذ يُمحى بتفريغه، ويُرسل ما تغيّر وحدَه،
 * وغيرُ المالك يرى ولا يحفظ.
 */
const settings: FormSigningSettings = {
  nafathThreshold: '100000.00',
  currency: 'XYZ',
  defaultSignPeriodDays: 7,
  types: [
    { formTypeId: 't-a', code: 'A', name: 'تسليمُ وحدة', signPeriodDays: 7, isDefault: true },
    { formTypeId: 't-b', code: 'B', name: 'استلامُ وحدة', signPeriodDays: 10, isDefault: false },
  ],
};

describe('SigningSettingsTab', () => {
  beforeEach(() => {
    vi.mocked(getFormSigningSettings).mockReset().mockResolvedValue(settings);
    vi.mocked(updateFormSigningSettings).mockReset().mockResolvedValue(settings);
    actorType = 'COMPANY';
  });

  it('يعرض المدّةَ لكلِّ نوعٍ والافتراضَ والحدَّ بعملة المنشأة', async () => {
    render(<SigningSettingsTab />);
    expect(await screen.findByLabelText('مدّةُ التوقيع: تسليمُ وحدة')).toHaveValue(7);
    expect(screen.getByLabelText('مدّةُ التوقيع: استلامُ وحدة')).toHaveValue(10);
    expect(screen.getByText('الافتراض')).toBeInTheDocument();
    expect(screen.getByLabelText('حدُّ نفاذ')).toHaveValue(100000);
    expect(screen.getByText(/XYZ/)).toBeInTheDocument();
  });

  it('المالكُ يحفظ ما تغيّر وحدَه، وتفريغُ الحدّ يمحوه', async () => {
    render(<SigningSettingsTab />);
    fireEvent.change(await screen.findByLabelText('مدّةُ التوقيع: تسليمُ وحدة'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('حدُّ نفاذ'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(updateFormSigningSettings).toHaveBeenCalledTimes(1));
    expect(updateFormSigningSettings).toHaveBeenCalledWith({ nafathThreshold: null, periods: [{ formTypeId: 't-a', signPeriodDays: 5 }] });
  });

  it('غيرُ المالك يرى ولا يحرّر ولا يحفظ', async () => {
    actorType = 'COMPANY_USER';
    render(<SigningSettingsTab />);
    expect(await screen.findByLabelText('مدّةُ التوقيع: تسليمُ وحدة')).toBeDisabled();
    expect(screen.getByLabelText('حدُّ نفاذ')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'حفظ' })).toBeNull();
    expect(screen.getByText('يضبط هذا الإعدادَ مالكُ المنشأة.')).toBeInTheDocument();
  });
});
