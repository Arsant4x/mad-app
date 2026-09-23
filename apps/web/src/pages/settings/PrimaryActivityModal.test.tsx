import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrimaryActivityModal } from './PrimaryActivityModal';

vi.mock('../../api/activities', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  previewPrimaryActivity: vi.fn(),
  setPrimaryActivity: vi.fn(),
}));
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ refresh: vi.fn() }),
}));

import { previewPrimaryActivity, setPrimaryActivity } from '../../api/activities';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (6.9 ث).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 21_000 });

const activity = { id: 'a1', name: 'المطعم' } as never;

const mount = (preview: Record<string, unknown>, act: unknown = activity) => {
  vi.mocked(previewPrimaryActivity).mockResolvedValue(preview as never);
  return render(<PrimaryActivityModal activity={act as never} onDone={() => {}} onCancel={() => {}} />);
};

const preview = (over: Record<string, unknown> = {}) => ({
  willHide: [],
  willShow: [],
  currentCount: 24,
  nextCount: 24,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('تأكيد النشاط الرئيسي — يعرض ما سيختفي قبل أن يقع', () => {
  it('⭐ ما سيختفي يُعرض **بالاسم** لا بالعدد وحده', () => {
    // «ستُخفى 4 شاشات» لا يُمكّن المالك من الحكم: قد تكون الأربع بلا قيمة،
    // وقد تكون فيها واحدة يعمل عليها نصف موظفيه.
    mount(
      preview({
        willHide: [
          { screen: 'quotes', label: 'عروض الأسعار' },
          { screen: 'pos', label: 'الكاشير' },
        ],
        nextCount: 22,
      }),
    );
    return waitFor(() => {
      expect(screen.getByTestId('will-hide-count')).toHaveTextContent('ستُخفى 2');
      expect(screen.getByTestId('hide-quotes')).toHaveTextContent('عروض الأسعار');
      expect(screen.getByTestId('hide-pos')).toHaveTextContent('الكاشير');
    });
  });

  it('⭐ ولا يُطبَّق شيءٌ قبل التأكيد', async () => {
    // فتحُ النافذة **قراءةٌ خالصة**: المعاينة لا تكتب، والتطبيق لا يقع
    // إلا بنقرة. ونقطةٌ تعرض وتطبّق تُفقد التأكيد معناه.
    mount(preview({ willHide: [{ screen: 'quotes', label: 'عروض الأسعار' }] }));
    await waitFor(() => expect(screen.getByTestId('primary-confirm')).toBeInTheDocument());
    expect(previewPrimaryActivity).toHaveBeenCalledTimes(1);
    expect(setPrimaryActivity).not.toHaveBeenCalled();
  });

  it('⭐ والنقر يطبّق بمعرّف النشاط', async () => {
    vi.mocked(setPrimaryActivity).mockResolvedValue(preview() as never);
    mount(preview({ willHide: [{ screen: 'quotes', label: 'عروض الأسعار' }] }));
    await waitFor(() => expect(screen.getByTestId('primary-confirm')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('primary-confirm'));
    await waitFor(() => expect(setPrimaryActivity).toHaveBeenCalledWith('a1'));
  });

  it('⭐ والتراجع يُمرَّر `null` — لا معرّفاً فارغاً', async () => {
    // `null` هو ما يُطفئ الترشيح في الخادم؛ وسلسلةٌ فارغة تُقرأ معرّفاً
    // غير موجود فتردّ 404 بدل أن تُرجع الشاشات.
    vi.mocked(setPrimaryActivity).mockResolvedValue(preview() as never);
    mount(preview({ willShow: [{ screen: 'quotes', label: 'عروض الأسعار' }] }), null);
    await waitFor(() => expect(screen.getByTestId('primary-confirm')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('primary-confirm'));
    await waitFor(() => expect(setPrimaryActivity).toHaveBeenCalledWith(null));
  });

  it('⭐ ويُقال صراحةً إن البيانات تبقى — لا يُترك للتخمين', async () => {
    // «ستُخفى شاشات» بلا هذه الجملة تُقرأ «سيُحذف ما فيها».
    mount(preview({ willHide: [{ screen: 'pos', label: 'الكاشير' }] }));
    await waitFor(() => expect(screen.getByTestId('will-hide')).toBeInTheDocument());
    expect(screen.getByText(/البيانات تبقى كما هي/)).toBeInTheDocument();
  });

  it('لا تغيير ⇒ يُقال ذلك لا تُعرض قائمةٌ فارغة', async () => {
    mount(preview());
    await waitFor(() => expect(screen.getByTestId('primary-no-change')).toBeInTheDocument());
  });

  it('⭐ والقائمة من الخادم لا تُشتقّ هنا', async () => {
    // لو اشتقّتها الواجهة لعرضت أثراً غير الذي يقع. والحارس: قائمةٌ
    // مصطنعة لا تمتّ للخريطة الحقيقية بصلة تُعرض كما هي.
    mount(preview({ willHide: [{ screen: 'accounts', label: 'دليل الحسابات' }] }));
    await waitFor(() => expect(screen.getByTestId('hide-accounts')).toHaveTextContent('دليل الحسابات'));
  });
});
