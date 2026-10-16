import { rmSync } from 'node:fs';
import { STATE_FILE } from './fixtures';

/**
 * Removes the run's state file and leaves the registered company in place. The API no longer deletes a
 * company: an account is closed through a deletion request and a second administrator's decision, then kept
 * for its retention period. The CI database is discarded with the job.
 */
export default async function globalTeardown(): Promise<void> {
  rmSync(STATE_FILE, { force: true });
}
