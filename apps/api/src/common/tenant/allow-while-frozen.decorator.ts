import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_INACTIVE_KEY = 'allowWhileInactive';

/**
 * Marks the routes a **frozen or stopped** tenant may still reach, even when they
 * write: its subscription state, the export of its data, the sub-processor consent
 * and the request to close the account. It is the deliberate opening in the
 * lock-out, so a lapsed company is never trapped inside its own account. It grants
 * no subscription time.
 *
 * Use only on those routes; nothing else should let a stopped tenant write.
 */
export const AllowWhileInactive = () => SetMetadata(ALLOW_WHILE_INACTIVE_KEY, true);
