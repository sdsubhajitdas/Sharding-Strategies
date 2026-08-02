import { murmur3 } from "../src/hash/murmur3";
import { ModuloSharder } from "../src/strategies/modulo";
import { RingSharder } from "../src/strategies/ring";
import { VirtualNodeRingSharder } from "../src/strategies/vnode-ring";
import type { Sharder } from "../src/sharder";
import { printMethodology } from "./harness";
import { printTable } from "../src/analysis/print-table";

const NODE_COUNTS: readonly number[] = [10, 50, 100, 500, 1000, 2000];

/**
 * Single timed run per point, not averaged — construction is a one-time
 * (or rare, on scale-out) cost, not a hot loop, so warmup/averaging
 * across repeated builds would measure something nobody's workload does.
 */
function timeBuild(makeSharder: () => Sharder, nodeCount: number): number {
  const sharder = makeSharder();
  const startNs = Bun.nanoseconds();
  for (let i = 0; i < nodeCount; i++) sharder.addNode(`node-${i}`);
  return (Bun.nanoseconds() - startNs) / 1e6;
}

/** modulo is O(nodes) to build; ring/vnode-ring are more, since every addNode merges new positions into the sorted array — this is where "more vnodes costs real build time" shows up as node count grows. */
export function runBuildTimeSweep(): Array<Record<string, string | number>> {
  return NODE_COUNTS.map((nodeCount) => ({
    nodeCount,
    "modulo (ms)": Number(timeBuild(() => new ModuloSharder(murmur3), nodeCount).toFixed(3)),
    "ring (ms)": Number(timeBuild(() => new RingSharder(murmur3), nodeCount).toFixed(3)),
    "vnode-ring/150 (ms)": Number(timeBuild(() => new VirtualNodeRingSharder(murmur3), nodeCount).toFixed(3)),
  }));
}

if (import.meta.main) {
  printMethodology();
  console.log("=== Ring construction time vs node count (single run per point — see comment in source) ===\n");
  printTable(runBuildTimeSweep());
}
