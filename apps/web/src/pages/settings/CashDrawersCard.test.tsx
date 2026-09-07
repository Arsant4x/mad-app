import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CashDrawersCard } from './CashDrawersCard';
import * as api from '../../api/cashDrawers';
import { listBranches } from '../../api/branches';

vi.mock('../../api/cashDrawers');
vi.mock('../../api/branches', () => ({ listBranches: vi.fn() }));

const drawer = (over: Partial<api.CashDrawer> = {}): api.CashDrawer => ({
  id: 'd1',
  name: 'درج الواجهة',
  isActive: true,
  isDefault: false,
  branchId: null,
  branch: null,
  account: { id: 'a1', code: '1010', name: 'حساب درج الواجهة', balance: '0' },
  ...over,
});

/**
 * ⚠️ **رسالةُ المنع تُعرض كما جاءت من الخادم** (`ق-٢٦٥`): هي التي تحمل **الرصيد
 * والمخرج**، فاستبدالُها بعبارةٍ عامّة («تعذّر التعديل») **يُلغي شرط التوجيه** —
 * ويبقى المنعُ بلا مخرجٍ فيُلتفّ عليه.
 */
describe('بطاقةُ أدراج الكاشير', () => {
  // ⚠️ `restoreMocks: true` في إعداد vitest **يمسح التنفيذَ المكتوب في المصنع**
  //    قبل كل اختبار — فيُعاد هنا لا هناك، وإلا عادت الدالةُ `undefined` صامتةً.
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBranches).mockResolvedValue([]);
  });

  it('تعرض الدرجَ بحسابه ورمزه — والرمزُ يأتي من الخادم لا يُدخَل', async () => {
    vi.mocked(api.listCashDrawers).mockResolvedValue([drawer()]);
    render(<CashDrawersCard />);

    expect(await screen.findByText(/1010/)).toBeInTheDocument();
    expect(screen.getByTestId('cash-drawer-name')).toHaveValue('');
    // لا حقلَ لرمز الحساب في النموذج إطلاقاً.
    expect(screen.queryByTestId('cash-drawer-code')).toBeNull();
  });

  it('🔴 رسالةُ منع التعطيل تُعرض بنصّها — بالرصيد والمخرج (ق-٢٦٥)', async () => {
    const message = 'الدرج فيه 1240.00 SAR · انقلها إلى درج آخر أو إلى البنك ثم عطّله';
    vi.mocked(api.listCashDrawers).mockResolvedValue([drawer()]);
    vi.mocked(api.updateCashDrawer).mockRejectedValue({ response: { data: { message } } });

    render(<CashDrawersCard />);
    await userEvent.click(await screen.findByTestId('cash-drawer-toggle-d1'));

    await waitFor(() => expect(screen.getByTestId('cash-drawer-error')).toHaveTextContent('1240.00'));
    expect(screen.getByTestId('cash-drawer-error')).toHaveTextContent('انقلها إلى درج آخر أو إلى البنك');
  });

  it('الإضافة ترسل الاسم والفرع ثم تُعيد التحميل', async () => {
    vi.mocked(api.listCashDrawers).mockResolvedValue([]);
    vi.mocked(api.createCashDrawer).mockResolvedValue(drawer());

    render(<CashDrawersCard />);
    await userEvent.type(screen.getByTestId('cash-drawer-name'), 'درج المطبخ');
    await userEvent.click(screen.getByTestId('cash-drawer-add'));

    await waitFor(() => expect(api.createCashDrawer).toHaveBeenCalledWith({ name: 'درج المطبخ', branchId: undefined }));
    expect(api.listCashDrawers).toHaveBeenCalledTimes(2);
  });
});
