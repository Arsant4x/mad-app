import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrashPage } from './TrashPage';

vi.mock('../../api/trash', () => ({ listTrash: vi.fn(), purgeFromTrash: vi.fn(), restoreFromTrash: vi.fn() }));

import { listTrash } from '../../api/trash';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (4.9 ث).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => vi.clearAllMocks());

/**
 * السلّةُ والحفظُ النظاميّ (`ق-١٢٧١`/أ): ما يشير إليه سجلٌّ يُحفظ **يُقال للتاجر** أنه محفوظٌ
 * نظاماً حتى أجله وبأسماء ما يحفظه — لا عدٌّ تنازليٌّ على ما لن يُمحى؛ والحذفُ النهائيّ يُعطَّل
 * (والخادمُ يرفضه `409` على أي حال — الزرُّ تفسيرٌ لا حراسة).
 */
describe('سلّة المحذوفات — المحفوظُ نظاماً يُعلَن ولا يُعدّ له', () => {
  it('المحفوظُ يحمل الأجلَ وما يحفظه وزرَّ الحذف معطَّلاً، وغيرُ المحفوظ يحمل العدَّ والزرَّ مفعَّلاً', async () => {
    vi.mocked(listTrash).mockResolvedValue({
      retentionDays: 30,
      groups: [
        {
          entity: 'properties',
          label: 'العقارات',
          items: [
            { id: 'p1', name: 'عقار بلا وحدات', deletedAt: '2026-08-13T00:00:00Z', daysLeft: 3987, retainedUntil: '2037-08-13', retainedBy: ['بلاغات صيانة', 'ضمانات'] },
            { id: 'p2', name: 'عقار نظيف', deletedAt: '2026-09-20T00:00:00Z', daysLeft: 28, retainedUntil: null, retainedBy: [] },
          ],
        },
      ],
    });
    render(<TrashPage />);

    await waitFor(() => expect(screen.getByText('عقار بلا وحدات')).toBeInTheDocument());
    const badge = screen.getByTestId('retained');
    expect(badge.textContent).toContain('محفوظ نظاماً حتى 2037-08-13');
    expect(badge.textContent).toContain('بلاغات صيانة · ضمانات');
    // لا «٣٩٨٧ يوم» على المحفوظ — العدُّ التنازليّ لغير المحفوظ وحدَه
    expect(screen.queryByText('3987 يوم')).toBeNull();
    expect(screen.getByText('28 يوم')).toBeInTheDocument();

    const purgeButtons = screen.getAllByRole('button', { name: 'حذف نهائي' });
    expect(purgeButtons).toHaveLength(2);
    expect(purgeButtons[0]).toBeDisabled();
    expect(purgeButtons[0]).toHaveAttribute('title', 'محفوظ نظاماً حتى 2037-08-13');
    expect(purgeButtons[1]).toBeEnabled();
    // والاسترجاعُ لا يتأثّر بالحفظ
    expect(screen.getAllByRole('button', { name: 'استرجاع' }).every((b) => !b.hasAttribute('disabled'))).toBe(true);
  });
});
