import { HASH_FUNCTIONS } from "../hash";
import type { Sharder } from "../sharder";
import { STRATEGY_FACTORIES } from "./registry";
import { printTable } from "./print-table";
import type { ExperimentRow } from "./types";

export interface KeyMovementOptions {
  keys?: number;
  nodesBefore?: number;
  nodesAfter?: number;
}

export interface KeyMovementResult {
  keys: number;
  nodesBefore: number;
  nodesAfter: number;
  moved: number;
  movedPct: number;
}

/**
 * Snapshots where `keys` keys land on a `nodesBefore`-node topology, then
 * resizes to `nodesAfter` nodes (adding or removing as needed) and counts
 * how many keys landed somewhere different. This is the whole "why does
 * the ring exist" argument reduced to one number per strategy.
 */
export function measureKeyMovement(sharder: Sharder, options: KeyMovementOptions = {}): KeyMovementResult {
  const keys = options.keys ?? 1_000_000;
  const nodesBefore = options.nodesBefore ?? 8;
  const nodesAfter = options.nodesAfter ?? nodesBefore + 1;

  for (let i = 0; i < nodesBefore; i++) sharder.addNode(`node-${i}`);

  const keyList = new Array<string>(keys);
  const before = new Array<string>(keys);
  for (let i = 0; i < keys; i++) {
    const key = `key-${i}`;
    keyList[i] = key;
    before[i] = sharder.getNode(key);
  }

  for (let i = nodesBefore; i < nodesAfter; i++) sharder.addNode(`node-${i}`);
  for (let i = nodesAfter; i < nodesBefore; i++) sharder.removeNode(`node-${i}`);

  let moved = 0;
  for (let i = 0; i < keys; i++) {
    if (sharder.getNode(keyList[i]!) !== before[i]) moved++;
  }

  return { keys, nodesBefore, nodesAfter, moved, movedPct: moved / keys };
}

export function run(): ExperimentRow[] {
  const rows: ExperimentRow[] = [];
  for (const hashFn of HASH_FUNCTIONS) {
    for (const factory of STRATEGY_FACTORIES) {
      const sharder = factory.create(hashFn);
      const result = measureKeyMovement(sharder);
      rows.push({
        experiment: "key-movement",
        strategy: sharder.name,
        hashFn: hashFn.name,
        params: { keys: result.keys, nodesBefore: result.nodesBefore, nodesAfter: result.nodesAfter },
        metrics: { moved: result.moved, movedPct: Number(result.movedPct.toFixed(4)) },
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
      nodesBefore: r.params.nodesBefore!,
      nodesAfter: r.params.nodesAfter!,
      moved: r.metrics.moved!,
      movedPct: `${(r.metrics.movedPct! * 100).toFixed(1)}%`,
    }))
  );
}
