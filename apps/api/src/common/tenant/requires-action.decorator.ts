import { SetMetadata } from '@nestjs/common';
import type { ScreenAction } from '../../templates/screens';

export const REQUIRES_ACTION_KEY = 'requiresAction';

/**
 * Marks a route as requiring a specific action on its @RequiresScreen screen —
 * e.g. `@RequiresAction('add')` on contract creation. A read without it is gated
 * by its screen alone; a write (POST, PUT, PATCH, DELETE) under a screen without
 * it is refused by TenantGuard unless marked @OwnerOnly or @TenantWide.
 *
 * Deliberately not inferred from the HTTP method: many POSTs are workflow
 * actions (cancel a contract, run a sweep), not "add", and mapping them to
 * "add" would gate them on the wrong permission.
 */
export const RequiresAction = (action: ScreenAction) => SetMetadata(REQUIRES_ACTION_KEY, action);
