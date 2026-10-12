import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
// Components render through translation keys; tests see the default Arabic interface.
import '../i18n';

/**
 * تهيئة مشتركة لكل اختبارات المكوّنات.
 *
 * `cleanup` بعد كل اختبار: testing-library تُركّب في document حقيقي، وبلا
 * تفكيك يتسرّب DOM اختبارٍ إلى تاليه — فيمرّ اختبارٌ لأن سابقه ترك ما يبحث
 * عنه، أو يسقط لعثوره على عنصرين. وكلاهما فشلٌ في قياس ما نظنّه نقيسه.
 */
afterEach(() => {
  cleanup();
});

/**
 * jsdom لا يطبّق `matchMedia`، وبعض المكوّنات تستدعيه. بديلٌ صامت يعيد «لا
 * تطابق» — ولا يُغني عن Playwright: القرار الحقيقي للاستعلامات يقع في المتصفح.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
