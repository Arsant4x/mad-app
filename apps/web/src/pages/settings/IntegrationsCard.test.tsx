import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { hasAnyProvider, PROVIDERS_BY_KIND } from '../../api/integrations';
import { IntegrationsCard } from './IntegrationsCard';

vi.mock('../../api/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/integrations')>()),
  listIntegrations: vi.fn().mockResolvedValue([]),
}));

/**
 * حارس ثغرةٍ مالية.
 *
 * كان `MOCK` **الخيار الوحيد** في قائمة المزوّدين، ومحوّله يعتمد كل عملية
 * بطاقة بلا تحصيل — فتاجرٌ يربطه تُختم فواتيره مسدَّدة بلا مال. الحاجز
 * الحقيقي في الخادم (`mock-provider-guard.spec.ts`)؛ وهذا يحرس الوجه الآخر:
 * ألّا تعرض الواجهة باباً لا يؤدي إلا إلى مزوّدٍ وهمي.
 */
describe('قسم الربط لا يُعرض بلا مزوّد حقيقي', () => {
  it('لا مزوّد حقيقي اليوم — فالقائمة فارغة لكل نوع', () => {
    expect(Object.values(PROVIDERS_BY_KIND).every((l) => l.length === 0)).toBe(true);
    expect(hasAnyProvider()).toBe(false);
  });

  it('القسم لا يُركَّب إطلاقاً — ولا حتى عنوانه', () => {
    const { container } = render(<IntegrationsCard />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('الربط والتكاملات')).toBeNull();
    expect(screen.queryByText(/تجريبي/)).toBeNull();
  });

  /**
   * ⚠️ العطل الأخبث لم يكن الخيار المعروض بل **الافتراضي المخفيّ**:
   * `useState('MOCK')` و`?? 'MOCK'` كانا يُبقيان القيمة في الحالة حتى بعد
   * إفراغ القائمة — فتُرسَل إلى الخادم ويُقبل اتصالٌ وهمي **بلا أن يختاره
   * أحد**. حذفُ الخيار وحده كان سيترك الثغرة ويُخفيها.
   */
  it('لا افتراضي وهمي في الحالة — لا نصّاً ولا احتياطياً', () => {
    const src = readFileSync(join(__dirname, 'IntegrationsCard.tsx'), 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*') && /['"`]MOCK['"`]/.test(line));
    expect(offenders.map((o) => `سطر ${o.n}: ${o.line}`)).toEqual([]);
  });
});
