import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_FROM_RESULT_KEY = 'auditEntityFromResult';

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
 * Put this only on a POST whose result **is** a new document.
 */
export const AuditEntityFromResult = () => SetMetadata(AUDIT_ENTITY_FROM_RESULT_KEY, true);
