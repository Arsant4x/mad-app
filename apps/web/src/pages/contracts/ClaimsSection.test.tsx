import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Contract } from '../../api/contracts';

vi.mock('../../api/contracts', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createClaim: vi.fn(),
}));

import { createClaim } from '../../api/contracts';
import { ClaimsSection } from './ClaimsSection';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): تقديرٌ أوّلٌ قبل أن يُقاس تحت حِمل الحزمة، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيس.
vi.setConfig({ testTimeout: 15_000 });

/**
 * ⚖️ **خانةُ المعاملة عند كلِّ مطالبة، والافتراضُ خاضع** (السؤالان ٥١ و٤١٣ · ق-١٦٠٠، بحكم صاحب المشروع) — والنيابةُ تُثبَت.
 */
const contract = { id: 'c1', status: 'DUE', claims: [], claimsOutstanding: '0.00' } as unknown as Contract;

function fill() {
  fireEvent.click(screen.getByText('+ مطالبة'));
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '100' } });
  fireEvent.change(screen.getByPlaceholderText('يظهر للمستأجر — اذكر السبب بوضوح'), { target: { value: 'كهرباء الشهر' } });
}

describe('⚖️ معاملةُ المطالبة الضريبية (ق-١٦٠٠)', () => {
  it('⭐ بلا اختيارٍ تُرسل خدمةً خاضعة، ويُعلَن أن الضريبةَ فوق المبلغ', async () => {
    vi.mocked(createClaim).mockResolvedValue(contract);
    render(<ClaimsSection contract={contract} onChanged={() => {}} />);
    fill();
    expect((screen.getByLabelText('المعاملة الضريبية') as HTMLSelectElement).value).toBe('TAXABLE_SERVICE');
    expect(screen.getByText(/تُضاف ضريبة ١٥٪ فوق المبلغ/)).toBeTruthy();
    fireEvent.click(screen.getByText('حفظ'));
    await waitFor(() => expect(createClaim).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createClaim).mock.calls[0][1]).toMatchObject({ amount: 100, taxTreatment: 'TAXABLE_SERVICE' });
  });

  it('والنيابةُ لا تُرسل بلا ما يثبتها، ثم تُرسل به', async () => {
    vi.mocked(createClaim).mockClear().mockResolvedValue(contract);
    render(<ClaimsSection contract={contract} onChanged={() => {}} />);
    fill();
    fireEvent.change(screen.getByLabelText('المعاملة الضريبية'), { target: { value: 'ON_BEHALF' } });
    expect((screen.getByText('حفظ') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('ما يثبت النيابة'), { target: { value: 'العدّادُ باسم المستأجر' } });
    fireEvent.click(screen.getByText('حفظ'));
    await waitFor(() => expect(createClaim).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createClaim).mock.calls[0][1]).toMatchObject({ taxTreatment: 'ON_BEHALF', onBehalfEvidence: 'العدّادُ باسم المستأجر' });
  });
});
