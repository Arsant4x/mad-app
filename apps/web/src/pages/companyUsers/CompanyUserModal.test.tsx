import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Company } from '../../api/companies';
import type { CompanyUser } from '../../api/companyUsers';
import type { PermissionTemplate } from '../../api/templates';
import { CompanyModal } from '../developer/CompanyModal';
import { CompanyUserModal } from './CompanyUserModal';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): تقديرٌ أوّلٌ قبل أن يُقاس تحت حِمل الحزمة، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيس.
vi.setConfig({ testTimeout: 15_000 });

/**
 * ⚖️ **الموظّفُ الجديد يبدأ «بلا شاشات»، وصاحبُ المنشأة شاملٌ** (توجيه ٢٧٦ · `ق-١٦٠١` بحكم صاحب المشروع: «واختبارٌ يحرس الافتراض»).
 *
 * كان النموذجُ المختارُ مسبقاً أوّلَ القائمة — وأوّلُها «المستخدم الأول (شامل)» — فيُنشأ كلُّ موظّفٍ جديد شاملاً ما لم يغيّره صاحبُه.
 */
const tpl = (over: Partial<PermissionTemplate>): PermissionTemplate => ({
  id: 'x',
  companyId: null,
  name: 'قالب',
  isSystem: false,
  isAllScreens: false,
  allowedScreens: [],
  screenActions: null,
  isNewUserDefault: false,
  createdAt: '2026-10-03T00:00:00.000Z',
  ...over,
});

const full = tpl({ id: 'full', name: 'المستخدم الأول (شامل)', isAllScreens: true });
const none = tpl({ id: 'none', name: 'موظّفٌ جديد (بلا شاشات)', isNewUserDefault: true });
const system = tpl({ id: 'sys', name: 'المطوّر', isSystem: true, isAllScreens: true });
const narrow = tpl({ id: 'narrow', name: 'فواتير فقط', allowedScreens: ['invoices'] });
const own = tpl({ id: 'own', name: 'كاشير المنشأة', companyId: 'co', allowedScreens: ['pos'] });

describe('⚖️ نموذجُ الموظّف الجديد (ق-١٦٠١)', () => {
  it('⭐ يبدأ «بلا شاشات» لا بأوّل القائمة الشامل، ويُرسل ما اختير مسبقاً', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CompanyUserModal templates={[full, none, own]} branches={[]} editing={null} onCancel={() => {}} onSave={onSave} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('none');
    expect(screen.getByText(/لا يرى أي شاشة/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('مثال: خالد المطيري'), { target: { value: 'خالد' } });
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'khaled' } });
    fireEvent.change(screen.getByPlaceholderText('كلمة المرور'), { target: { value: 'Pass12345!' } });
    fireEvent.click(screen.getByText('حفظ الحساب'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].permissionTemplateId).toBe('none');
  });

  it('ويجوز إعطاؤه الشاملَ باختيارٍ صريح', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CompanyUserModal templates={[full, none]} branches={[]} editing={null} onCancel={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'full' } });
    fireEvent.change(screen.getByPlaceholderText('مثال: خالد المطيري'), { target: { value: 'خالد' } });
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'khaled' } });
    fireEvent.change(screen.getByPlaceholderText('كلمة المرور'), { target: { value: 'Pass12345!' } });
    fireEvent.click(screen.getByText('حفظ الحساب'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].permissionTemplateId).toBe('full');
  });

  it('والموظّفُ القائم يبقى على نموذجه (القائمون لا يُمسّون)', () => {
    const editing = { id: 'u1', name: 'سعد', permissionTemplateId: 'full', canEditMasterData: false, branches: [], allBranches: true } as unknown as CompanyUser;
    render(<CompanyUserModal templates={[none, full]} branches={[]} editing={editing} onCancel={() => {}} onSave={vi.fn()} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('full');
  });
});

describe('⚖️ صاحبُ المنشأة شاملٌ في لوحة المدير (ق-١٦٠١)', () => {
  const optionIds = () => Array.from((screen.getByRole('combobox') as HTMLSelectElement).options).map((o) => o.value);

  it('⭐ لا تُعرض إلا العامّةُ الشاملة غيرُ النظامية', () => {
    render(<CompanyModal templates={[none, system, narrow, full]} editing={null} onCancel={() => {}} onSave={vi.fn()} />);
    expect(optionIds()).toEqual(['full']);
  });

  it('ومنشأةٌ قائمةٌ على أضيق يظهر قالبُها ولا يُرسل ما لم يتغيّر', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editing = { id: 'c1', orgName: 'منشأة قديمة', permissionTemplateId: 'narrow', subStart: '2026-01-01', subEnd: '2027-01-01' } as unknown as Company;
    render(<CompanyModal templates={[none, narrow, full]} editing={editing} onCancel={() => {}} onSave={onSave} />);
    expect(optionIds()).toEqual(['narrow', 'full']);
    fireEvent.click(screen.getByText('حفظ الحساب'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect('permissionTemplateId' in onSave.mock.calls[0][0]).toBe(false);
  });
});
