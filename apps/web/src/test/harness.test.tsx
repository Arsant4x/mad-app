import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * فحص العتاد نفسه — أن vitest يعمل، وأن jsdom يركّب React، وأن توكيدات
 * jest-dom مُحمَّلة، وأن العربية والاتجاه يمرّان سليمين.
 *
 * يبقى دائماً: عتادٌ معطوب يجعل بقية الاختبارات تمرّ لأنها **لا تعمل**، وهو
 * أسوأ من سقوطها.
 */
describe('عتاد اختبارات الواجهة', () => {
  it('يركّب مكوّناً ويقرأ نصه العربي', () => {
    render(<p dir="rtl">مرحباً بالعالم</p>);
    expect(screen.getByText('مرحباً بالعالم')).toBeInTheDocument();
  });

  it('توكيدات jest-dom محمَّلة', () => {
    render(
      <button type="button" disabled>
        إرسال
      </button>,
    );
    expect(screen.getByRole('button', { name: 'إرسال' })).toBeDisabled();
  });
});
