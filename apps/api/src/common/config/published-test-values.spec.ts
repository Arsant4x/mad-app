import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../source-scan.util';
import { assertProductionSecrets, bootGuardedVariables, knownValueProblem } from './production-secrets';
import { fingerprint, PUBLISHED_TEST_FINGERPRINTS } from './published-test-values';

// Reads env and workflow files as data (variable values), not TypeScript code.
readsDeclaredStrings();

/**
 * No secret published in the repository can boot production.
 *
 * The values are taken from the files themselves, not from a list: every committed example or
 * test env file, the docker compose files and every CI workflow. For each secret the boot guard
 * reads, every value found there must be refused, either as an example placeholder or by its
 * fingerprint in published-test-values.ts. A new published value that the guard would accept
 * fails here and names the fingerprint to add; the value itself is never printed.
 */
const REPO = join(__dirname, '..', '..', '..', '..', '..');
const SECRET_NAMES = bootGuardedVariables().filter((n) => /(KEY|SECRET|TOKEN|PASSWORD)S?$/.test(n));

/** Committed files that carry env values in plain text. */
function publishingFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((f) => /(^|\/)\.env[^/]*\.example$|(^|\/)docker-compose[^/]*\.ya?ml$|^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
}

interface Published {
  name: string;
  file: string;
  value: string;
}

/** NAME=value, NAME: value and - NAME=value lines; references such as ${{ secrets.X }} or ${X} are skipped. */
export function publishedValues(name: string, text: string): string[] {
  const out: string[] = [];
  const line = new RegExp(`^\\s*(?:-\\s+|export\\s+)?${name}\\s*[:=]\\s*(.*)$`);
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(line);
    if (!m) continue;
    const value = m[1].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!value || /\$\{/.test(value)) continue;
    out.push(value);
  }
  return out;
}

function allPublished(): Published[] {
  const out: Published[] = [];
  for (const file of publishingFiles()) {
    const text = readFileSync(join(REPO, file), 'utf8');
    for (const name of SECRET_NAMES) for (const value of publishedValues(name, text)) out.push({ name, file, value });
  }
  return out;
}

describe('no secret published in the repository can boot production', () => {
  const found = allPublished();

  it('the value reader finds a known line and skips references and empty values', () => {
    expect(publishedValues('JWT_ACCESS_SECRET', 'JWT_ACCESS_SECRET=abc123\n')).toEqual(['abc123']);
    expect(publishedValues('JWT_ACCESS_SECRET', '      JWT_ACCESS_SECRET: "abc 123"\n')).toEqual(['abc 123']);
    expect(publishedValues('JWT_ACCESS_SECRET', 'JWT_ACCESS_SECRET: ${{ secrets.X }}\nJWT_ACCESS_SECRET=\n')).toEqual([]);
    expect(publishedValues('JWT_ACCESS_SECRET', 'OTHER_JWT_ACCESS_SECRET=abc\n')).toEqual([]);
  });

  it('the surface is not empty: the test example and the CI workflow are read', () => {
    const files = new Set(found.map((p) => p.file));
    expect(files.has('apps/api/.env.test.example')).toBe(true);
    expect(files.has('.github/workflows/web-tests.yml')).toBe(true);
    expect(found.some((p) => p.name === 'JWT_ACCESS_SECRET')).toBe(true);
    expect(found.some((p) => p.name === 'SECRETS_ENCRYPTION_KEY')).toBe(true);
  });

  it('every published value is refused, as a placeholder or by its fingerprint', () => {
    const accepted = found
      .filter((p) => knownValueProblem(p.value) === null)
      .map((p) => `${p.name} in ${p.file}: add fingerprint ${fingerprint(p.value)}`);
    expect([...new Set(accepted)]).toEqual([]);
  });

  it('a fresh random value is not refused, so the check does not reject everything', () => {
    expect(knownValueProblem(randomBytes(48).toString('hex'))).toBeNull();
  });

  it('the fingerprint list holds only hex digests, never a value', () => {
    for (const f of PUBLISHED_TEST_FINGERPRINTS) expect(f).toMatch(/^[0-9a-f]{64}$/);
  });

  it('end to end: the session key from the test example stops the boot and is named', () => {
    const jwt = found.find((p) => p.name === 'JWT_ACCESS_SECRET' && p.file === 'apps/api/.env.test.example');
    expect(jwt).toBeDefined();
    let message = '';
    try {
      assertProductionSecrets({ NODE_ENV: 'production', JWT_ACCESS_SECRET: jwt!.value });
    } catch (e) {
      message = String((e as Error).message);
    }
    const line = message.split('\n').find((l) => l.includes('JWT_ACCESS_SECRET'));
    expect(line).toContain('منشورةً');
    expect(message).not.toContain(jwt!.value);
  });
});
