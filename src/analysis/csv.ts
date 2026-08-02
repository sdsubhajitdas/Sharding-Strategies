import type { ExperimentRow } from "./types";

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * One row per ExperimentRow, with `params`/`metrics` serialized as JSON
 * in their own columns rather than flattened — different experiments
 * measure different things, so a fixed flat column set would either
 * force every experiment into the same shape or leave most cells empty.
 */
export function toCsv(rows: readonly ExperimentRow[]): string {
  const header = "experiment,strategy,hashFn,params,metrics";
  const lines = rows.map((r) =>
    [r.experiment, r.strategy, r.hashFn, JSON.stringify(r.params), JSON.stringify(r.metrics)].map(csvField).join(",")
  );
  return [header, ...lines].join("\n") + "\n";
}
