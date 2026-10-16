import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Contract } from '../../api/contracts';
import { RenewForm } from './ContractDetailModal';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): تقديرٌ أوّلٌ قبل أن يُقاس تحت حِمل الحزمة، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيس.
vi.setConfig({ testTimeout: 15_000 });

/**
 * ⚖️ **سطرٌ في نافذة التجديد حين لا يُخصم رصيدُ المستأجر لتغيّر التصنيف** (توجيه ٢٧٨ · `ق-١٦٣٧`، بحكم صاحب المشروع).
 * الرصيدُ من تفاصيل العقد في الخادم (`tenantCredit`)، والنافذةُ تقابل التصنيفَ المختار بتصنيف الأصل.
 */
const base = {
  id: 'c1',
  end: '2026-12-31',
  value: '12000.00',
  classification: 'COMMERCIAL',
  vatInclusion: 'EXCLUSIVE',
  lessor: 'COMPANY',
  ownerName: null,
  ownerVatNumber: null,
  exemptSharePercent: null,
  exemptShareBasis: null,
  deposits: [],
  unit: { property: { ownership: 'owned' } },
} as unknown as Contract;

const noop = async () => {};

describe('⚖️ رصيدُ المستأجر في نافذة التجديد (ق-١٦٣٧)', () => {
  it('بالتصنيف نفسِه يُقال إن الرصيدَ يُخصم من أقساط العقد الجديد', () => {
    render(<RenewForm contract={{ ...base, tenantCredit: '1725.00' }} onCancel={() => {}} onSubmit={noop} />);
    expect(screen.getByRole('note').textContent).toContain('يُخصم رصيدُ المستأجر');
  });

  it('⭐ وتصنيفٌ آخر يُظهر سطرَ «لم يُخصم لتغيّر التصنيف»', () => {
    render(<RenewForm contract={{ ...base, tenantCredit: '1725.00' }} onCancel={() => {}} onSubmit={noop} />);
    const [classification] = screen.getAllByRole('combobox');
    fireEvent.change(classification, { target: { value: 'RESIDENTIAL' } });
    expect(screen.getByRole('note').textContent).toContain('لم يُخصم لتغيّر التصنيف');
  });

  it('وبلا رصيدٍ لا سطر', () => {
    render(<RenewForm contract={{ ...base, tenantCredit: '0.00' }} onCancel={() => {}} onSubmit={noop} />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('Early renewal notice in the renewal form', () => {
  const contract = {
    ...base,
    no: 'EJ-2026-0007',
    installments: [
      { id: 'i1', dueDate: '2026-07-01T00:00:00.000Z', status: 'PAID' },
      { id: 'i2', dueDate: '2026-08-01T00:00:00.000Z', status: 'DUE' },
      { id: 'i3', dueDate: '2026-09-01T00:00:00.000Z', status: 'CANCELLED' },
      { id: 'i4', dueDate: '2026-10-01T00:00:00.000Z', status: 'PARTIAL' },
    ],
  } as unknown as Contract;
  const startInput = (container: HTMLElement) => container.querySelector('input[type="date"]') as HTMLInputElement;

  it('says the current contract ends the day before an early start and counts the installments after that day', () => {
    const { container } = render(<RenewForm contract={contract} onCancel={() => {}} onSubmit={noop} />);
    fireEvent.change(startInput(container), { target: { value: '2026-07-15' } });
    const note = screen.getByRole('note').textContent ?? '';
    // The cut is 14 July; the August and October installments are after it, the cancelled one is not counted.
    expect([note.includes('EJ-2026-0007'), note.includes('14/07/2026'), note.includes('(2)')]).toEqual([true, true, true]);
  });

  it('says nothing when the renewal starts after the current contract ends', () => {
    render(<RenewForm contract={contract} onCancel={() => {}} onSubmit={noop} />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
