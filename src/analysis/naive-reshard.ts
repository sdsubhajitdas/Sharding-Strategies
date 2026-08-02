import { HASH_FUNCTIONS } from "../hash";
import { ShardedStore } from "../db";
import type { Sharder } from "../sharder";
import { STRATEGY_FACTORIES } from "./registry";
import { printTable } from "./print-table";
import type { ExperimentRow } from "./types";

export interface NaiveReshardOptions {
  keys?: number;
  nodesBefore?: number;
  nodesAfter?: number;
}

export interface NaiveReshardResult {
  keys: number;
  nodesBefore: number;
  nodesAfter: number;
  failedReads: number;
  failureRate: number;
}

/**
 * The money measurement: writes `keys` rows, switches to a naive
 * `nodesAfter`-node topology (routing only — `rebalance` never moves the
 * rows), then replays every read. Whatever key-movement's %-moved number
 * predicted becomes a concrete failed-read count here, because a key
 * that now routes to a different shard than the one holding its row is
 * a 404, not a percentage.
 */
export function measureNaiveReshardFailures(sharder: Sharder, options: NaiveReshardOptions = {}): NaiveReshardResult {
  const keys = options.keys ?? 1_000_000;
  const nodesBefore = options.nodesBefore ?? 8;
  const nodesAfter = options.nodesAfter ?? nodesBefore + 1;

  const initialShardIds = Array.from({ length: nodesBefore }, (_, i) => `node-${i}`);
  const store = new ShardedStore(sharder, initialShardIds);

  for (let i = 0; i < keys; i++) store.set(`key-${i}`, i);

  store.setNaiveReshard(true);
  const newTopology = Array.from({ length: nodesAfter }, (_, i) => `node-${i}`);
  store.rebalance(newTopology);

  let failedReads = 0;
  for (let i = 0; i < keys; i++) {
    if (store.get(`key-${i}`) === undefined) failedReads++;
  }

  return { keys, nodesBefore, nodesAfter, failedReads, failureRate: failedReads / keys };
}

export function run(): ExperimentRow[] {
  const rows: ExperimentRow[] = [];
  for (const hashFn of HASH_FUNCTIONS) {
    for (const factory of STRATEGY_FACTORIES) {
      const sharder = factory.create(hashFn);
      const result = measureNaiveReshardFailures(sharder);
      rows.push({
        experiment: "naive-reshard-failures",
        strategy: sharder.name,
        hashFn: hashFn.name,
        params: { keys: result.keys, nodesBefore: result.nodesBefore, nodesAfter: result.nodesAfter },
        metrics: { failedReads: result.failedReads, failureRate: Number(result.failureRate.toFixed(4)) },
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
      keys: r.params.keys!,
      nodesBefore: r.params.nodesBefore!,
      nodesAfter: r.params.nodesAfter!,
      failedReads: r.metrics.failedReads!,
      failureRate: `${(r.metrics.failureRate! * 100).toFixed(1)}%`,
    }))
  );
}
