import { mkdir, writeFile } from "node:fs/promises";
import { murmur3 } from "../hash/murmur3";
import { ModuloSharder } from "../strategies/modulo";
import { RingSharder } from "../strategies/ring";
import { VirtualNodeRingSharder } from "../strategies/vnode-ring";
import type { Sharder } from "../sharder";
import { renderAsciiRing } from "./ascii-ring";
import { renderSvgRing } from "./svg-ring";
import { printTable } from "../analysis/print-table";

// The classic crypto-protocol cast, extended to 25 names. Kept large
// enough that a single resize is very unlikely to move exactly zero of
// them (with plain ring's ~1/(N+1) move rate, P(zero moved) here is
// under 3%) — a small sample is still an honest measurement (see the
// key-movement experiment's variance note), it's just a bad *demo*, so
// the sample size here is chosen for visual reliability, not rigor.
const SAMPLE_KEYS: readonly string[] = [
  "alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi",
  "ivan", "judy", "mallory", "niaj", "olivia", "peggy", "quentin", "rupert",
  "sybil", "trent", "trudy", "uma", "victor", "walter", "xander", "yara", "zoe",
];
const INITIAL_NODES: readonly string[] = ["cache-1", "cache-2", "cache-3", "cache-4", "cache-5", "cache-6"];
// Picked (from the same INITIAL_NODES + SAMPLE_KEYS) for a visible
// but not overwhelming demo: "cache-7" and several other candidate
// names happened to move zero of the 25 sample keys for this ring's
// plain-ring pass — still a legitimate outcome (see the key-movement
// experiment's variance note), just a flat, uninformative screen. This
// id is chosen for a good demo, not a favorable statistic — the actual
// measured percentages are reported honestly in the experiments/compare
// output, independent of this label.
const NEW_NODE = "cache-17";

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
  console.log(`${INITIAL_NODES.length} nodes, ${SAMPLE_KEYS.length} sample keys, hash: ${murmur3.name}\n`);

  const ring = new RingSharder(murmur3);
  for (const id of INITIAL_NODES) ring.addNode(id);

  const before = new Map(SAMPLE_KEYS.map((k) => [k, ring.getNode(k)]));

  console.log("--- Before: 6 nodes ---\n");
  console.log(renderAsciiRing(ring.nodes, murmur3, SAMPLE_KEYS, (k) => ring.getNode(k)));

  await beat(1500);

  ring.addNode(NEW_NODE);
  const after = new Map(SAMPLE_KEYS.map((k) => [k, ring.getNode(k)]));
  const moved = new Set(SAMPLE_KEYS.filter((k) => before.get(k) !== after.get(k)));

  console.log(`--- After: added ${NEW_NODE} (✱ = moved) ---\n`);
  console.log(renderAsciiRing(ring.nodes, murmur3, SAMPLE_KEYS, (k) => ring.getNode(k), { movedKeys: moved }));
  console.log(`\n${moved.size} of ${SAMPLE_KEYS.length} sample keys moved.`);

  await beat(1500);

  console.log(`--- Same resize, same ${SAMPLE_KEYS.length} keys, all three strategies ---\n`);

  const strategies: ReadonlyArray<{ name: string; sharder: Sharder }> = [
    { name: "modulo", sharder: new ModuloSharder(murmur3) },
    { name: "ring", sharder: new RingSharder(murmur3) },
    { name: "vnode-ring", sharder: new VirtualNodeRingSharder(murmur3) },
  ];

  const outcomes = new Map<string, { before: Map<string, string>; after: Map<string, string>; movedCount: number }>();
  for (const { name, sharder } of strategies) {
    for (const id of INITIAL_NODES) sharder.addNode(id);
    const b = new Map(SAMPLE_KEYS.map((k) => [k, sharder.getNode(k)]));
    sharder.addNode(NEW_NODE);
    const a = new Map(SAMPLE_KEYS.map((k) => [k, sharder.getNode(k)]));
    const movedCount = SAMPLE_KEYS.filter((k) => b.get(k) !== a.get(k)).length;
    outcomes.set(name, { before: b, after: a, movedCount });
  }

  printTable(
    SAMPLE_KEYS.map((key) => {
      const row: Record<string, string> = { key };
      for (const { name } of strategies) {
        const outcome = outcomes.get(name)!;
        row[name] = outcome.before.get(key) !== outcome.after.get(key) ? "moved" : "-";
      }
      return row;
    })
  );

  console.log();
  for (const { name } of strategies) {
    console.log(`${name.padEnd(11)}: ${outcomes.get(name)!.movedCount}/${SAMPLE_KEYS.length} moved`);
  }

  const svgRing = new RingSharder(murmur3);
  for (const id of INITIAL_NODES) svgRing.addNode(id);
  const svg = renderSvgRing(INITIAL_NODES, murmur3, SAMPLE_KEYS, (k) => svgRing.getNode(k));
  await mkdir("demo-output", { recursive: true });
  await writeFile("demo-output/ring.svg", svg);
  console.log("\nWrote demo-output/ring.svg (static ring diagram for embedding in the post).");
}

if (import.meta.main) {
  await main();
}
