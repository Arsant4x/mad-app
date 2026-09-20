import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * **معرِّفُ الطلب على كلِّ استجابة — بما فيها الخطأ** (`ق-١٢٣٧`).
 *
 * وسيطٌ يُركَّب **قبل كلِّ معالج** (أوّلَ السلسلة في `main.ts`): يقرأ `x-request-id` الوارد إن كان
 * معرِّفاً صالحاً (`uuid`) — فالمتصفّحُ أو الوكيلُ الأمامي قد يبدأ الأثر — وإلا يولّد واحداً؛ ويضعه
 * على الاستجابة **فوراً** بـ`res.setHeader` لا في المعالج، فيحمله `404` لمسارٍ لا وجود له و`500`
 * لاستثناءٍ لم يُلتقط و`401` قبل أيّ حارس — لأن الرأسَ يُكتب قبل أن يقرّر أحدٌ شيئاً.
 *
 * ولا يُقبل الواردُ بلا فحص: نصٌّ حرّ في رأسٍ يُعاد في السجلّ وجسم الخطأ **حقنُ سجلّ**، فما ليس
 * `uuid` يُستبدل ولا يُردّ.
 *
 * والمتصفّحُ لا يقرأ رأساً مخصَّصاً حتى يُعلَن في `CORS` (`exposedHeaders`) — وهو في `main.ts`.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestWithId = Request & { requestId?: string };

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function requestIdOf(req: Request): string | undefined {
  return (req as RequestWithId).requestId;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = isRequestId(incoming) ? incoming.toLowerCase() : randomUUID();
  (req as RequestWithId).requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
