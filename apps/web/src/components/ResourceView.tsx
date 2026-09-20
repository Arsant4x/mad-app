import type { ReactNode } from 'react';
import type { ApiFailure, Resource } from '../hooks/useResource';

/**
 * يرسم `Resource<T>` بفروعٍ **كلُّها إلزامية** — حذفُ فرعٍ خطأُ ترجمة.
 *
 * هذا ما يجعل الحالاتِ الستَّ لا تُدمَج: لا يستطيع مؤلّفُ شاشةٍ أن «ينسى» الخطأ
 * أو الممنوعَ أو الناقص، لأن المكوّن لا يُترجَم بدونها. والفرعُ الافتراضي الوحيد
 * الذي يملكه المكوّنُ نفسُه هو **لا شيء**.
 */
export interface ResourceViewProps<T> {
  r: Resource<T>;
  loading: () => ReactNode;
  error: (error: ApiFailure, retry: () => void) => ReactNode;
  forbidden: (error: ApiFailure, grantedBy: string | null) => ReactNode;
  empty: (filtered: boolean, reload: () => void) => ReactNode;
  partial: (data: T, failed: ApiFailure[], retry: () => void) => ReactNode;
  ready: (data: T, reload: () => void) => ReactNode;
}

export function ResourceView<T>({ r, loading, error, forbidden, empty, partial, ready }: ResourceViewProps<T>) {
  switch (r.status) {
    case 'loading':
      return <>{loading()}</>;
    case 'error':
      return <>{error(r.error, r.retry)}</>;
    case 'forbidden':
      return <>{forbidden(r.error, r.grantedBy)}</>;
    case 'empty':
      return <>{empty(r.filtered, r.reload)}</>;
    case 'partial':
      return <>{partial(r.data, r.failed, r.retry)}</>;
    case 'ready':
      return <>{ready(r.data, r.reload)}</>;
  }
}

/** كتلةُ خطأٍ موحّدة: السببُ بلغة الخادم · معرّفُ الطلب إن وُجد · «أعد المحاولة». لا تشبه الفارغ. */
export function ErrorBlock({ error, retry, what }: { error: ApiFailure; retry: () => void; what: string }) {
  return (
    <div className="rz-state rz-state--error" role="alert" data-state="error">
      <strong>تعذّر جلب {what}</strong>
      <span>{error.message}</span>
      {error.requestId ? <span className="rz-state__meta num">رقم الطلب: {error.requestId}</span> : null}
      <button type="button" className="btn btn-sm" onClick={retry}>
        أعد المحاولة
      </button>
    </div>
  );
}

/** كتلةُ المنع: تسمّي **من يمنح** — والجدولُ لا يُرسم. */
export function ForbiddenBlock({ error, grantedBy, what }: { error: ApiFailure; grantedBy: string | null; what: string }) {
  return (
    <div className="rz-state rz-state--forbidden" role="alert" data-state="forbidden">
      <strong>لا تملك صلاحية عرض {what}</strong>
      <span>{error.message}</span>
      <span className="rz-state__meta">{grantedBy ? `ومن يمنحها: ${grantedBy}` : 'ومن يمنحها: مالك المنشأة'}</span>
    </div>
  );
}

/** الفارغُ نوعان بفعلين: أوّلَ مرّة (ما سيظهر + الفعلُ الأوّل) · وبعد بحث (المصطلحُ والعددُ الكلّي + «امسح»). */
export function EmptyBlock({
  filtered,
  firstTime,
  afterSearch,
}: {
  filtered: boolean;
  firstTime: { headline: string; hint: string; action?: ReactNode };
  afterSearch: { term: string; total?: number; clear: () => void };
}) {
  if (filtered) {
    return (
      <div className="rz-state rz-state--empty" data-state="empty-filtered">
        <strong>لا نتيجة لـ«{afterSearch.term}»</strong>
        {afterSearch.total !== undefined ? <span>من {afterSearch.total} إجمالاً</span> : null}
        <button type="button" className="btn btn-sm" onClick={afterSearch.clear}>
          امسح البحث
        </button>
      </div>
    );
  }
  return (
    <div className="rz-state rz-state--empty" data-state="empty-first">
      <strong>{firstTime.headline}</strong>
      <span>{firstTime.hint}</span>
      {firstTime.action}
    </div>
  );
}

/** هيكلُ تحميلٍ بأبعاد المحتوى الحقيقي — لا رقمَ ولا صفر. */
export function SkeletonRows({ rows, height = 32 }: { rows: number; height?: number }) {
  return (
    <div className="rz-skeleton" aria-busy="true" data-state="loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rz-skeleton__row" style={{ height }} />
      ))}
    </div>
  );
}
