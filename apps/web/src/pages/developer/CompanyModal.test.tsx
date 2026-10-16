import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Company } from '../../api/companies';
import type { PermissionTemplate } from '../../api/templates';
import { CompanyModal } from './CompanyModal';

const sendOwnerResetLink = vi.fn();
vi.mock('../../api/companies', () => ({ sendOwnerResetLink: (id: string) => sendOwnerResetLink(id) }));

vi.setConfig({ testTimeout: 15_000 });

const full: PermissionTemplate = {
  id: 'full',
  companyId: null,
  name: 'Full',
  isSystem: false,
  isAllScreens: true,
  allowedScreens: [],
  screenActions: null,
  isNewUserDefault: false,
  createdAt: '2026-10-16T00:00:00.000Z',
};

const company = (over: Partial<Company> = {}): Company =>
  ({ id: 'c1', orgName: 'Company one', email: 'owner@example.com', permissionTemplateId: 'full', subStart: '2026-01-01', subEnd: '2027-01-01', ...over }) as Company;

beforeEach(() => {
  sendOwnerResetLink.mockReset();
});

describe('The platform company form and the owner sign-in details', () => {
  it('shows no login name or password field when editing, and never sends them', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CompanyModal templates={[full]} editing={company()} onCancel={() => {}} onSave={onSave} />);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByPlaceholderText('username')).toBeNull();
    fireEvent.click(screen.getByText('حفظ الحساب'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const sent = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect('password' in sent || 'username' in sent || 'email' in sent).toBe(false);
  });

  it('sends a reset link to the owner from the company view and says where it went', async () => {
    sendOwnerResetLink.mockResolvedValue({ sentTo: 'owner@example.com' });
    render(<CompanyModal templates={[full]} editing={company()} onCancel={() => {}} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط استعادة كلمة المرور' }));
    await waitFor(() => expect(sendOwnerResetLink).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText(/أُرسل رابط الاستعادة إلى owner@example.com/)).toBeTruthy();
  });

  it('shows the server refusal when the link cannot be sent', async () => {
    sendOwnerResetLink.mockRejectedValue({ response: { data: { message: 'لا بريد إلكتروني لصاحب هذه المنشأة' } } });
    render(<CompanyModal templates={[full]} editing={company()} onCancel={() => {}} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'إرسال رابط استعادة كلمة المرور' }));
    expect(await screen.findByText('لا بريد إلكتروني لصاحب هذه المنشأة')).toBeTruthy();
  });

  it('cannot send a link for a company with no owner e-mail', () => {
    render(<CompanyModal templates={[full]} editing={company({ email: null })} onCancel={() => {}} onSave={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'إرسال رابط استعادة كلمة المرور' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for the owner e-mail when creating an account, and sends it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CompanyModal templates={[full]} editing={null} onCancel={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('مثال: شركة أفق العقارية'), { target: { value: 'New company' } });
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'new-owner' } });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: 'OwnerPass123!' } });
    fireEvent.click(screen.getByText('حفظ الحساب'));
    expect(await screen.findByText(/البريد الإلكتروني لصاحب الحساب/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('owner@example.com'), { target: { value: 'new-owner@example.com' } });
    fireEvent.click(screen.getByText('حفظ الحساب'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ username: 'new-owner', email: 'new-owner@example.com' });
  });
});

describe('The platform company form and the subscription', () => {
  it('sets no subscription dates when creating: the new company subscribes like any merchant', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CompanyModal templates={[full]} editing={null} onCancel={() => {}} onSave={onSave} />);
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByText('تبدأ المنشأة بلا اشتراك فعّال، للاطلاع فقط، وتشترك بالطريقة نفسها التي يشترك بها أي تاجر.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('مثال: شركة أفق العقارية'), { target: { value: 'New company' } });
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'new-owner' } });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: 'OwnerPass123!' } });
    fireEvent.change(screen.getByPlaceholderText('owner@example.com'), { target: { value: 'new-owner@example.com' } });
    fireEvent.click(screen.getByText('حفظ الحساب'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const sent = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect('subStart' in sent || 'subEnd' in sent).toBe(false);
  });

  it('keeps the subscription dates of an existing company for the finance route', () => {
    render(<CompanyModal templates={[full]} editing={company()} onCancel={() => {}} onSave={vi.fn()} />);
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(2);
  });
});
