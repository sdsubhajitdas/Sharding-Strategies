import { murmur3 } from "../src/hash/murmur3";
import { ModuloSharder } from "../src/strategies/modulo";
import { RingSharder } from "../src/strategies/ring";
import { VirtualNodeRingSharder } from "../src/strategies/vnode-ring";
import type { Sharder } from "../src/sharder";
import { benchmark, printMethodology } from "./harness";
import { printTable } from "../src/analysis/print-table";

const NODE_COUNT = 8;
const KEY_POOL_SIZE = 10_000;
const VNODE_SWEEP: readonly number[] = [1, 10, 50, 150, 500, 1000];

/** Pre-generated so the measured loop pays only for `getNode`, not string template allocation. */
function keyPool(): string[] {
  return Array.from({ length: KEY_POOL_SIZE }, (_, i) => `key-${i}`);
}

function buildTopology(sharder: Sharder, nodeCount = NODE_COUNT): void {
  for (let i = 0; i < nodeCount; i++) sharder.addNode(`node-${i}`);
}

function benchLookup(sharder: Sharder) {
  const keys = keyPool();
  return benchmark((i) => sharder.getNode(keys[i % keys.length]!));
}

/** modulo is O(1); ring/vnode-ring are O(log positions) via binary search — this is where that shows up. */
export function runStrategyComparison(): Array<Record<string, string | number>> {
  const strategies: Array<{ name: string; sharder: Sharder }> = [
    { name: "modulo", sharder: new ModuloSharder(murmur3) },
    { name: "ring", sharder: new RingSharder(murmur3) },
    { name: "vnode-ring (150)", sharder: new VirtualNodeRingSharder(murmur3) },
  ];

  return strategies.map(({ name, sharder }) => {
    buildTopology(sharder);
    const result = benchLookup(sharder);
    return {
      strategy: name,
      positions: sharder.stats().positions,
      opsPerSec: Math.round(result.opsPerSec),
      meanNs: Number(result.meanNs.toFixed(1)),
    };
  });
}

export function runVnodeSweep(): Array<Record<string, string | number>> {
  return VNODE_SWEEP.map((vnodeCount) => {
    const sharder = new VirtualNodeRingSharder(murmur3, vnodeCount);
    buildTopology(sharder);
    const result = benchLookup(sharder);
    return {
      vnodeCount,
      positions: sharder.stats().positions,
      opsPerSec: Math.round(result.opsPerSec),
      meanNs: Number(result.meanNs.toFixed(1)),
    };
  });
}

if (import.meta.main) {
  printMethodology();
  console.log(`=== Lookup throughput by strategy (${NODE_COUNT} nodes) ===\n`);
  printTable(runStrategyComparison());
  console.log(`\n=== Lookup throughput vs vnode count (vnode-ring, ${NODE_COUNT} nodes) ===\n`);
  printTable(runVnodeSweep());
}
