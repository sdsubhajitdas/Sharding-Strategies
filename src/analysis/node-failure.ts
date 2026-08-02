import { HASH_FUNCTIONS } from "../hash";
import { ShardedStore } from "../db";
import type { Sharder } from "../sharder";
import { STRATEGY_FACTORIES } from "./registry";
import { printTable } from "./print-table";
import type { ExperimentRow } from "./types";

export interface NodeFailureOptions {
  keys?: number;
  nodeCount?: number;
}

export interface NodeFailureResult {
  keys: number;
  nodeCount: number;
  deadNodeId: string;
  deadNodeKeyCount: number;
  /** How many of the dead node's keys each survivor now owns. */
  survivorDeltas: Record<string, number>;
  /** The single largest survivor's share of the dead node's keys — 1.0 means one node absorbed everything. */
  maxSurvivorSharePct: number;
  minSurvivorSharePct: number;
}

/**
 * Kills one node in a `nodeCount`-node topology and reports where its
 * keys land among the survivors. This is where plain consistent hashing
 * shows its other failure mode (distinct from load balance): with one
 * ring position per node, a dead node's entire arc is inherited by
 * whichever survivor's position immediately follows it clockwise — one
 * machine absorbs ~all of the load. Virtual nodes scatter a physical
 * node across many ring points, so its neighbors (and therefore its
 * failure-mode successors) are many different survivors, not one.
 */
export function measureNodeFailure(sharder: Sharder, options: NodeFailureOptions = {}): NodeFailureResult {
  const keys = options.keys ?? 300_000;
  const nodeCount = options.nodeCount ?? 3;
  const nodeIds = Array.from({ length: nodeCount }, (_, i) => `node-${i}`);

  const store = new ShardedStore(sharder, nodeIds);
  for (let i = 0; i < keys; i++) store.set(`key-${i}`, i);

  const deadNodeId = nodeIds[0]!;
  const deadShard = store.shards.find((s) => s.id === deadNodeId)!;
  const deadNodeKeys = Array.from(deadShard.entries()).map((row) => row.key);
  const deadNodeKeyCount = deadNodeKeys.length;

  store.killShard(deadNodeId);

  const survivorIds = nodeIds.filter((id) => id !== deadNodeId);
  const survivorDeltas: Record<string, number> = {};
  for (const id of survivorIds) survivorDeltas[id] = 0;

  for (const key of deadNodeKeys) {
    const newOwner = sharder.getNode(key);
    survivorDeltas[newOwner] = (survivorDeltas[newOwner] ?? 0) + 1;
  }

  const shares = Object.values(survivorDeltas).map((count) => (deadNodeKeyCount === 0 ? 0 : count / deadNodeKeyCount));

  return {
    keys,
    nodeCount,
    deadNodeId,
    deadNodeKeyCount,
    survivorDeltas,
    maxSurvivorSharePct: Math.max(...shares),
    minSurvivorSharePct: Math.min(...shares),
  };
}

export function run(): ExperimentRow[] {
  const rows: ExperimentRow[] = [];
  for (const hashFn of HASH_FUNCTIONS) {
    for (const factory of STRATEGY_FACTORIES) {
      const sharder = factory.create(hashFn);
      const result = measureNodeFailure(sharder);
      rows.push({
        experiment: "node-failure",
        strategy: sharder.name,
        hashFn: hashFn.name,
        params: { keys: result.keys, nodeCount: result.nodeCount, deadNodeId: result.deadNodeId },
        metrics: {
          deadNodeKeyCount: result.deadNodeKeyCount,
          maxSurvivorSharePct: Number(result.maxSurvivorSharePct.toFixed(4)),
          minSurvivorSharePct: Number(result.minSurvivorSharePct.toFixed(4)),
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
      deadNodeKeys: r.metrics.deadNodeKeyCount!,
      maxSurvivorShare: `${(r.metrics.maxSurvivorSharePct! * 100).toFixed(1)}%`,
      minSurvivorShare: `${(r.metrics.minSurvivorSharePct! * 100).toFixed(1)}%`,
    }))
  );
  console.log(
    "\nmaxSurvivorShare near 100% means one survivor absorbed almost all of the dead " +
      "node's keys; near an even split (1 / survivor count) means the load spread out."
  );
}
