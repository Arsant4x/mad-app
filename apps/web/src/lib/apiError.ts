import i18n from '../i18n';

/**
 * Reads the server's message from an axios error: one source for every screen.
 *
 * A bare `catch {}` throws the error object away and shows fixed text, while the server had said the
 * exact reason (and NestJS does not log 4xx), so the failure was invisible on both sides. Validation
 * messages arrive as an array (one line per failed rule); showing the array as is glues the lines
 * together, so it is flattened here once instead of in every screen.
 */

/** The NestJS error answer as it arrives through axios, with an `x-request-id` header and a `requestId` in the body. */
interface ApiErrorShape {
  response?: { status?: number; data?: { message?: unknown; code?: unknown; requestId?: unknown }; headers?: Record<string, unknown> };
  message?: unknown;
}

/**
 * The request ID as the server returned it: from the `x-request-id` header (exposed through CORS so the
 * browser can read it) or from the error body. Support finds the request in the log with it;
 * `undefined` when there was no answer at all (a network failure), so none is invented.
 */
export function apiRequestId(error: unknown): string | undefined {
  const res = (error as ApiErrorShape)?.response;
  const fromHeader = res?.headers?.['x-request-id'];
  if (typeof fromHeader === 'string' && fromHeader) return fromHeader;
  const fromBody = res?.data?.requestId;
  return typeof fromBody === 'string' && fromBody ? fromBody : undefined;
}

/**
 * The stable error code, not its text. Messages are translated and worded for the merchant, so matching
 * them breaks silently on the first rewording or language switch. `undefined` is the usual case: most
 * errors have no code.
 */
export function apiErrorCode(error: unknown): string | undefined {
  const code = (error as ApiErrorShape)?.response?.data?.code;
  return typeof code === 'string' && code ? code : undefined;
}

/**
 * A message ready to show: the server's message when present, otherwise `fallback`.
 * An array is flattened with a readable separator rather than glued together.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const raw = (error as ApiErrorShape)?.response?.data?.message;
  // A server error (`5xx`) carries its request ID in the message so it can be reported to support; a
  // `4xx` message names its own cause, and the ID is still available through `apiRequestId`.
  const status = (error as ApiErrorShape)?.response?.status;
  const requestId = apiRequestId(error);
  const withId = (text: string) => (requestId && typeof status === 'number' && status >= 500 ? i18n.t('common.api_error.with_request_id', { text, id: requestId }) : text);

  if (Array.isArray(raw)) {
    const parts = raw.map((m) => String(m).trim()).filter(Boolean);
    if (parts.length) return withId(parts.join(' · '));
  } else if (typeof raw === 'string' && raw.trim()) {
    return withId(raw.trim());
  }

  // A network failure or a crash before the answer: no `response` at all. The axios message itself is
  // technical English (`Network Error`), so it is not shown; the caller's fallback is clearer.
  return withId(fallback);
}
