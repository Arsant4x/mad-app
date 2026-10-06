import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormTemplateRow } from '../../api/forms';
import { CompanyTemplatesTab } from './CompanyTemplatesTab';

vi.mock('../../api/forms', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listCompanyFormTemplates: vi.fn(),
  formTemplateCatalog: vi.fn(),
  getCompanyFormTemplate: vi.fn(),
}));
const grants = new Set<string>();
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ can: (screen: string, action: string) => grants.has(`${screen}:${action}`) }),
}));

import { formTemplateCatalog, listCompanyFormTemplates } from '../../api/forms';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): تقديرٌ أوّلٌ قبل أن يُقاس تحت حِمل الحزمة، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيس.
vi.setConfig({ testTimeout: 15_000 });

/**
 * ⚖️ **قوالبُ المنشأة يعدّلها المالكُ ومن يمنحه شاشةَ «النماذج»** (`ق-١٦٤١`/٢): كلُّ زرٍّ بفعله كما يحكمه الخادم — النسخُ «إضافة»،
 * والتحريرُ «تعديل»، والنشرُ «مراجعة»، وحذفُ المسوّدة «حذف» — ومن لا يملك الشاشةَ يرى ولا يحرّر.
 */
const formType = { id: 'ft', code: 'UNIT_HANDOVER', name: 'تسليمُ وحدة', description: null, sector: null, createdAt: '', updatedAt: '' };
const row = (over: Partial<FormTemplateRow>): FormTemplateRow => ({
  status: 'DRAFT',
  id: 't1',
  companyId: 'c1',
  formTypeId: 'ft',
  formType,
  familyId: 't1',
  version: 1,
  name: 'تسليمُ شقّة',
  description: null,
  sourceTemplateId: null,
  publishedAt: null,
  createdAt: '',
  updatedAt: '',
  itemCount: 2,
  sourceLatestVersion: null,
  ...over,
});

async function menuLabels(): Promise<string[]> {
  await waitFor(() => expect(screen.getByTestId('company-template-row')).toBeTruthy());
  fireEvent.click(screen.getByTitle('خيارات'));
  return [...document.querySelectorAll('.action-menu button')].map((b) => (b.textContent ?? '').trim());
}

beforeEach(() => {
  vi.clearAllMocks();
  grants.clear();
  vi.mocked(listCompanyFormTemplates).mockResolvedValue([row({})]);
  vi.mocked(formTemplateCatalog).mockResolvedValue([row({ id: 'p1', companyId: null, status: 'PUBLISHED', name: 'تسليمُ وحدةٍ سكنية' })]);
});

describe('⚖️ قوالبُ المنشأة بأفعال شاشة «النماذج» (ق-١٦٤١/٢)', () => {
  it('⭐ من لا يملك الشاشةَ يرى ولا يحرّر: لا نسخَ من الكتالوج، والمسوّدةُ «عرض» وحدَه', async () => {
    grants.add('contracts:view');
    render(<CompanyTemplatesTab />);
    const labels = await menuLabels();
    expect(labels).toEqual(['عرض']);
    expect(screen.queryByTestId('catalog-row')).toBeNull();
  });

  it('⭐ ومن يُمنح الإضافةَ والتعديل وحدَهما ينسخ ويحرّر ولا ينشر ولا يحذف', async () => {
    for (const a of ['view', 'add', 'edit']) grants.add(`forms:${a}`);
    render(<CompanyTemplatesTab />);
    const labels = await menuLabels();
    expect(labels).toEqual(['✎ تحرير']);
    expect(screen.getByTestId('catalog-row')).toBeTruthy();
  });

  it('والمالكُ يملك الأفعالَ كلَّها: تحريرٌ ونشرٌ وحذفُ المسوّدة', async () => {
    for (const a of ['view', 'add', 'edit', 'delete', 'record', 'review', 'audit']) grants.add(`forms:${a}`);
    render(<CompanyTemplatesTab />);
    expect(await menuLabels()).toEqual(['✎ تحرير', 'نشر', 'حذفُ المسوّدة']);
  });
});
