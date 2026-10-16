import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The e2e step runs its suites in sequential shards. One jest process keeps about 17.5 MB per
 * suite, so a shard of 63 suites ran out of heap on the CI runner while 62 passed. The shard
 * count therefore grows with the number of files instead of staying at the requested four.
 */
describe('e2e shard size follows the file count', () => {
  const TOOL = pathToFileURL(join(__dirname, '..', '..', 'scripts', 'sharded-jest.mjs')).href;
  const shards = (requested: number, files: number): number =>
    Number(
      execFileSync(
        process.execPath,
        ['--input-type=module', '-e', `import { shardCountFor } from ${JSON.stringify(TOOL)}; console.log(shardCountFor(${requested}, ${files}));`],
        { encoding: 'utf8' },
      ).trim(),
    );

  it('keeps every shard at or under fifty files', () => {
    for (const files of [100, 200, 248, 249, 251, 400]) {
      const count = shards(4, files);
      expect(Math.ceil(files / count)).toBeLessThanOrEqual(50);
    }
    expect(shards(4, 249)).toBe(5);
  });

  it('keeps the requested count as a floor and never leaves a shard empty', () => {
    expect(shards(4, 120)).toBe(4);
    expect(shards(4, 10)).toBe(4);
    expect(shards(4, 3)).toBe(1);
    expect(shards(1, 1)).toBe(1);
  });
});
