import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * الاختبار ١ — حاجز الأخطاء (أ٢).
 *
 * يحرس العطل الأول الذي وصل الإنتاج: أي خطأ عرضٍ كان يفكّ شجرة React كاملةً
 * فيرى المستخدم **بياضاً بلا كلمة**. والأسوأ أن ذلك البياض يطابق تماماً بياضَ
 * فشلِ تحميل الحزمة، فيتعذّر على المبلِّغ وعلى المشخِّص التمييز بين سببين
 * علاجهما مختلف كلياً.
 */
function Boom(): never {
  throw new Error('انفجار مقصود');
}

describe('الاختبار ١ — حاجز الأخطاء', () => {
  beforeEach(() => {
    // React يطبع الخطأ الملتقَط دائماً؛ كتمُه يُبقي مخرجات الاختبار مقروءة
    // بلا أن يُخفي فشلاً — فالتوكيدات أدناه هي الحَكَم لا السجل.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('يعرض رسالة عربية وزر إعادة تحميل بدل الصفحة البيضاء', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('حدث خطأ غير متوقع')).toBeInTheDocument();
    expect(screen.getByText(/بياناتك لم تتأثر/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة تحميل' })).toBeInTheDocument();
  });

  it('لا يتدخّل حين لا يوجد خطأ', () => {
    render(
      <ErrorBoundary>
        <p>محتوى سليم</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('محتوى سليم')).toBeInTheDocument();
    expect(screen.queryByText('حدث خطأ غير متوقع')).not.toBeInTheDocument();
  });

  it('يسجّل الخطأ في الطرفية ليبقى للمطوّر أثرٌ يُتتبَّع', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(spy.mock.calls.some((c) => String(c[0]).includes('[ErrorBoundary]'))).toBe(true);
  });
});
