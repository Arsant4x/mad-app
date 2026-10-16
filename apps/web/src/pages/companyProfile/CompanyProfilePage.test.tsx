import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyProfilePage } from './CompanyProfilePage';

const updateCompanyProfile = vi.fn();
vi.mock('../../api/companyProfile', () => ({
  getCompanyProfile: () =>
    Promise.resolve({ id: 'c1', orgName: 'Company one', legalName: 'Company one LLC', email: 'owner@example.com', slug: null, masterDataLocked: false, writeOffRequiresTwoPersons: true, vatPeriod: 'QUARTERLY', posOfflineGapMinutes: 5 }),
  updateCompanyProfile: (dto: unknown) => updateCompanyProfile(dto),
}));
vi.mock('../../api/files', () => ({ ACCEPTED_FILE_TYPES: '', MAX_FILE_BYTES: 1, getFileDownloadUrl: vi.fn(), uploadFile: vi.fn() }));
vi.mock('./ZatcaOnboardingCard', () => ({ ZatcaOnboardingCard: () => null }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { actorType: 'COMPANY' } }) }));

vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  updateCompanyProfile.mockReset();
  updateCompanyProfile.mockImplementation((dto: { email?: string }) => Promise.resolve({ slug: null, email: dto.email ?? 'owner@example.com' }));
});

const emailInput = () => screen.getByPlaceholderText('info@example.com') as HTMLInputElement;

describe('The company e-mail on the profile screen', () => {
  it('saves the rest of the profile without asking for the password while the e-mail stays the same', async () => {
    render(<CompanyProfilePage />);
    await waitFor(() => expect(emailInput().value).toBe('owner@example.com'));
    expect(document.querySelector('input[type="password"]')).toBeNull();
    fireEvent.click(screen.getByText('حفظ البيانات'));
    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    expect('currentPassword' in updateCompanyProfile.mock.calls[0][0]).toBe(false);
  });

  it('asks for the current password once the e-mail changes, and sends it with the new address', async () => {
    render(<CompanyProfilePage />);
    await waitFor(() => expect(emailInput().value).toBe('owner@example.com'));
    fireEvent.change(emailInput(), { target: { value: 'new-owner@example.com' } });
    const password = (await screen.findByLabelText('كلمة المرور الحالية')) as HTMLInputElement;
    fireEvent.change(password, { target: { value: 'OwnerPass123!' } });
    fireEvent.click(screen.getByText('حفظ البيانات'));
    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    expect(updateCompanyProfile.mock.calls[0][0]).toMatchObject({ email: 'new-owner@example.com', currentPassword: 'OwnerPass123!' });
    // Saved: the address is now the stored one, so the field goes away.
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toBeNull());
  });
});
