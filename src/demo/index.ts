import { mkdir, writeFile } from "node:fs/promises";
import { murmur3 } from "../hash/murmur3";
import { ModuloSharder } from "../strategies/modulo";
import { RingSharder } from "../strategies/ring";
import { VirtualNodeRingSharder } from "../strategies/vnode-ring";
import type { Sharder } from "../sharder";
import { renderAsciiRing } from "./ascii-ring";
import { renderSvgRing } from "./svg-ring";
import { printTable } from "../analysis/print-table";

// Two different sample sizes for two different jobs:
//  - STAT_KEYS (200) feeds the moved-count summary at the bottom, where
//    more keys means a more statistically convincing distribution.
//  - VISUAL_KEYS (30, a prefix of STAT_KEYS) is what actually gets
//    plotted as dots on the ASCII ring above. A 61x23 character grid
//    only has so many legible positions on its inner ring — 200 dots
//    there just overlap into an unreadable smear, so the visual panels
//    intentionally use a smaller, same-flavor subset.
const STAT_KEYS: readonly string[] = Array.from({ length: 200 }, (_, i) => `user-${1000 + i}`);
const VISUAL_KEYS: readonly string[] = STAT_KEYS.slice(0, 30);
// "shard" (not "cache") to match this repo's own vocabulary — Shard/
// ShardedStore are the actual classes a resize moves data between.
const INITIAL_NODES: readonly string[] = ["shard-1", "shard-2", "shard-3", "shard-4", "shard-5", "shard-6"];
// The next natural id after shard-1..6 — not cherry-picked for a nicer
// number. It happens to move 8/200 (4%) of STAT_KEYS on the plain ring,
// well under the ~14.3% (1/7) expectation for this run, which is itself
// the honest run-to-run variance story from the key-movement experiment
// (a single resize's %-moved is a high-variance draw, not a fixed
// constant) — visible in the summary below, not smoothed away.
const NEW_NODE = "shard-7";

const isTTY = Boolean(process.stdout.isTTY);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pauses and clears in a real terminal; just prints a divider when output is piped/redirected (e.g. captured for the post), so nothing is lost to a clear screen the reader never saw. */
async function beat(ms: number): Promise<void> {
  if (isTTY) {
    await sleep(ms);
    process.stdout.write("\x1b[2J\x1b[H");
  } else {
    console.log(`\n${"-".repeat(61)}\n`);
  }
}

async function main(): Promise<void> {
  console.log("Consistent hashing ring — live demo\n");
  console.log(`${INITIAL_NODES.length} nodes, ${VISUAL_KEYS.length} keys plotted (of ${STAT_KEYS.length} sampled for the stats below), hash: ${murmur3.name}\n`);

  const ring = new RingSharder(murmur3);
  for (const id of INITIAL_NODES) ring.addNode(id);

  const before = new Map(VISUAL_KEYS.map((k) => [k, ring.getNode(k)]));

  console.log("--- Before: 6 nodes ---\n");
  console.log(renderAsciiRing(ring.nodes, murmur3, VISUAL_KEYS, (k) => ring.getNode(k)));

  await beat(1500);

  ring.addNode(NEW_NODE);
  const after = new Map(VISUAL_KEYS.map((k) => [k, ring.getNode(k)]));
  const moved = new Set(VISUAL_KEYS.filter((k) => before.get(k) !== after.get(k)));

  console.log(`--- After: added ${NEW_NODE} (✱ = moved) ---\n`);
  console.log(renderAsciiRing(ring.nodes, murmur3, VISUAL_KEYS, (k) => ring.getNode(k), { movedKeys: moved }));
  console.log(`\n${moved.size} of ${VISUAL_KEYS.length} plotted keys moved.`);

  await beat(1500);

  console.log(`--- Same resize, ${STAT_KEYS.length} keys, all three strategies ---\n`);

  const strategies: ReadonlyArray<{ name: string; sharder: Sharder }> = [
    { name: "modulo", sharder: new ModuloSharder(murmur3) },
    { name: "ring", sharder: new RingSharder(murmur3) },
    { name: "vnode-ring", sharder: new VirtualNodeRingSharder(murmur3) },
  ];

  const outcomes = new Map<string, { movedCount: number }>();
  for (const { name, sharder } of strategies) {
    for (const id of INITIAL_NODES) sharder.addNode(id);
    const b = new Map(STAT_KEYS.map((k) => [k, sharder.getNode(k)]));
    sharder.addNode(NEW_NODE);
    const movedCount = STAT_KEYS.filter((k) => sharder.getNode(k) !== b.get(k)).length;
    outcomes.set(name, { movedCount });
  }

  const maxBarWidth = 40;
  const maxMoved = Math.max(...strategies.map(({ name }) => outcomes.get(name)!.movedCount));
  printTable(
    strategies.map(({ name }) => {
      const movedCount = outcomes.get(name)!.movedCount;
      const barLength = maxMoved === 0 ? 0 : Math.round((movedCount / maxMoved) * maxBarWidth);
      return {
        strategy: name,
        moved: `${movedCount}/${STAT_KEYS.length}`,
        pct: `${((movedCount / STAT_KEYS.length) * 100).toFixed(1)}%`,
        bar: "#".repeat(barLength),
      };
    })
  );

  const svgRing = new RingSharder(murmur3);
  for (const id of INITIAL_NODES) svgRing.addNode(id);
  const svg = renderSvgRing(INITIAL_NODES, murmur3, VISUAL_KEYS, (k) => svgRing.getNode(k));
  await mkdir("demo-output", { recursive: true });
  await writeFile("demo-output/ring.svg", svg);
  console.log("\nWrote demo-output/ring.svg (static ring diagram for embedding in the post).");
}

if (import.meta.main) {
  await main();
}
