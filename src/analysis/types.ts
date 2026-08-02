/**
 * One row per (experiment, strategy, hashFn) combination. `params` documents
 * what varied for this row (node counts, vnode count, ...); `metrics` is an
 * open bag because different experiments measure fundamentally different
 * things (percent moved, CoV, ops/sec, ...) — forcing them into one rigid
 * shape would just hide the numbers behind more indirection.
 */
export interface ExperimentRow {
  experiment: string;
  strategy: string;
  hashFn: string;
  params: Record<string, string | number>;
  metrics: Record<string, number>;
}
