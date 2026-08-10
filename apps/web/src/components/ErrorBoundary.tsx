import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * حاجز الأخطاء — يمنع «الصفحة البيضاء الصامتة».
 *
 * بدونه، أي خطأ تشغيلي في أي مكوّن يجعل React يفكّ الشجرة كاملةً، فيرى
 * المستخدم بياضاً بلا كلمة واحدة تشرح ما جرى. والأسوأ أن ذلك البياض **يطابق
 * تماماً** بياضَ فشلِ تحميل الحزمة، فيتعذّر على من يبلّغ عن العطل — ومن
 * يشخّصه — التمييز بين سببين علاجهما مختلف كلياً.
 *
 * فالغرض هنا **ليس إخفاء العطل بل تسميته**: رسالةٌ تُقرأ، وزرٌ يخرج منها.
 * وتفاصيل الخطأ تبقى في طرفية المتصفح للمطوّر، لا في وجه التاجر.
 *
 * ملاحظة على الحدود: React يمسك أخطاء **العرض** وحدها. الأخطاء داخل معالج
 * حدث أو داخل وعد غير مُلتقَط لا تصل إلى هنا — تلك تُعالج عند مصدرها.
 */
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // الطرفية عمداً: لا خدمة تجميع أخطاء بعد، وابتلاعُه صامتاً يعيدنا إلى
    // النقطة نفسها — عطلٌ بلا أثر يُتتبَّع.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        dir="rtl"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden="true">
            ⚠️
          </div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>حدث خطأ غير متوقع</h1>
          <p style={{ margin: '0 0 20px', lineHeight: 1.7, color: 'var(--muted, #6b7280)' }}>
            تعذّر عرض هذه الصفحة. بياناتك لم تتأثر — أعد التحميل للمتابعة.
          </p>
          {/* إعادة تحميل كاملة لا setState: الحالة التي أدّت إلى الانهيار قد
              تكون هي نفسها التالفة، فإعادة العرض عليها تُسقط الصفحة ثانيةً. */}
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            إعادة تحميل
          </button>
        </div>
      </div>
    );
  }
}
