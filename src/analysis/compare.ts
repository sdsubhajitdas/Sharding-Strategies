import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { run as runHashQuality } from "./hash-quality";
import { run as runKeyMovement } from "./key-movement";
import { run as runNaiveReshard } from "./naive-reshard";
import { run as runLoadBalance } from "./load-balance";
import { run as runNodeFailure } from "./node-failure";
import { run as runVnodeSweep } from "./vnode-sweep";
import { run as runWeightedNodes } from "./weighted-nodes";
import { printTable } from "./print-table";
import { toCsv } from "./csv";
import { toMarkdownTable } from "./markdown-table";
import type { ExperimentRow } from "./types";

interface NamedRun {
  title: string;
  rows: ExperimentRow[];
}

/** Flattens one ExperimentRow into a single printable/tabular record. */
function toTableRecord(r: ExperimentRow): Record<string, string | number> {
  return { strategy: r.strategy, hashFn: r.hashFn, ...r.params, ...r.metrics };
}

function machineInfo(): string[] {
  const cpus = os.cpus();
  return [
    `- Bun: ${Bun.version}`,
    `- OS: ${os.platform()} ${os.release()} (${os.arch()})`,
    `- CPU: ${cpus[0]?.model ?? "unknown"} x${cpus.length}`,
    `- Memory: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`,
  ];
}

function buildResultsMarkdown(runs: readonly NamedRun[], startedAt: Date): string {
  const lines: string[] = [
    "# Results",
    "",
    `Captured: ${startedAt.toISOString()}`,
    "",
    "Reproduce with:",
    "",
    "```sh",
    "bun run compare",
    "```",
    "",
    "## Machine",
    "",
    ...machineInfo(),
    "",
  ];

  for (const { title, rows } of runs) {
    lines.push(`## ${title}`, "", toMarkdownTable(rows.map(toTableRecord)), "");
  }

  return lines.join("\n");
}

/**
 * Runs every experiment against the identical strategy/hash-function
 * matrix and produces one comparison: console tables (for a quick look),
 * `analysis/results.csv` (raw data), and `analysis/RESULTS.md` (the
 * pasteable, human-readable version with machine details and the exact
 * repro command).
 */
async function main(): Promise<void> {
  const startedAt = new Date();

  const runs: NamedRun[] = [
    { title: "Hash quality (1000 buckets, 1M keys)", rows: runHashQuality() },
    { title: "Key movement on scale-out (8 -> 9 nodes, 1M keys)", rows: runKeyMovement() },
    { title: "Naive reshard: failed reads (8 -> 9 nodes, 1M keys)", rows: runNaiveReshard() },
    { title: "Load balance (8-node fixed topology, 1M keys)", rows: runLoadBalance() },
    { title: "Node failure (3-node topology)", rows: runNodeFailure() },
    { title: "Vnode sweep (vnode-ring only)", rows: runVnodeSweep() },
    { title: "Weighted nodes (vnode-ring only)", rows: runWeightedNodes() },
  ];

  for (const { title, rows } of runs) {
    console.log(`\n=== ${title} ===`);
    printTable(rows.map(toTableRecord));
  }

  const allRows = runs.flatMap((r) => r.rows);

  await mkdir("analysis", { recursive: true });
  await writeFile("analysis/results.csv", toCsv(allRows));
  await writeFile("analysis/RESULTS.md", buildResultsMarkdown(runs, startedAt));

  console.log("\nWrote analysis/results.csv and analysis/RESULTS.md");
}

if (import.meta.main) {
  await main();
}
