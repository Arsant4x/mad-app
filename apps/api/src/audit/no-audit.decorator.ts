import { SetMetadata } from '@nestjs/common';

export const NO_AUDIT_KEY = 'noAudit';

/**
 * Excludes an endpoint from the audit trail. Reserved for calls that are noise
 * rather than history — a manual "run this sweep now" button, or an idempotent
 * re-check that changes nothing a reader would care about.
 *
 * Never put this on anything that changes business data.
 */
export const NoAudit = () => SetMetadata(NO_AUDIT_KEY, true);
