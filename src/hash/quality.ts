import type { HashFunction } from "./types";

export interface HashQualityReport {
  hashName: string;
  keys: number;
  buckets: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
  coefficientOfVariation: number;
  /** Expected value under a uniform distribution is (buckets - 1). */
  chiSquare: number;
}

/**
 * Distributes sequential keys into buckets via `hash(key) % buckets` and
 * reports how even that distribution came out. This is what turns "use a
 * good hash function" from folklore into a number: a low coefficient of
 * variation and a chi-square near (buckets - 1) mean the hash spreads
 * keys uniformly; a bad hash shows up as a high CoV and inflated chi-square.
 */
export function checkHashQuality(
  hashFn: HashFunction,
  options: { keys?: number; buckets?: number } = {}
): HashQualityReport {
  const keys = options.keys ?? 1_000_000;
  const buckets = options.buckets ?? 1000;
  const counts = new Array<number>(buckets).fill(0);

  for (let i = 0; i < keys; i++) {
    const bucket = hashFn.hash(`key-${i}`) % buckets;
    counts[bucket]!++;
  }

  const mean = keys / buckets;
  let min = Infinity;
  let max = -Infinity;
  let sumSquaredDiff = 0;
  let chiSquare = 0;

  for (const count of counts) {
    if (count < min) min = count;
    if (count > max) max = count;
    const diff = count - mean;
    sumSquaredDiff += diff * diff;
    chiSquare += (diff * diff) / mean;
  }

  const stddev = Math.sqrt(sumSquaredDiff / buckets);

  return {
    hashName: hashFn.name,
    keys,
    buckets,
    min,
    max,
    mean,
    stddev,
    coefficientOfVariation: stddev / mean,
    chiSquare,
  };
}
