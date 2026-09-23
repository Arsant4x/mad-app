import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DelegationLogPage } from './DelegationLogPage';

vi.mock('../../api/delegations', () => ({ getDelegationLog: vi.fn() }));
vi.mock('../../api/companyUsers', () => ({ listCompanyUsers: vi.fn() }));

import { getDelegationLog } from '../../api/delegations';
import { listCompanyUsers } from '../../api/companyUsers';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (3.1 ث).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 10_000 });

const row = (over: Record<string, unknown> = {}) => ({
  id: `l${over.seq ?? 1}`,
  seq: 1,
  grantorId: 'owner',
  granteeId: 'mgr',
  nodeKey: 'root',
  grants: ['contracts:view'],
  state: 'ACTIVE',
  createdAt: '2026-08-13T00:00:00Z',
  revokedAt: null,
  ...over,
});

const node = (granteeId: string, entries: unknown[] = [], children: unknown[] = []) => ({ granteeId, entries, children });

function mount(log: Record<string, unknown>) {
  vi.mocked(getDelegationLog).mockResolvedValue(log as never);
  vi.mocked(listCompanyUsers).mockResolvedValue([
    { id: 'owner', name: 'المالك' },
    { id: 'mgr', name: 'المدير' },
    { id: 'emp', name: 'الموظف' },
  ] as never);
  return render(<DelegationLogPage />);
}

beforeEach(() => vi.clearAllMocks());

describe('سجل التفويض الشجري', () => {
  it('⭐ المسحوب ظاهرٌ مختوماً لا محذوفاً', async () => {
    // السجل ملحقٌ فقط. وإخفاء المسحوب في العرض يُنتج نفس أثر حذفه:
    // قصةٌ غير التي وقعت.
    mount({
      roots: [node('owner', [], [node('mgr')])],
      rows: [row({ seq: 1, state: 'REVOKED', revokedAt: '2026-08-13T02:00:00Z' })],
      sequenceBreak: null,
    });
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());
    expect(screen.getByTestId('log-row-1')).toHaveAttribute('data-state', 'REVOKED');
    expect(screen.getByTestId('log-row-1')).toHaveTextContent('مسحوب');
  });

  it('⭐ فجوة التسلسل تُعرض بصراحة — ولا تُبتلع', async () => {
    // فجوةٌ في `seq` تعني صفّاً غاب، وهي الإشارة الوحيدة على عبثٍ نجا من
    // مُشغِّلات القاعدة. وابتلاعُها يجعل السجل يبدو سليماً وهو ليس كذلك.
    mount({ roots: [node('owner')], rows: [row({ seq: 3 })], sequenceBreak: { at: 3, expected: 1 } });
    await waitFor(() => expect(screen.getByTestId('sequence-break')).toBeInTheDocument());
    expect(screen.getByTestId('sequence-break')).toHaveTextContent('فجوة في تسلسل السجل');
  });

  it('لا فجوة ⇒ لا تحذير كاذب', async () => {
    mount({ roots: [node('owner')], rows: [row()], sequenceBreak: null });
    await waitFor(() => expect(screen.getByTestId('deleg-log-rows')).toBeInTheDocument());
    expect(screen.queryByTestId('sequence-break')).toBeNull();
  });

  it('⭐ غابةٌ لا شجرة — جذرٌ لا يمرّ بالفاعل يظهر كذلك', async () => {
    // `buildLogTree` يمشي نزولاً من جذر. فعرضُ جذرٍ واحد يُخفي كل تفويضٍ
    // بين موظفَين لم يمرّ بالمالك — وهو أكثر ما يحتاج المالك رؤيته.
    mount({
      roots: [node('owner'), node('mgr', [], [node('emp')])],
      rows: [row({ seq: 1, grantorId: 'mgr', granteeId: 'emp' })],
      sequenceBreak: null,
    });
    await waitFor(() => expect(screen.getByTestId('log-node-owner')).toBeInTheDocument());
    expect(screen.getByTestId('log-node-mgr')).toBeInTheDocument();
    expect(screen.getByTestId('log-node-emp')).toBeInTheDocument();
  });

  it('المعرّفات تُترجَم إلى أسماء — والمجهول يُعرض كما هو لا يُحذف', async () => {
    mount({ roots: [node('owner')], rows: [row({ granteeId: 'ghost' })], sequenceBreak: null });
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());
    expect(screen.getByTestId('log-row-1')).toHaveTextContent('المالك');
    expect(screen.getByTestId('log-row-1')).toHaveTextContent('ghost');
  });

  it('سجلٌّ فارغ يقول ذلك — لا جدولٌ فارغ بلا تفسير', async () => {
    mount({ roots: [node('owner')], rows: [], sequenceBreak: null });
    await waitFor(() => expect(screen.getByTestId('log-empty')).toBeInTheDocument());
  });
});
