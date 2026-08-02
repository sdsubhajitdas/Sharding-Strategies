import { HASH_FUNCTIONS, checkHashQuality } from "../hash";
import { printTable } from "./print-table";
import type { ExperimentRow } from "./types";

/**
 * Not tied to any sharding strategy — this is "use a good hash function"
 * demonstrated with numbers instead of asserted. `strategy` is "-" since
 * the metric genuinely doesn't have one.
 */
export function run(): ExperimentRow[] {
  return HASH_FUNCTIONS.map((hashFn) => {
    const report = checkHashQuality(hashFn);
    return {
      experiment: "hash-quality",
      strategy: "-",
      hashFn: hashFn.name,
      params: { keys: report.keys, buckets: report.buckets },
      metrics: {
        min: report.min,
        max: report.max,
        stddev: Number(report.stddev.toFixed(2)),
        coefficientOfVariation: Number(report.coefficientOfVariation.toFixed(4)),
        chiSquare: Number(report.chiSquare.toFixed(2)),
      },
    };
  });
}

if (import.meta.main) {
  const rows = run();
  printTable(
    rows.map((r) => ({
      hashFn: r.hashFn,
      keys: r.params.keys!,
      buckets: r.params.buckets!,
      min: r.metrics.min!,
      max: r.metrics.max!,
      stddev: r.metrics.stddev!,
      cov: r.metrics.coefficientOfVariation!,
      chiSquare: r.metrics.chiSquare!,
    }))
  );
  const buckets = rows[0]!.params.buckets as number;
  console.log(`\n(expected chi-square under a uniform distribution: ~${buckets - 1})`);
}
