import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_INACTIVE_KEY = 'allowWhileInactive';

/**
 * Marks the one kind of endpoint a **frozen or stopped** tenant may still reach
 * even though it mutates: subscription self-service (view + renew/pay). It is
 * the deliberate hole in the lock-out, so a lapsed company can reactivate from
 * inside the platform instead of being forced to contact the provider.
 *
 * Use only on subscription renewal/payment — nothing else should let a stopped
 * tenant write.
 */
export const AllowWhileInactive = () => SetMetadata(ALLOW_WHILE_INACTIVE_KEY, true);
