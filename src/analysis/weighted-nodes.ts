import { HASH_FUNCTIONS } from "../hash";
import type { HashFunction } from "../hash/types";
import { VirtualNodeRingSharder } from "../strategies/vnode-ring";
import { printTable } from "./print-table";
import type { ExperimentRow } from "./types";

/** weight 1, 2, 3 — a linear scaling check, not just a single "2x" data point. */
const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = {
  "node-w1": 1,
  "node-w2": 2,
  "node-w3": 3,
};

export interface WeightedNodesOptions {
  keys?: number;
  weights?: Readonly<Record<string, number>>;
}

export interface WeightedNodesResult {
  keys: number;
  weights: Readonly<Record<string, number>>;
  keysPerNode: Record<string, number>;
  /** keysPerNode / weight — should land close to the same value across every node if weighting is working. */
  keysPerWeightUnit: Record<string, number>;
}

/**
 * Assigns virtual-node counts proportional to weight, then checks the
 * resulting key distribution actually scales the same way: a weight-2
 * node should receive ~2x a weight-1 node's keys, not just ~2x its ring
 * positions (positions -> keys is the part that actually matters).
 */
export function measureWeightedNodes(hashFn: HashFunction, options: WeightedNodesOptions = {}): WeightedNodesResult {
  const keys = options.keys ?? 300_000;
  const weights = options.weights ?? DEFAULT_WEIGHTS;

  const ring = new VirtualNodeRingSharder(hashFn);
  for (const [id, weight] of Object.entries(weights)) ring.addNode(id, weight);

  const keysPerNode: Record<string, number> = {};
  for (const id of Object.keys(weights)) keysPerNode[id] = 0;

  for (let i = 0; i < keys; i++) {
    const owner = ring.getNode(`key-${i}`);
    keysPerNode[owner] = (keysPerNode[owner] ?? 0) + 1;
  }

  const keysPerWeightUnit: Record<string, number> = {};
  for (const [id, weight] of Object.entries(weights)) {
    keysPerWeightUnit[id] = keysPerNode[id]! / weight;
  }

  return { keys, weights, keysPerNode, keysPerWeightUnit };
}

export function run(): ExperimentRow[] {
  const rows: ExperimentRow[] = [];
  for (const hashFn of HASH_FUNCTIONS) {
    const result = measureWeightedNodes(hashFn);
    for (const [id, weight] of Object.entries(result.weights)) {
      rows.push({
        experiment: "weighted-nodes",
        strategy: "vnode-ring",
        hashFn: hashFn.name,
        params: { keys: result.keys, nodeId: id, weight },
        metrics: {
          keysReceived: result.keysPerNode[id]!,
          keysPerWeightUnit: Math.round(result.keysPerWeightUnit[id]!),
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
      hashFn: r.hashFn,
      nodeId: r.params.nodeId!,
      weight: r.params.weight!,
      keysReceived: r.metrics.keysReceived!,
      keysPerWeightUnit: r.metrics.keysPerWeightUnit!,
    }))
  );
}
