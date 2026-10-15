import { SetMetadata } from '@nestjs/common';

export const PLATFORM_AUDIT_TARGET_KEY = 'platformAuditTargetParam';

/**
 * Names the route parameter that holds the company a platform route acts on.
 *
 * Declared rather than guessed from a parameter name, so a route only counts as acting on a
 * company when it says so. The platform audit row then carries that company, and a change to it
 * is also written to the company's own audit trail for its owner to read.
 */
export const PlatformAuditTarget = (param: string) => SetMetadata(PLATFORM_AUDIT_TARGET_KEY, param);
