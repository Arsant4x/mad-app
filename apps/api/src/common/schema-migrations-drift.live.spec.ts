import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * schema.prisma must describe every table and index the migrations create. When it lags,
 * `prisma migrate dev` reads the gap as an intent to drop and writes that drop into the next
 * migration. This guard diffs the migrated test database against schema.prisma and fails on
 * any statement that would drop a table or an index, or rename an index or a constraint.
 *
 * Limit: Prisma does not model triggers, CHECK constraints or row level security, so the diff
 * cannot see them; those have their own live guards.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const SCHEMA = join(__dirname, '..', '..', 'prisma', 'schema.prisma');
const PRISMA_CLI = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js');

/** Destructive statements in a `migrate diff --script` output, one entry per statement. */
function destructiveStatements(script: string): string[] {
  return script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        /^DROP\s+TABLE\b/i.test(line) ||
        /^DROP\s+INDEX\b/i.test(line) ||
        /^ALTER\s+INDEX\b.*\bRENAME\s+TO\b/i.test(line) ||
        /^ALTER\s+TABLE\b.*\bRENAME\s+CONSTRAINT\b/i.test(line),
    );
}

/** Runs the CLI with the database URL from the environment, so no secret goes on the command line. */
function migrateDiff(to: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(
    process.execPath,
    [PRISMA_CLI, 'migrate', 'diff', '--from-schema-datasource', SCHEMA, ...to, '--script'],
    { env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('destructive statement detector', () => {
  it('catches the drops and the index rename that a lagging schema produces', () => {
    const lagging = [
      '-- DropIndex',
      'DROP INDEX "api_keys_companyId_idx";',
      '',
      '-- DropTable',
      'DROP TABLE "tasks";',
      '',
      '-- RenameIndex',
      'ALTER INDEX "verification_challenges_companyId_purpose_subjectKey_createdAt_" RENAME TO "verification_challenges_companyId_purpose_subjectKey_create_idx";',
      '',
      '-- RenamePrimaryKey',
      'ALTER TABLE "tasks" RENAME CONSTRAINT "tasks_pk" TO "tasks_pkey";',
    ].join('\r\n');
    expect(destructiveStatements(lagging)).toHaveLength(4);
  });

  it('passes an empty diff and statements that only add', () => {
    expect(destructiveStatements('-- This is an empty migration.\n')).toEqual([]);
    const additive = ['-- CreateIndex', 'CREATE INDEX "api_keys_companyId_idx" ON "api_keys"("companyId");'].join('\n');
    expect(destructiveStatements(additive)).toEqual([]);
  });
});

d('schema.prisma matches the migrated database', () => {
  it('the diff tool sees the database: diffing to an empty schema drops a known table', () => {
    const r = migrateDiff(['--to-empty']);
    expect(r.stderr).not.toMatch(/Error/);
    expect(r.status).toBe(0);
    expect(destructiveStatements(r.stdout)).toContain('DROP TABLE "api_keys";');
  });

  it('diffing the database to schema.prisma drops no table or index and renames no index', () => {
    const r = migrateDiff(['--to-schema-datamodel', SCHEMA]);
    expect(r.stderr).not.toMatch(/Error/);
    expect(r.status).toBe(0);
    expect(destructiveStatements(r.stdout)).toEqual([]);
  });
});
