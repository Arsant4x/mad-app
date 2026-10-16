import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@mad-app/db';
import { clientDrift, clientModels, schemaModels } from '../../test/prisma-client-fingerprint';
import { settledCost } from '../../test/settled-cost';
import { relativeCostVerdict } from './relative-cost.util';
import { readsDeclaredStrings } from './source-scan.util';

/**
 * Prisma client fingerprint, proven in both directions.
 *
 * The samples are cut from the real schema.prisma, not written for the test: a made-up
 * sample is cleaner than the real file and hides what breaks the detector.
 */
const SCHEMA_PATH = join(__dirname, '..', '..', 'prisma', 'schema.prisma');
const SCHEMA = readFileSync(SCHEMA_PATH, 'utf8');

/** The reference input: a file unrelated to Prisma and to the schema. */
const MESSAGES_PATH = join(__dirname, 'i18n', 'messages.ts');

/**
 * The relative ceiling. The schema is about 168 KB and the messages file about 69 KB,
 * so the natural ratio sits near two or three; six leaves room for jitter and still
 * catches a slowdown that doubles the cost. Do not raise it when it fails: either the
 * fingerprint got slower or the reference is no longer comparable work.
 */
const MAX_FINGERPRINT_RATIO = 6;

describe('Client fingerprint: flags what is missing, leaves what is extra', () => {
  it('a schema field the client does not know is flagged by name', () => {
    // Cut from the schema with its order and spacing.
    const real = ['model Company {', '  id                   String  @id @default(uuid())', '  creditLimitHardBlock Boolean @default(false)', '}'].join('\n');
    const schema = schemaModels(real);
    const client = new Map([['Company', new Set(['id'])]]);
    // The name comes out of the output, since a report that only says "drift" ends no search.
    expect(clientDrift(schema, client)).toEqual(['Company.creditLimitHardBlock']);
  });

  it('a whole model the client does not know is flagged by name', () => {
    const schema = schemaModels(['model Invoice {', '  id String @id', '}'].join('\n'));
    expect(clientDrift(schema, new Map())).toEqual(['Invoice']);
  });

  it('an extra client field is left alone, so a newer client does not fail a sound branch', () => {
    // One direction on purpose: a missing field breaks, an extra one does not, and
    // flagging both would fail a sound branch that is only behind.
    const schema = schemaModels(['model Company {', '  id String @id', '}'].join('\n'));
    expect(clientDrift(schema, new Map([['Company', new Set(['id', 'fieldFromANewerBranch'])]]))).toEqual([]);
  });

  it('comments are not read as fields', () => {
    // The real shape: a triple slash comment above the field.
    const real = ['model Company {', '  /// حدُّ الائتمان — شرحٌ لا حقل', '  id String @id', '}'].join('\n');
    expect(schemaModels(real).get('Company')).toEqual(new Set(['id']));
  });

  it('on the tree as it is, the client knows everything the schema declares', () => {
    // The negative case on the real tree: green here is what makes the red cases believable.
    expect(clientDrift(schemaModels(SCHEMA), clientModels(Prisma.dmmf))).toEqual([]);
  });

  describe('its cost is measured against a reference in the same run', () => {
    /** The whole fingerprint, as each jest process runs it once: read the schema, derive its models, compare. */
    const fingerprint = () => clientDrift(schemaModels(readFileSync(SCHEMA_PATH, 'utf8')), clientModels(Prisma.dmmf));

    /**
     * The same kind of work on an unrelated input: read a file and build a map of matches.
     * It is measured in the same run, alternating with the subject, never kept from an earlier run.
     */
    const reference = () => {
      // Reads text on purpose: this is a cost reference, not a guard, and stripping strings would cut its work.
      readsDeclaredStrings();
      const text = readFileSync(MESSAGES_PATH, 'utf8');
      const map = new Map<string, Set<string>>();
      for (const m of text.matchAll(/\b([a-z_][a-z0-9_]*)\s*:\s*'([^']*)'/gi)) {
        if (!map.has(m[1])) map.set(m[1], new Set());
        map.get(m[1])!.add(m[2]);
      }
      return map;
    };

    it('the fingerprint is cheap relative to its reference', () => {
      // Settled over twenty rounds, not one measurement of ten: under heavy load a single
      // measurement crossed six in 55 of 3200 runs while nothing had changed.
      const { cost, samples } = settledCost(fingerprint, reference, { rounds: 20, deadlineMs: 60000 });
      // eslint-disable-next-line no-console
      console.log(
        `\nFingerprint ${cost.subjectMs.toFixed(1)} ms, reference ${cost.referenceMs.toFixed(1)} ms, ratio ${cost.ratio.toFixed(1)} (ceiling ${MAX_FINGERPRINT_RATIO}) after ${samples} samples\n`,
      );
      // The verdict carries the numbers and what to do, since whoever sees it red reads the message.
      const verdict = relativeCostVerdict(cost, MAX_FINGERPRINT_RATIO, 'كلفةُ بصمة العميل', 'مرجعٌ من جنسها');
      if (verdict) throw new Error(verdict);
      expect(samples).toBeGreaterThanOrEqual(2);
      expect(cost.ratio).toBeLessThan(MAX_FINGERPRINT_RATIO);
    });

    it('reverse proof: a deliberately slowed fingerprint fails the assertion', () => {
      /**
       * Two earlier slowdowns failed. A fixed 50 ms delay passed idle and failed under load,
       * where the reference itself rose to 39 ms: an absolute amount in a relative measure.
       * Repeating the reference eight times failed in CI at 4.48, since back to back reads of
       * one file cost less than separate ones. So the slowdown repeats the subject: twenty
       * repeats pass six whenever the plain ratio is above 0.3, and it sits near two.
       *
       * One measurement still fell to 3.94 once in CI, so the case waits for two measurements
       * in a row that agree. A reference round lasts a few milliseconds, so the ratio spreads
       * widely even idle (9 to 53 over 200 runs); two samples agree within half of the larger
       * one, and a paused sample, several times off, still does not count. Under heavy load
       * one measurement takes seconds, hence the long deadline. A slowdown that does not
       * really slow settles near two and still fails.
       */
      const SLOWDOWN_REPEATS = 20;
      const slowed = () => {
        for (let i = 0; i < SLOWDOWN_REPEATS; i++) fingerprint();
      };
      const { cost, samples } = settledCost(slowed, reference, { rounds: 3, agreement: 0.5, deadlineMs: 120000 });
      expect(samples).toBeGreaterThanOrEqual(2);
      expect(cost.ratio).toBeGreaterThanOrEqual(MAX_FINGERPRINT_RATIO);
    });
  });
});
