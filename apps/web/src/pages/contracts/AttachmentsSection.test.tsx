import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * تحذير صور الهويات — **يُعرَض فعلاً، لا يكفي أنه مكتوب**.
 *
 * السند: لائحة مرفق الضيافة السياحي (القرار الوزاري 2289) المادة الثامنة
 * والعشرين/14 — التحقق من الهوية بالاطلاع على أصلها «وتسجيل بياناتها فقط،
 * **دون طلب او أخذ نسخه منها**».
 *
 * ولماذا اختبار عرضٍ وقد وُجد حارس نصّي (`no-id-scan.spec.ts`)؟ لأن الحارس
 * النصّي يقول «الشيفرة مكتوبة كذلك» ولا يقول «تعمل كذلك» — والفرق بينهما
 * ميزة كاملة. سطرٌ داخل فرعٍ لا يُنفَّذ، أو مكوّنٌ لا يُركَّب، يمرّ من الحارس
 * النصّي ولا يصل المستخدم أبداً.
 *
 * ولذلك يؤكّد هذا الاختبار على **ما يقرؤه المستخدم على الشاشة**:
 *  ١. أن التحذير يظهر حتى قبل تحميل المرفقات — فالمستخدم قد يرفع فوراً.
 *  ٢. أن يظهر أيضاً حين لا مرفقات — وهي أول حالة يراها كل عقد جديد.
 */
vi.mock('../../api/contracts', () => ({
  listContractAttachments: vi.fn(),
  deleteContractAttachment: vi.fn(),
  contractAttachmentDownloadUrl: vi.fn(),
  uploadContractAttachment: vi.fn(),
}));

const { listContractAttachments } = await import('../../api/contracts');
const { AttachmentsSection } = await import('./AttachmentsSection');

const WARNING = 'لا ترفع صور الهويات — سجّل الرقم في حقله';

describe('AttachmentsSection — تحذير صور الهويات (لائحة 2289 م.٢٨/١٤)', () => {
  it('يظهر التحذير أثناء التحميل — قبل أن تصل المرفقات', () => {
    // وعدٌ لا يُحلّ: المكوّن يبقى في حالة التحميل.
    vi.mocked(listContractAttachments).mockReturnValue(new Promise(() => {}));

    render(<AttachmentsSection contractId="c1" />);

    expect(screen.getByText('جارٍ التحميل…')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(WARNING))).toBeInTheDocument();
  });

  it('يظهر التحذير حين لا مرفقات — وهي أول حالة يراها كل عقد', async () => {
    vi.mocked(listContractAttachments).mockResolvedValue([]);

    render(<AttachmentsSection contractId="c1" />);

    await waitFor(() => expect(screen.getByText('لا مرفقات بعد.')).toBeInTheDocument());
    expect(screen.getByText(new RegExp(WARNING))).toBeInTheDocument();
  });
});
