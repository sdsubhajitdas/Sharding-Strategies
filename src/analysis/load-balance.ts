import { HASH_FUNCTIONS } from "../hash";
import type { Sharder } from "../sharder";
import { STRATEGY_FACTORIES } from "./registry";
import { printTable } from "./print-table";
import type { ExperimentRow } from "./types";

export interface LoadBalanceOptions {
  keys?: number;
  nodeCount?: number;
}

export interface LoadBalanceResult {
  keys: number;
  nodeCount: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
  coefficientOfVariation: number;
}

/**
 * Distributes `keys` keys across a fixed `nodeCount`-node topology (no
 * resize involved) and reports how evenly they land. Modulo is expected
 * to win this one — it's the one place plain consistent hashing is
 * *worse* than the naive strategy, because one hash per node means the
 * arcs between positions vary wildly in size purely by chance.
 */
export function measureLoadBalance(sharder: Sharder, options: LoadBalanceOptions = {}): LoadBalanceResult {
  const keys = options.keys ?? 1_000_000;
  const nodeCount = options.nodeCount ?? 8;

  for (let i = 0; i < nodeCount; i++) sharder.addNode(`node-${i}`);

  const counts = new Map<string, number>();
  for (const id of sharder.nodes) counts.set(id, 0);

  for (let i = 0; i < keys; i++) {
    const nodeId = sharder.getNode(`key-${i}`);
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  }

  const values = Array.from(counts.values());
  const mean = keys / nodeCount;
  let min = Infinity;
  let max = -Infinity;
  let sumSquaredDiff = 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
    const diff = value - mean;
    sumSquaredDiff += diff * diff;
  }
  const stddev = Math.sqrt(sumSquaredDiff / nodeCount);

  return { keys, nodeCount, min, max, mean, stddev, coefficientOfVariation: stddev / mean };
}

export function run(): ExperimentRow[] {
  const rows: ExperimentRow[] = [];
  for (const hashFn of HASH_FUNCTIONS) {
    for (const factory of STRATEGY_FACTORIES) {
      const sharder = factory.create(hashFn);
      const result = measureLoadBalance(sharder);
      rows.push({
        experiment: "load-balance",
        strategy: sharder.name,
        hashFn: hashFn.name,
        params: { keys: result.keys, nodeCount: result.nodeCount },
        metrics: {
          min: result.min,
          max: result.max,
          stddev: Number(result.stddev.toFixed(2)),
          coefficientOfVariation: Number(result.coefficientOfVariation.toFixed(4)),
        },
      });
    }
  }
  return rows;
}

if (import.meta.main) {
  const rows = run();
  printTable(
    rows.map((r) => ({
      strategy: r.strategy,
      hashFn: r.hashFn,
      nodeCount: r.params.nodeCount!,
      min: r.metrics.min!,
      max: r.metrics.max!,
      stddev: r.metrics.stddev!,
      cov: r.metrics.coefficientOfVariation!,
    }))
  );
}
