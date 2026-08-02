import { HASH_FUNCTIONS } from "../hash";
import type { HashFunction } from "../hash/types";
import { VirtualNodeRingSharder } from "../strategies/vnode-ring";
import { printTable } from "./print-table";
import type { ExperimentRow } from "./types";

export const VNODE_SWEEP_COUNTS: readonly number[] = [1, 10, 50, 100, 150, 500, 1000];

export interface VnodeSweepOptions {
  nodeCount?: number;
  balanceKeys?: number;
  lookupOps?: number;
}

export interface VnodeSweepResult {
  vnodeCount: number;
  nodeCount: number;
  coefficientOfVariation: number;
  bytesApprox: number;
  buildTimeMs: number;
  lookupOpsPerSec: number;
}

/**
 * One point on the vnode-count curve: build a ring with `vnodeCount`
 * positions per node (timing the build), measure how evenly it
 * distributes keys, and measure lookup throughput. Answers "why 150?"
 * with this repo's own numbers instead of folklore — see `run()`'s
 * flattening-point note.
 */
export function measureVnodeSweepPoint(
  hashFn: HashFunction,
  vnodeCount: number,
  options: VnodeSweepOptions = {}
): VnodeSweepResult {
  const nodeCount = options.nodeCount ?? 8;
  const balanceKeys = options.balanceKeys ?? 100_000;
  const lookupOps = options.lookupOps ?? 200_000;

  const nodeIds = Array.from({ length: nodeCount }, (_, i) => `node-${i}`);

  const buildStart = Bun.nanoseconds();
  const ring = new VirtualNodeRingSharder(hashFn, vnodeCount);
  for (const id of nodeIds) ring.addNode(id);
  const buildTimeMs = (Bun.nanoseconds() - buildStart) / 1_000_000;

  const counts = new Map(nodeIds.map((id) => [id, 0]));
  for (let i = 0; i < balanceKeys; i++) {
    const owner = ring.getNode(`key-${i}`);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  const values = Array.from(counts.values());
  const mean = balanceKeys / nodeCount;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nodeCount;
  const coefficientOfVariation = Math.sqrt(variance) / mean;

  // Brief warmup so JIT compilation isn't counted in the measured window.
  for (let i = 0; i < 10_000; i++) ring.getNode(`warmup-${i}`);
  const lookupStart = Bun.nanoseconds();
  for (let i = 0; i < lookupOps; i++) ring.getNode(`lookup-${i}`);
  const lookupElapsedNs = Bun.nanoseconds() - lookupStart;
  const lookupOpsPerSec = lookupOps / (lookupElapsedNs / 1e9);

  return {
    vnodeCount,
    nodeCount,
    coefficientOfVariation,
    bytesApprox: ring.stats().bytesApprox,
    buildTimeMs,
    lookupOpsPerSec,
  };
}

export function run(): ExperimentRow[] {
  const rows: ExperimentRow[] = [];
  for (const hashFn of HASH_FUNCTIONS) {
    for (const vnodeCount of VNODE_SWEEP_COUNTS) {
      const result = measureVnodeSweepPoint(hashFn, vnodeCount);
      rows.push({
        experiment: "vnode-sweep",
        strategy: "vnode-ring",
        hashFn: hashFn.name,
        params: { vnodeCount: result.vnodeCount, nodeCount: result.nodeCount },
        metrics: {
          coefficientOfVariation: Number(result.coefficientOfVariation.toFixed(4)),
          bytesApprox: result.bytesApprox,
          buildTimeMs: Number(result.buildTimeMs.toFixed(3)),
          lookupOpsPerSec: Math.round(result.lookupOpsPerSec),
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
      vnodeCount: r.params.vnodeCount!,
      cov: r.metrics.coefficientOfVariation!,
      bytesApprox: r.metrics.bytesApprox!,
      buildTimeMs: r.metrics.buildTimeMs!,
      lookupOpsPerSec: r.metrics.lookupOpsPerSec!,
    }))
  );

  // "Why 150?" — for a single fixed topology, CoV doesn't improve
  // perfectly monotonically as vnode count rises (more positions lowers
  // *expected* imbalance, but any one draw of hash positions can still
  // land better or worse than a lower vnode count's draw). So instead of
  // looking for a strict turning point, report what % of the total
  // improvement seen across the whole sweep each vnode count captures.
  for (const hashFn of HASH_FUNCTIONS) {
    const series = rows.filter((r) => r.hashFn === hashFn.name);
    const covAt1 = series[0]!.metrics.coefficientOfVariation!;
    const bestCov = Math.min(...series.map((r) => r.metrics.coefficientOfVariation!));
    const totalPossibleReduction = covAt1 - bestCov;

    console.log(`\n[${hashFn.name}] % of the sweep's total CoV improvement captured, memory, and lookup cost by vnode count:`);
    for (const point of series) {
      const cov = point.metrics.coefficientOfVariation!;
      const capturedPct = totalPossibleReduction === 0 ? 100 : ((covAt1 - cov) / totalPossibleReduction) * 100;
      const kb = (point.metrics.bytesApprox! / 1024).toFixed(1);
      console.log(
        `  ${String(point.params.vnodeCount).padStart(4)}: ${capturedPct.toFixed(0).padStart(3)}% captured, ` +
          `${kb.padStart(7)} KB, ${String(point.metrics.buildTimeMs).padStart(6)}ms build, ` +
          `${point.metrics.lookupOpsPerSec!.toLocaleString()} lookups/sec`
      );
    }
  }
}
