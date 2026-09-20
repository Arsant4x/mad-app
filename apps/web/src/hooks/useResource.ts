import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorCode, apiErrorMessage } from '../lib/apiError';

/**
 * `useResource` — **الحدُّ الوحيد الذي يلمس الشبكة من جهة الشاشات** (القاعدة ②).
 *
 * ## العطلُ الذي يمنعه
 *
 * ثماني عشرة صفحةً كانت تحمّل بـ`Promise.all(...).then(...).finally(...)` بلا `catch`
 * (المراجعة ج٤ §١.٣ — والقياسُ الأدقّ ٢٤٠ موضعاً في ٥٩ ملفاً): يسقط الخادمُ فيطفأ
 * `loading` وتبقى القائمةُ `[]` **فتُعرض «لا توجد فواتير»** والتاجر يقرؤها حقيقة.
 *
 * والعلاجُ بنيويّ لا تذكيريّ: الشاشةُ لا تملك `useState<T[]>([])` ولا تستدعي `api/`
 * — تستلم **اتحاداً مميَّزاً** فيه الخطأُ حالةٌ لا ردَّ نداء، و`<ResourceView>` يوجب
 * فرعاً لكلّ حالة **بالنوع**. فلا يمكن أن يُرسم الفارغُ على السقوط لأن السقوط ليس
 * فارغاً — حالتان مختلفتان في الاتحاد.
 *
 * ## الحالات الستّ (تعريفٌ واحد لكل الأنماط — الجولة ٢ §٣)
 *
 * `loading` · `error` · `forbidden` · `empty{filtered}` · `partial{failed}` · `ready`.
 * الحالةُ **تأتي من هنا** ولا تُستنتج من `data.length === 0` في الشاشة.
 */

/** سببُ سقوطٍ كما يُعرض: رسالةُ الخادم بلغته، ورمزُه إن وُجد، ومعرّفُ الطلب إن أرسله. */
export interface ApiFailure {
  /** رمزُ HTTP، أو `null` حين لم يصل ردٌّ أصلاً (انقطاع). */
  status: number | null;
  code?: string;
  message: string;
  requestId?: string;
}

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiFailure; retry: () => void }
  | { status: 'forbidden'; error: ApiFailure; grantedBy: string | null }
  | { status: 'empty'; filtered: boolean; reload: () => void }
  | { status: 'partial'; data: T; failed: ApiFailure[]; retry: () => void }
  | { status: 'ready'; data: T; reload: () => void };

interface AxiosLike {
  response?: { status?: number; data?: { grantedBy?: unknown }; headers?: Record<string, unknown> };
}

/** يحوّل خطأ axios إلى سببٍ قابل للعرض — بلا ابتلاع. */
export function toFailure(error: unknown, fallback = 'تعذّر الاتصال بالخادم'): ApiFailure {
  const res = (error as AxiosLike)?.response;
  const rid = res?.headers?.['x-request-id'];
  return {
    status: typeof res?.status === 'number' ? res.status : null,
    code: apiErrorCode(error),
    message: apiErrorMessage(error, fallback),
    requestId: typeof rid === 'string' ? rid : undefined,
  };
}

function grantedByOf(error: unknown): string | null {
  const g = (error as AxiosLike)?.response?.data?.grantedBy;
  return typeof g === 'string' && g ? g : null;
}

/** نتيجةُ تحميلٍ من مصادرَ عدّة سقط بعضُها — يُصنعها `partial()` ويقرؤها الخطّاف. */
export interface PartialLoad<T> {
  readonly __partial: true;
  data: T;
  failed: ApiFailure[];
}

export function partial<T>(data: T, failed: ApiFailure[]): PartialLoad<T> {
  return { __partial: true, data, failed };
}

function isPartial<T>(v: T | PartialLoad<T>): v is PartialLoad<T> {
  return typeof v === 'object' && v !== null && (v as PartialLoad<T>).__partial === true;
}

/** الفراغُ الافتراضي: مصفوفةٌ بلا عناصر، أو صفحةٌ بلا `items`، أو `null`. */
function defaultIsEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && Array.isArray((v as { items?: unknown }).items)) return (v as { items: unknown[] }).items.length === 0;
  return false;
}

export interface UseResourceOptions<T> {
  /** ما يُعيد التحميل حين يتغيّر — كما `useEffect`. */
  deps: readonly unknown[];
  /** هل النتيجةُ فارغة؟ الافتراضُ: مصفوفةٌ/صفحةٌ بلا عناصر. */
  isEmpty?: (value: T) => boolean;
  /** هل الفراغُ بعد بحثٍ أو ترشيح؟ يفرّق «لا عقود بعد» عن «لا نتيجة لـ«…»». */
  filtered?: boolean;
  /** نصٌّ احتياطيّ حين لا رسالةَ من الخادم (انقطاع). */
  fallbackMessage?: string;
}

/**
 * يحمّل `load` ويعيد `Resource<T>`. الرفضُ **لا يُستهلك بردّ نداء** — يصير حالةً.
 * النتيجةُ المتقادمة (تغيّرت `deps` قبل وصولها) تُهمَل، فلا تُرسم صفحةُ بحثٍ سابق على بحثٍ لاحق.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T | PartialLoad<T>>, options: UseResourceOptions<T>): Resource<T> {
  const { deps, isEmpty = defaultIsEmpty, filtered = false, fallbackMessage } = options;
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let stale = false;
    setState({ status: 'loading' });
    loadRef
      .current(controller.signal)
      .then((result) => {
        if (stale) return;
        if (isPartial(result)) {
          setState({ status: 'partial', data: result.data, failed: result.failed, retry: reload });
          return;
        }
        if (isEmpty(result)) setState({ status: 'empty', filtered, reload });
        else setState({ status: 'ready', data: result, reload });
      })
      .catch((error: unknown) => {
        if (stale || controller.signal.aborted) return;
        const failure = toFailure(error, fallbackMessage);
        if (failure.status === 403) setState({ status: 'forbidden', error: failure, grantedBy: grantedByOf(error) });
        else setState({ status: 'error', error: failure, retry: reload });
      });
    return () => {
      stale = true;
      controller.abort();
    };
    // `deps` هي مفاتيحُ إعادة التحميل بقرار المستدعي — كما في useEffect نفسه.
  }, [...deps, nonce, filtered]);

  return state;
}

/**
 * الكتابة — `onError` **إلزاميٌّ في النوع** (القاعدة ② على الحفظ):
 * حفظٌ يسقط بلا معالج كان يضيع صامتاً (`confirmDelete` في الفواتير كان يبتلع `409`).
 */
export interface MutationHandlers<R> {
  onSuccess?: (result: R) => void | Promise<void>;
  onError: (failure: ApiFailure) => void;
}

export interface Mutation<A, R> {
  mutate: (args: A) => Promise<R | undefined>;
  pending: boolean;
  failure: ApiFailure | null;
}

export function useMutation<A, R>(run: (args: A) => Promise<R>, handlers: MutationHandlers<R>): Mutation<A, R> {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const mutate = useCallback(
    async (args: A): Promise<R | undefined> => {
      setPending(true);
      setFailure(null);
      try {
        const result = await run(args);
        await handlersRef.current.onSuccess?.(result);
        return result;
      } catch (error: unknown) {
        const f = toFailure(error, 'تعذّر الحفظ');
        setFailure(f);
        handlersRef.current.onError(f);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [run],
  );

  return { mutate, pending, failure };
}
