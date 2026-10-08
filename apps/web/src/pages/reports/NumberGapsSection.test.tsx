import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NumberGapsSection } from './NumberGapsSection';
import * as reports from '../../api/reports';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ملفٌّ صغيرٌ لم يُقس بعد، فالسقفُ معلنٌ هنا كجيرانه.
vi.setConfig({ testTimeout: 31_000 });

vi.mock('../../api/reports');

describe('الأرقامُ المأخوذة غير المستعملة (ق-٣٤٥)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('يسمّي الرقمَ المأخوذ غيرَ المستعمَل في سلسلته، ويعدّه', async () => {
    vi.mocked(reports.getNumberGaps).mockResolvedValue({
      asOf: '2026-10-08T10:00:00.000Z',
      series: [
        {
          kind: 'INV',
          year: 2026,
          taken: 3,
          firstRecorded: 41,
          lastRecorded: 43,
          recordedSince: '2026-10-08T09:00:00.000Z',
          unused: [{ no: 'INV-2026-0042', number: 42, allocatedAt: '2026-10-08T09:10:00.000Z' }],
          pending: [],
        },
      ],
    });
    render(<NumberGapsSection />);
    expect(await screen.findByText('INV-2026-0042')).toBeTruthy();
    expect(screen.getByText('1 رقماً مأخوذاً غيرَ مستعمَل.')).toBeTruthy();
  });

  it('ورفضُ الخادم للمقيَّد بفرعٍ يُعرض برسالته لا صفحةً فارغة', async () => {
    vi.mocked(reports.getNumberGaps).mockRejectedValue({ isAxiosError: true, response: { data: { message: 'هذا التقرير للمنشأة كلِّها' } } });
    render(<NumberGapsSection />);
    expect(await screen.findByText('هذا التقرير للمنشأة كلِّها')).toBeTruthy();
  });
});
