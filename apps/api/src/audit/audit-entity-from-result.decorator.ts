import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_FROM_RESULT_KEY = 'auditEntityFromResult';
export const AUDIT_CREATED_ID_PATH_KEY = 'auditCreatedIdPath';

/**
 * Makes the audit row point at the document the handler **created**, not at the
 * one in the path.
 *
 * The interceptor's default (`paramId ?? resultId`) is right for the ordinary
 * case — `PATCH /invoices/:id` edits that invoice, and `POST /contracts/:id/
 * payments` is an event *on* that lease, so "what happened to contract X" must
 * keep finding it. But a credit note is not an event on its original invoice:
 * it is a document of its own, with its own number, its own ZATCA stamp and its
 * own position in the hash chain. Two notes may be issued against one invoice,
 * so a trail keyed on the invoice cannot answer **which** note a person
 * recorded — and `SPEC 30.9` asks exactly that ("ومن سجّله").
 *
 * Use it only where the created row is the **same kind of document** as the one
 * in the path, so `entity` stays true. A quote that mints an invoice is not
 * that case: see AuditCreatedIdAt.
 */
export const AuditEntityFromResult = () => SetMetadata(AUDIT_ENTITY_FROM_RESULT_KEY, true);

/**
 * Names where a created row's id lives on the result, when the handler does not
 * return it at the top level.
 *
 * `POST /quotes/:id/convert` returns `{quote, invoice}`. The invoice it mints
 * has no `id` on the result root, so the interceptor cannot see it at all and
 * that invoice is born **entirely outside** the trail — not mis-attributed,
 * absent. Flipping the row onto the invoice instead would only trade one
 * absence for another, because the quote is what the caller acted on. So the
 * row keeps naming the quote and carries the invoice's id beside it, and both
 * questions stay answerable from one entry.
 */
export const AuditCreatedIdAt = (path: string) => SetMetadata(AUDIT_CREATED_ID_PATH_KEY, path);

/** Walks a dotted path over an unknown result, returning a string id or null. */
export function idFromResultPath(result: unknown, path: string): string | null {
  let node: unknown = result;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'string' ? node : null;
}
