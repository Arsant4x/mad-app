import { relativeCost, type RelativeCost } from '../src/common/relative-cost.util';

export interface SettleOptions {
  /** Rounds in each measurement, passed to relativeCost. */
  rounds?: number;
  /** Two ratios agree when they differ by at most this share of the larger one. */
  agreement?: number;
  /** Stops a run that never settles; it is not a looser threshold. */
  deadlineMs?: number;
}

/**
 * Measures again until two measurements in a row agree, then returns the last one.
 *
 * Under load one pause can land on a single round and flip the ratio of that sample.
 * Two samples in a row that agree are the settled state. A broken measure (swapped
 * sides, or a subject that does not do the work it claims) settles too, just on the
 * wrong value, so the assertion after it still fails.
 */
export function settledCost(
  subject: () => unknown,
  reference: () => unknown,
  { rounds = 3, agreement = 0.25, deadlineMs = 10000 }: SettleOptions = {},
): { cost: RelativeCost; samples: number } {
  const started = Date.now();
  let previous = relativeCost(subject, reference, rounds);
  let samples = 1;
  for (;;) {
    const current = relativeCost(subject, reference, rounds);
    samples += 1;
    const spread = Math.abs(current.ratio - previous.ratio);
    if (spread <= agreement * Math.max(current.ratio, previous.ratio)) return { cost: current, samples };
    if (Date.now() - started > deadlineMs) {
      throw new Error(
        `The ratio never settled in ${deadlineMs} ms over ${samples} samples; last two: ${previous.ratio.toFixed(1)} and ${current.ratio.toFixed(1)}`,
      );
    }
    previous = current;
  }
}
