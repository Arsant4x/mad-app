import { createHash } from 'node:crypto';

/**
 * Secret values that are published in this repository: the test and example env files and
 * the CI workflows carry them in plain text, so anyone who can read the repository knows
 * them. A production server that boots with one of them boots with a known key.
 *
 * Only the SHA-256 of each value is kept here, never the value. The list is checked against
 * the files themselves by published-test-values.spec.ts: a new published value that is not
 * in this list fails that test, which prints the fingerprint to add.
 */
export const PUBLISHED_TEST_FINGERPRINTS: ReadonlySet<string> = new Set<string>([
  // JWT_ACCESS_SECRET: apps/api/.env.test.example and .github/workflows/web-tests.yml
  '2b7cd7fed8c3fe0e504ff1e3f3fad0132fefa80ff5b5c6b77e478509672497ab',
  // JWT_ACCESS_SECRET: .github/workflows/web-tests.yml (a second job)
  '1d4089aad92091bca33d61dca3a26752872e4b3c35e8fdfa9e24545bf48afbb8',
  // SECRETS_ENCRYPTION_KEY: apps/api/.env.test.example and .github/workflows/web-tests.yml
  '6ecc626e811cff9fc8a67a1ca0a64ec1bd2738d339ca7879ef7f90f048a0ff26',
  // PII_ENCRYPTION_KEYS: apps/api/.env.test.example and .github/workflows/web-tests.yml
  '720fdcb6bb8ee1d1a8103cab00a0ddac7963525f4f1601948d4d2cfecde46d0a',
  // PII_ENCRYPTION_KEYS: apps/api/.env.example
  '8b7789ba48f445f3b0bd921e4f79bbae4458dc09881dc46d7ab4634a3d9c318e',
  // PII_BLIND_INDEX_KEY: apps/api/.env.test.example and .github/workflows/web-tests.yml
  'd795f2bc01ba13f913616ce49e3ea086e7fd5b8b5bbe74e1566f1a0f7d9ddde6',
  // PII_BLIND_INDEX_KEY: apps/api/.env.example
  '52576e81d4144b67660444ece3f5f9d8adc7fc304788a57f2b089bbf7828bc4c',
]);

export const fingerprint = (value: string): string => createHash('sha256').update(value).digest('hex');

/** True when the value is one of the secrets published in the repository. */
export function isPublishedTestValue(value: string): boolean {
  return PUBLISHED_TEST_FINGERPRINTS.has(fingerprint(value.trim()));
}
