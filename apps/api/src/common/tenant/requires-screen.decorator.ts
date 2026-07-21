import { SetMetadata } from '@nestjs/common';

export const REQUIRES_SCREEN_KEY = 'requiresScreen';

/**
 * Marks a controller/route as requiring access to a given screen key
 * (matching the mockup's screen names: 'accounts', 'invoice', 'properties'...).
 * TenantGuard reads this via Reflector and checks it against the caller's
 * permission template.
 */
export const RequiresScreen = (screen: string) => SetMetadata(REQUIRES_SCREEN_KEY, screen);
