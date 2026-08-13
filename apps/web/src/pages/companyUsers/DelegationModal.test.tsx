import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DelegationModal } from './DelegationModal';

vi.mock('../../api/delegations', () => ({
  getDelegationView: vi.fn(),
  createDelegation: vi.fn(),
  revokeDelegation: vi.fn(),
}));
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ refresh: vi.fn() }),
}));

import { getDelegationView } from '../../api/delegations';

const view = (over: Partial<Parameters<typeof mount>[0]> = {}) => ({
  granteeId: 'emp',
  grantable: ['contracts:view', 'contracts:edit', 'contracts:add'],
  links: [],
  active: [],
  extinguished: [],
  ...over,
});

function mount(data: ReturnType<typeof view>) {
  vi.mocked(getDelegationView).mockResolvedValue(data as never);
  return render(<DelegationModal granteeId="emp" granteeName="خالد" onClose={() => {}} />);
}

beforeEach(() => vi.clearAllMocks());

describe('شجرة التفويض — الحالات الثلاث', () => {
  it('⭐ الثلاث تُعرض متمايزة: متاحة · نافذة · منطفئة', async () => {
    mount(
      view({
        active: ['contracts:view'],
        extinguished: [{ grant: 'contracts:edit', reason: 'REVOKED', atIndex: 0, grantorId: 'owner', granteeId: 'mgr' }],
      }),
    );
    await waitFor(() => expect(screen.getByTestId('deleg-tree')).toBeInTheDocument());

    expect(screen.getByTestId('grant-contracts:view')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('grant-contracts:edit')).toHaveAttribute('data-state', 'extinguished');
    expect(screen.getByTestId('grant-contracts:add')).toHaveAttribute('data-state', 'available');
  });

  it('⭐ المنطفئة تحمل سببها — لا تُعرض «غير ممنوحة»', async () => {
    // بلا السبب يظنّ المفوِّض أنه لم يمنح، فيمنح مرةً أخرى بلا أثر —
    // لأن العطب فوقه لا عنده، ولا رسالة خطأ في أيٍّ من المرّات.
    mount({
      ...view(),
      extinguished: [{ grant: 'contracts:edit', reason: 'REVOKED', atIndex: 0, grantorId: 'owner', granteeId: 'mgr' }],
    });
    await waitFor(() => expect(screen.getByTestId('reason-contracts:edit')).toBeInTheDocument());
    expect(screen.getByTestId('reason-contracts:edit')).toHaveTextContent('سُحبت من فوقك');
  });

  it('كل سببٍ نصّه — والثلاثة تقود إلى إصلاحٍ مختلف', async () => {
    for (const [reason, text] of [
      ['NOT_IN_ROOT', 'لم تعد في قالب الصلاحيات'],
      ['NARROWED', 'لا يملكها من فوقك'],
    ] as const) {
      const { unmount } = mount({
        ...view(),
        extinguished: [{ grant: 'contracts:edit', reason, atIndex: 0, grantorId: 'o', granteeId: 'm' }],
      });
      await waitFor(() => expect(screen.getByTestId('reason-contracts:edit')).toHaveTextContent(text));
      unmount();
    }
  });

  it('⭐ ما لا يملكه المفوِّض لا يُعرض إطلاقاً — لا رمادياً ولا معطَّلاً', async () => {
    // عرضُه يدعو لمحاولةٍ يرفضها الخادم، ورفضٌ بلا سببٍ مفهوم أسوأ من الغياب.
    mount(view({ grantable: ['contracts:view'] }));
    await waitFor(() => expect(screen.getByTestId('deleg-tree')).toBeInTheDocument());
    expect(screen.getByTestId('grant-contracts:view')).toBeInTheDocument();
    expect(screen.queryByTestId('grant-contracts:delete')).toBeNull();
    expect(screen.queryByTestId('grant-pos:view')).toBeNull();
  });

  it('⭐ الشجرة تُبنى من `grantable` لا من قائمة الشاشات كاملةً', async () => {
    // الفرق يظهر عند مفوِّضٍ محدود: شجرةٌ من `ALLOWED_SCREENS` تعرض 24 شاشة.
    mount(view({ grantable: ['contracts:view'] }));
    await waitFor(() => expect(screen.getByTestId('deleg-tree')).toBeInTheDocument());
    expect(screen.getByTestId('deleg-tree').querySelectorAll('fieldset')).toHaveLength(1);
  });

  it('مفوِّضٌ بلا صلاحيات يرى سبباً لا شجرةً فارغة', async () => {
    mount(view({ grantable: [] }));
    await waitFor(() => expect(screen.getByTestId('deleg-nothing-to-grant')).toBeInTheDocument());
  });

  it('⭐ المسحوب يبقى ظاهراً مختوماً — لا يُحذف من العرض', async () => {
    // السجل ملحقٌ فقط، وإخفاء المسحوب في العرض يُنتج أثر حذفه.
    mount(
      view({
        links: [
          { id: 'l1', seq: 1, grantorId: 'o', granteeId: 'emp', nodeKey: 'root', grants: ['contracts:view'], state: 'REVOKED', createdAt: '2026-08-13T00:00:00Z', revokedAt: '2026-08-13T01:00:00Z' },
        ],
      }),
    );
    await waitFor(() => expect(screen.getByTestId('link-l1')).toBeInTheDocument());
    expect(screen.getByTestId('link-l1')).toHaveAttribute('data-state', 'REVOKED');
    expect(screen.getByTestId('link-l1')).toHaveTextContent('مسحوب');
  });

  it('زرّ التفويض معطَّل بلا اختيار', async () => {
    mount(view());
    await waitFor(() => expect(screen.getByTestId('deleg-submit')).toBeDisabled());
  });
});
